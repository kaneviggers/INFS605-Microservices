const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                feedback_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                course_code text NOT NULL,
                student_id  text NOT NULL,
                comment     text NOT NULL,
                UNIQUE (course_code, student_id)
            );
        `);
        console.log(`Formatted feedback tables`)
    } catch (err) {
        console.warn('Database not ready')
        throw err
    }
}

module.exports = { pool, initDb }