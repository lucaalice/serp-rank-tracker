const axios = require('axios');
const { pool, initDatabase } = require('./database');

const VALUESERP_API_KEY = process.env.VALUESERP_API_KEY;
const VALUESERP_API_URL = 'https://api.valueserp.com/search';

// Country to Google domain mapping
const COUNTRY_DOMAINS = {
    'United States': 'google.com',
    'United Kingdom': 'google.co.uk',
    'France': 'google.fr',
    'Germany': 'google.de',
    'Spain': 'google.es',
    'Italy': 'google.it'
};

async function checkRankings() {
    console.log('🔍 Starting ranking check...');
    
    if (!VALUESERP_API_KEY) {
        console.error('❌ VALUESERP_API_KEY not set in environment variables');
        process.exit(1);
    }
    
    try {
        // Initialize database
        await initDatabase();
        
        // Get all keywords to check
        const result = await pool.query('SELECT * FROM keywords ORDER BY last_checked ASC NULLS FIRST');
        const keywords = result.rows;
        
        if (keywords.length === 0) {
            console.log('ℹ️  No keywords to check');
            return;
        }
        
        console.log(`📊 Checking ${keywords.length} keywords...`);
        
        let checked = 0;
        let errors = 0;
        
        // Process keywords with delay to respect API rate limits
        for (const kw of keywords) {
            try {
                const rank = await getRankForKeyword(kw);
                await updateKeywordRank(kw.id, rank);
                checked++;
                
                console.log(`✓ ${kw.keyword} (${kw.domain}): Rank ${rank || 'Not Found'}`);
                
                // Add delay between requests (1 second)
                await delay(1000);
            } catch (error) {
                console.error(`✗ Error checking ${kw.keyword}:`, error.message);
                errors++;
            }
        }
        
        console.log(`\n✅ Ranking check complete!`);
        console.log(`   Successfully checked: ${checked}`);
        console.log(`   Errors: ${errors}`);
        
    } catch (error) {
        console.error('❌ Fatal error during ranking check:', error);
        process.exit(1);
    } finally {
        // Close database connection
        await pool.end();
    }
}

async function getRankForKeyword(keyword) {
    const googleDomain = COUNTRY_DOMAINS[keyword.country] || 'google.com';
    
    try {
        const response = await axios.get(VALUESERP_API_URL, {
            params: {
                api_key: VALUESERP_API_KEY,
                q: keyword.keyword,
                location: keyword.country,
                google_domain: googleDomain,
                gl: getCountryCode(keyword.country),
                num: 100 // Check top 100 results
            },
            timeout: 30000 // 30 second timeout
        });
        
        if (!response.data || !response.data.organic_results) {
            throw new Error('Invalid API response');
        }
        
        // Find the rank of the target domain
        const results = response.data.organic_results;
        const targetDomain = keyword.domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
        
        for (let i = 0; i < results.length; i++) {
            const resultUrl = results[i].link || '';
            const resultDomain = resultUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            
            if (resultDomain.includes(targetDomain) || targetDomain.includes(resultDomain)) {
                return i + 1; // Rank is position + 1
            }
        }
        
        return null; // Not found in top 100
    } catch (error) {
        if (error.response) {
            throw new Error(`API Error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`);
        }
        throw error;
    }
}

async function updateKeywordRank(keywordId, newRank) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get current rank to set as previous rank
        const currentResult = await client.query(
            'SELECT current_rank FROM keywords WHERE id = $1',
            [keywordId]
        );
        
        const currentRank = currentResult.rows[0]?.current_rank;
        
        // Update keyword with new rank
        await client.query(
            `UPDATE keywords 
             SET current_rank = $1, 
                 previous_rank = $2, 
                 last_checked = NOW() 
             WHERE id = $3`,
            [newRank, currentRank, keywordId]
        );
        
        // Add to ranking history (only if rank was found)
        if (newRank !== null) {
            await client.query(
                'INSERT INTO ranking_history (keyword_id, rank, checked_at) VALUES ($1, $2, NOW())',
                [keywordId, newRank]
            );
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function getCountryCode(country) {
    const codes = {
        'United States': 'us',
        'United Kingdom': 'uk',
        'France': 'fr',
        'Germany': 'de',
        'Spain': 'es',
        'Italy': 'it'
    };
    return codes[country] || 'us';
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the worker
checkRankings().catch(error => {
    console.error('❌ Worker failed:', error);
    process.exit(1);
});