import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS courses (
                course_code text PRIMARY KEY,
                title       text NOT NULL
            );
            CREATE TABLE IF NOT EXISTS enrolments (
                course_code text NOT NULL REFERENCES courses ON DELETE CASCADE,
                student_id  text NOT NULL,
                PRIMARY KEY (course_code, student_id)
            );
        `);
        console.log(`Formatted courses and enrolments tables`)
    } catch (err) {
        console.warn('Database not ready')
        throw err
    }
}