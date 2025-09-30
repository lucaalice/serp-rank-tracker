const express = require('express');
const path = require('path');
const { pool, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Store worker progress in memory
let workerProgress = {
    isRunning: false,
    totalKeywords: 0,
    checkedKeywords: 0,
    errors: 0,
    startTime: null,
    lastUpdate: null,
    currentKeyword: null
};

// Middleware
app.use(express.json({ limit: '50mb' }));

// Initialize database on startup
initDatabase().catch(console.error);

// === EXPLICIT STATIC FILE ROUTES (BEFORE API ROUTES) ===

// Explicitly serve app.js with correct MIME type
app.get('/app.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'app.js'));
});

// Serve index.html explicitly
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// === API ENDPOINTS ===

app.get('/api/summary', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_keywords,
                AVG(CASE WHEN current_rank IS NOT NULL THEN current_rank END) as average_rank,
                COUNT(CASE WHEN current_rank <= 10 THEN 1 END) as top_10_count,
                MAX(last_checked) as last_checked
            FROM keywords
        `);
        
        const summary = {
            totalKeywords: parseInt(result.rows[0].total_keywords),
            averageRank: parseFloat(result.rows[0].average_rank) || null,
            top10Count: parseInt(result.rows[0].top_10_count),
            lastChecked: result.rows[0].last_checked
        };
        
        res.json(summary);
    } catch (error) {
        console.error('Error fetching summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary data' });
    }
});

app.get('/api/keywords', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id,
                keyword,
                domain,
                country,
                target_url,
                current_rank,
                previous_rank,
                search_volume,
                last_checked,
                (CASE 
                    WHEN previous_rank IS NOT NULL AND current_rank IS NOT NULL 
                    THEN current_rank - previous_rank 
                    ELSE 0 
                END) as rank_change
            FROM keywords
            ORDER BY current_rank ASC NULLS LAST, keyword ASC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching keywords:', error);
        res.status(500).json({ error: 'Failed to fetch keywords' });
    }
});

app.post('/api/keywords/bulk', async (req, res) => {
    const { domain, country, keywords } = req.body;
    
    if (!domain || !country || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: 'Invalid input data' });
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const insertPromises = keywords.map(async (kw) => {
            const { keyword, target_url, search_volume } = kw;
            
            if (!keyword || !target_url || !search_volume) {
                throw new Error('Each keyword must have keyword, target_url, and search_volume');
            }
            
            return client.query(
                `INSERT INTO keywords (keyword, domain, country, target_url, search_volume, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (keyword, domain, country) DO NOTHING`,
                [keyword, domain, country, target_url, parseInt(search_volume)]
            );
        });
        
        await Promise.all(insertPromises);
        await client.query('COMMIT');
        
        res.json({ success: true, message: `Added ${keywords.length} keywords` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding keywords:', error);
        res.status(500).json({ error: error.message || 'Failed to add keywords' });
    } finally {
        client.release();
    }
});

app.delete('/api/keywords/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        await client.query('DELETE FROM ranking_history WHERE keyword_id = $1', [id]);
        const result = await client.query('DELETE FROM keywords WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Keyword not found' });
        }
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'Keyword deleted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting keyword:', error);
        res.status(500).json({ error: 'Failed to delete keyword' });
    } finally {
        client.release();
    }
});

app.get('/api/history/:keywordId', async (req, res) => {
    const { keywordId } = req.params;
    
    try {
        const result = await pool.query(
            `SELECT rank, checked_at 
             FROM ranking_history 
             WHERE keyword_id = $1 
             ORDER BY checked_at ASC`,
            [keywordId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch ranking history' });
    }
});

app.get('/api/worker/progress', (req, res) => {
    res.json(workerProgress);
});

app.post('/api/worker/progress', (req, res) => {
    const { isRunning, totalKeywords, checkedKeywords, errors, currentKeyword } = req.body;
    
    workerProgress = {
        isRunning: isRunning !== undefined ? isRunning : workerProgress.isRunning,
        totalKeywords: totalKeywords !== undefined ? totalKeywords : workerProgress.totalKeywords,
        checkedKeywords: checkedKeywords !== undefined ? checkedKeywords : workerProgress.checkedKeywords,
        errors: errors !== undefined ? errors : workerProgress.errors,
        currentKeyword: currentKeyword !== undefined ? currentKeyword : workerProgress.currentKeyword,
        startTime: isRunning && !workerProgress.isRunning ? Date.now() : workerProgress.startTime,
        lastUpdate: Date.now()
    };
    
    res.json({ success: true });
});

app.get('/api/sistrix/visibility/:domain', async (req, res) => {
    const { domain } = req.params;
    const { country } = req.query;
    
    const SISTRIX_API_KEY = process.env.SISTRIX_API_KEY || 'C9mgcKkBFYz75TxSeAYkpEHdbKrvkmV6Lg9T';
    
    try {
        const axios = require('axios');
        
        const countryMap = {
            'United States': 'us',
            'United Kingdom': 'uk',
            'France': 'fr',
            'Germany': 'de',
            'Spain': 'es',
            'Italy': 'it'
        };
        
        const countryCode = countryMap[country] || 'us';
        
        const response = await axios.get('https://api.sistrix.com/domain.sichtbarkeitsindex', {
            params: {
                api_key: SISTRIX_API_KEY,
                domain: domain,
                country: countryCode,
                format: 'json'
            },
            timeout: 10000
        });
        
        if (response.data && response.data.answer && response.data.answer[0]) {
            const data = response.data.answer[0].sichtbarkeitsindex || [];
            res.json(data);
        } else {
            res.json([]);
        }
        
    } catch (error) {
        console.error('Sistrix API error:', error.message);
        res.status(500).json({ error: 'Failed to fetch Sistrix data', message: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route - MUST BE LAST
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});