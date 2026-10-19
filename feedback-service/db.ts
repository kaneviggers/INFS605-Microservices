import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                feedback_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                course_code text NOT NULL,
                student_id  INT NOT NULL,
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