const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🔧 Initializing database...');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS keywords (
                id SERIAL PRIMARY KEY,
                keyword VARCHAR(255) NOT NULL,
                domain VARCHAR(255) NOT NULL,
                country VARCHAR(100) NOT NULL,
                target_url TEXT NOT NULL,
                search_volume INTEGER,
                current_rank INTEGER,
                previous_rank INTEGER,
                last_checked TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(keyword, domain, country)
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS ranking_history (
                id SERIAL PRIMARY KEY,
                keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
                rank INTEGER NOT NULL,
                checked_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_keywords_domain ON keywords(domain);
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_keywords_country ON keywords(country);
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ranking_history_keyword_id ON ranking_history(keyword_id);
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ranking_history_checked_at ON ranking_history(checked_at);
        `);
        
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function testConnection() {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Database connected:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

module.exports = {
    pool,
    initDatabase,
    testConnection
};