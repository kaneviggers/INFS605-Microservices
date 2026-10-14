const express = require('express')
const app = express()
app.use(express.json())

const { pool, initDb } = require('./db')

// Health endpoint for container
app.get('/health', (req, res) => {
    res.status(200).json()
})

// Get all students
app.get('/students', async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM students`);
    res.json(rows);
})

// Create a new student
app.post('/students', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: "Request body requried" })
    const { name, email, degree } = req.body;
    if (!name || !email || !degree) return res.status(400).json({ error: "name, email and degree are required" });
    try {
        const { rows } = await pool.query(`INSERT INTO students (name, email, degree) VALUES ($1, $2, $3) RETURNING student_id, name, email, degree`, [name, email, degree])
        res.status(201).json(rows[0]);
    } catch (err) {
        // If it already exists
        if (err.code === '23505') return res.status(409).json({ error: 'student with that email already exists' });
        throw err;
    }
})

// Get a student
app.get('/students/:student_id', async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM students WHERE student_id = $1`, [req.params.student_id]);
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
})

// Update a student
app.patch('/students/:student_id', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: "Request body requried" })

    const { name, email, degree } = req.body;
    if (!name && !email && !degree) return res.status(400).json({ error: 'one of either name, email and degree are required' })

    try {
        const { rows } = await pool.query(
            `UPDATE students
            SET name = COALESCE($1, name),
                email = COALESCE($2, email),
                degree = COALESCE($3, degree)
            WHERE student_id = $4
            RETURNING student_id, name, email, degree`, [name, email, degree, req.params.student_id]
        );
        if (rows.length == 0) return res.status(404).end();
        res.json(rows[0])
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'student with that email already exists' });
        throw err;
    }
})

// Delete a student
app.delete(`/students/:student_id`, async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM students WHERE student_id = $1`, [req.params.student_id]);
    res.status(rowCount ? 204 : 404).end();
})

const PORT = process.env.PORT || 3000;
initDb()
    .then(() => app.listen(PORT, () => console.log(`students-service listening on ${PORT}`)))
    .catch(err => {
        console.error(err);
        process.exit(1);
    })