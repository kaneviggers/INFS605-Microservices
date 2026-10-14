const express = require('express')
const app = express()
app.use(express.json())

const { pool, initDb } = require('./db')

// TODO: Implement Zod for payload validation

// Health endpoint for container
app.get('/health', (req, res) => {
    res.status(200).json()
})

// Get all courses
app.get('/courses', async (req, res) => {
    const {rows} = await pool.query(`
        SELECT c.course_code, c.title, COALESCE(array_agg(e.student_id) FILTER (WHERE e.student_id IS NOT NULL), '{}') AS student_ids
        FROM courses c
        LEFT JOIN enrolments e USING (course_code)
        GROUP BY c.course_code`);
    res.json(rows)
})

// Get a course by course_code
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

// Update a course
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

// Delete a course
app.delete(`/courses/:course_code`, async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM courses WHERE course_code = $1`, [req.params.course_code]);
    res.status(rowCount ? 204 : 404).end();
})

// Create a course
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

// Enroll a student
app.post('/courses/:course_code/students', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: "Request body requried" })
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: "student_id is required" });
    
    // Check if student exists
    try {
        const resp = await fetch(`http://students-service:3000/students/${student_id}`);
        if (resp.status === 404) return res.status(resp.status).json({ error: "student not found" });
        if (!resp.ok) return res.status(resp.status).json({ error: "students-service error" });
    } catch (err) {
        // This would be a network failure
        res.send(502).json({ error: "students-service unavailable" });
    }

    // Add student to course
    try {
        await pool.query(`
            INSERT INTO enrolments (course_code, student_id) VALUES ($1, $2)`,
        [req.params.course_code, student_id]);
        res.status(201).json({ course_code: req.params.course_code, student_id });
    } catch (err) {
        if (err.code === '23503') return res.status(404).end();
        if (err.code === '23505') return res.status(409).end();
    }
})

// Unenroll a student
app.delete('/courses/:course_code/students/:student_id', async (req, res) => {
    const { course_code, student_id } = req.params;
    
    // Check if student exists
    try {
        const resp = await fetch(`http://students-service:3000/students/${student_id}`);
        if (resp.status === 404) return res.status(resp.status).json({ error: "student not found" });
        if (!resp.ok) return res.status(resp.status).json({ error: "students-service error" });
    } catch (err) {
        // This would be a network failure
        res.send(502).json({ error: "students-service unavailable" });
    }

    // Remove the student from the course
    const { rowCount } = await pool.query(`
            DELETE FROM enrolments WHERE course_code = $1 AND student_id = $2`,
        [course_code, student_id]);
    res.status(rowCount ? 204 : 404).end();
})

// Returns http code of if the student is enrolled
app.get('/courses/:course_code/students/:student_id', async (req, res) => {
    const { course_code, student_id } = req.params;
    
    // Check if student exists
    try {
        const resp = await fetch(`http://students-service:3000/students/${student_id}`);
        if (resp.status === 404) return res.status(resp.status).json({ error: "student not found" });
        if (!resp.ok) return res.status(resp.status).json({ error: "students-service error" });
    } catch (err) {
        // This would be a network failure
        res.send(502).json({ error: "students-service unavailable" });
    }

    // See if there is a student enrolled
    const { rowCount } = await pool.query(`
            SELECT * FROM enrolments WHERE course_code = $1 AND student_id = $2`,
        [course_code, student_id]);
    res.status(rowCount ? 200 : 404).end();
})

const PORT = process.env.PORT || 3000;
initDb()
    .then(() => app.listen(PORT, () => console.log(`course-catalogue service listening on ${PORT}`)))
    .catch(err => {
        console.error(err);
        process.exit(1);
    })