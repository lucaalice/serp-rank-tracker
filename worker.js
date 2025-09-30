const axios = require('axios');
const { pool, initDatabase } = require('./database');

const VALUESERP_API_KEY = process.env.VALUESERP_API_KEY;
const VALUESERP_API_URL = 'https://api.valueserp.com/search';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Rate limiting configuration
const MAX_REQUESTS_PER_MINUTE = 50; // Adjust based on your ValueSERP plan
const DELAY_BETWEEN_REQUESTS = Math.ceil(60000 / MAX_REQUESTS_PER_MINUTE); // ms
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

const COUNTRY_DOMAINS = {
    'United States': 'google.com',
    'United Kingdom': 'google.co.uk',
    'France': 'google.fr',
    'Germany': 'google.de',
    'Spain': 'google.es',
    'Italy': 'google.it'
};

async function updateProgress(data) {
    try {
        await axios.post(`${SERVER_URL}/api/worker/progress`, data, {
            timeout: 5000
        });
    } catch (error) {
        console.error('Failed to update progress:', error.message);
        // Don't fail the whole job if progress update fails
    }
}

async function checkRankings() {
    console.log('🔍 Starting ranking check...');
    console.log(`⏱️  Rate limit: ${MAX_REQUESTS_PER_MINUTE} requests/minute (${DELAY_BETWEEN_REQUESTS}ms delay)`);
    
    if (!VALUESERP_API_KEY) {
        console.error('❌ VALUESERP_API_KEY not set in environment variables');
        process.exit(1);
    }
    
    let checked = 0;
    let errors = 0;
    let skipped = 0;
    const startTime = Date.now();
    
    try {
        await initDatabase();
        
        // Get keywords ordered by last checked (oldest first, null first)
        const result = await pool.query(
            'SELECT * FROM keywords ORDER BY last_checked ASC NULLS FIRST'
        );
        const keywords = result.rows;
        
        if (keywords.length === 0) {
            console.log('ℹ️  No keywords to check');
            await updateProgress({ 
                isRunning: false, 
                totalKeywords: 0, 
                checkedKeywords: 0 
            });
            return;
        }
        
        console.log(`📊 Found ${keywords.length} keywords to check`);
        
        // Initialize progress
        await updateProgress({
            isRunning: true,
            totalKeywords: keywords.length,
            checkedKeywords: 0,
            errors: 0,
            currentKeyword: null
        });
        
        // Process keywords with rate limiting
        for (let i = 0; i < keywords.length; i++) {
            const kw = keywords[i];
            
            try {
                // Update current keyword being checked
                await updateProgress({
                    currentKeyword: `${kw.keyword} (${kw.domain})`,
                    checkedKeywords: checked,
                    errors: errors
                });
                
                console.log(`[${i + 1}/${keywords.length}] Checking: ${kw.keyword} (${kw.domain})`);
                
                // Check rank with retries
                const rank = await getRankForKeywordWithRetry(kw);
                
                if (rank === null) {
                    console.log(`   ⚠️  Not found in top 100`);
                } else {
                    console.log(`   ✓ Rank: ${rank}`);
                }
                
                await updateKeywordRank(kw.id, rank);
                checked++;
                
                // Update progress
                await updateProgress({
                    checkedKeywords: checked,
                    errors: errors
                });
                
                // Rate limiting: wait before next request
                if (i < keywords.length - 1) {
                    await delay(DELAY_BETWEEN_REQUESTS);
                }
                
            } catch (error) {
                errors++;
                console.error(`   ✗ Error: ${error.message}`);
                
                // Update error count
                await updateProgress({
                    checkedKeywords: checked,
                    errors: errors
                });
                
                // If it's a rate limit error, wait longer
                if (error.message.includes('429') || error.message.includes('rate limit')) {
                    console.log('   ⏸️  Rate limit hit, waiting 60 seconds...');
                    await delay(60000);
                }
            }
        }
        
        // Mark as complete
        await updateProgress({
            isRunning: false,
            checkedKeywords: checked,
            errors: errors,
            currentKeyword: null
        });
        
        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        
        console.log(`\n✅ Ranking check complete!`);
        console.log(`   Duration: ${duration} minutes`);
        console.log(`   Successfully checked: ${checked}`);
        console.log(`   Errors: ${errors}`);
        console.log(`   Skipped: ${skipped}`);
        
    } catch (error) {
        console.error('❌ Fatal error during ranking check:', error);
        await updateProgress({ 
            isRunning: false,
            errors: errors + 1
        });
        process.exit(1);
    } finally {
        await pool.end();
    }
}

async function getRankForKeywordWithRetry(keyword, attempt = 1) {
    try {
        return await getRankForKeyword(keyword);
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            console.log(`   ⟳ Retry ${attempt}/${MAX_RETRIES} after ${RETRY_DELAY}ms...`);
            await delay(RETRY_DELAY);
            return await getRankForKeywordWithRetry(keyword, attempt + 1);
        }
        throw error;
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
                num: 100
            },
            timeout: 30000
        });
        
        // Check for API errors
        if (response.data.request_info?.success === false) {
            throw new Error(`API Error: ${response.data.request_info?.message || 'Unknown error'}`);
        }
        
        if (!response.data || !response.data.organic_results) {
            throw new Error('Invalid API response - missing organic_results');
        }
        
        const results = response.data.organic_results;
        const targetDomain = keyword.domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
        
        // Search for domain in results
        for (let i = 0; i < results.length; i++) {
            const resultUrl = results[i].link || '';
            const resultDomain = resultUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            
            if (resultDomain.includes(targetDomain) || targetDomain.includes(resultDomain)) {
                return i + 1;
            }
        }
        
        return null; // Not found in top 100
        
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            
            if (status === 429) {
                throw new Error(`Rate limit exceeded (429)`);
            } else if (status === 401) {
                throw new Error(`Invalid API key (401)`);
            } else if (status === 403) {
                throw new Error(`API access forbidden (403)`);
            } else {
                throw new Error(`API Error (${status}): ${errorData?.error || 'Unknown error'}`);
            }
        }
        throw error;
    }
}

async function updateKeywordRank(keywordId, newRank) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get current rank
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
        
        // Add to history (only if ranked)
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

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('⚠️  SIGTERM received, shutting down gracefully...');
    await updateProgress({ isRunning: false });
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('⚠️  SIGINT received, shutting down gracefully...');
    await updateProgress({ isRunning: false });
    process.exit(0);
});

// Start the worker
checkRankings().catch(async error => {
    console.error('❌ Worker failed:', error);
    await updateProgress({ isRunning: false });
    process.exit(1);
});