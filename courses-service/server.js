const express = require('express')
const app = express()
app.use(express.json())

const { pool, initDb } = require('./db')

// TODO: Implement Zod for payload validation

// Health endpoint for container
app.get('/health', (req, res) => {
    res.status(200).json()
})

app.get('/courses', async (req, res) => {
    const {rows} = await pool.query(`
        SELECT c.course_code, c.title, COALESCE(array_agg(e.student_id) FILTER (WHERE e.student_id IS NOT NULL), '{}') AS student_ids
        FROM courses c
        LEFT JOIN enrolments e USING (course_code)
        GROUP BY c.course_code`);
    res.json(rows)
})

app.get('/courses/:course_code', async (req, res) => {
    const {rows} = await pool.query(`
        SELECT c.course_code, c.title, COALESCE(array_agg(e.student_id) FILTER (WHERE e.student_id IS NOT NULL), '{}') AS student_ids
        FROM courses c
        LEFT JOIN enrolments e USING (course_code)
        WHERE c.course_code = $1
        GROUP BY c.course_code`, [req.params.course_code]);
    if (rows.length == 0) return res.status(404).end();
    res.json(rows)
})

app.patch(`/courses/:course_code`, async (req, res) => {

    if (!req.body) return res.status(400).json({ error: "Request body requried" })

    const { title } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' })

    const { rows } = await pool.query(
        `UPDATE courses SET title = $1 WHERE course_code = $2 RETURNING course_code, title`, [title, req.params.course_code]
    );

    if (rows.length == 0) return res.status(404).end();

    res.json(rows[0])
})

app.delete(`/courses/:course_code`, async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM courses WHERE course_code = $1`, [req.params.course_code]);
    res.status(rowCount ? 204 : 404).end();
})

app.post('/courses', async (req, res) => {

    if (!req.body) return res.status(400).json({ error: "Request body requried" })

    const { title, course_code } = req.body;

    if (!title || !course_code) return res.status(400).json({ error: "title and course_code are required" });

    try {
        const { rows } = await pool.query(`INSERT INTO courses (course_code, title) VALUES ($1, $2) RETURNING course_code, title`, [course_code, title])
        res.status(201).json({ ...rows[0], student_ids: [] });
    } catch (err) {
        // If it already exists
        if (err.code === '23505') return res.status(409).json({ error: 'course already exists' });
        throw err;
    }

})

const PORT = process.env.PORT || 3000;
initDb()
    .then(() => app.listen(PORT, () => console.log(`course-catalogue service listening on ${PORT}`)))
    .catch(err => {
        console.error(err);
        process.exit(1);
    })