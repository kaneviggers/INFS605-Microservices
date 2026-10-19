import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                student_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                name       text NOT NULL,
                email      text NOT NULL UNIQUE,
                degree     text NOT NULL
            );
        `);
        console.log(`Formatted students tables`)
    } catch (err) {
        console.warn('Database not ready')
        throw err
    }
}