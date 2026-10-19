import express, { type Response } from "express";

import { pool, initDb } from "./db";

// Payload validation types
import { patch_course, post_course, post_enroll } from "./types";
import * as z from "zod";
import { ZodObject } from "zod";
import { DatabaseError } from "pg";

function validate_payload(body: Object, type: ZodObject<any>, res: Response) {
  const result = type.safeParse(body);

  if (!result.success) {
    res.status(400).json({ error: JSON.parse(result.error.message) });
    return null;
  }

  return result.data;
}

export const app = express();
app.use(express.json());

// Health endpoint for container
app.get("/health", (req, res) => {
  res.status(200).json();
});

// Get all courses
app.get("/courses", async (req, res) => {
  const { rows } = await pool.query(`
        SELECT c.course_code, c.title, COALESCE(array_agg(e.student_id) FILTER (WHERE e.student_id IS NOT NULL), '{}') AS student_ids
        FROM courses c
        LEFT JOIN enrolments e USING (course_code)
        GROUP BY c.course_code`);
  res.json(rows);
});

// Get a course by course_code
app.get("/courses/:course_code", async (req, res) => {
  const { rows } = await pool.query(
    `
        SELECT c.course_code, c.title, COALESCE(array_agg(e.student_id) FILTER (WHERE e.student_id IS NOT NULL), '{}') AS student_ids
        FROM courses c
        LEFT JOIN enrolments e USING (course_code)
        WHERE c.course_code = $1
        GROUP BY c.course_code`,
    [req.params.course_code],
  );
  if (rows.length == 0) return res.status(404).end();
  res.json(rows);
});

// Update a course
app.patch(`/courses/:course_code`, async (req, res) => {
  const data = validate_payload(req.body, patch_course, res) as z.infer<
    typeof patch_course
  >;
  if (!data) return;

  const { rows } = await pool.query(
    `UPDATE courses SET title = $1 WHERE course_code = $2 RETURNING course_code, title`,
    [data.title, req.params.course_code],
  );

  if (rows.length == 0) return res.status(404).end();

  res.json(rows[0]);
});

// Delete a course
app.delete(`/courses/:course_code`, async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM courses WHERE course_code = $1`,
    [req.params.course_code],
  );
  res.status(rowCount ? 204 : 404).end();
});

// Create a course
app.post("/courses", async (req, res) => {
  const data = validate_payload(req.body, post_course, res) as z.infer<
    typeof post_course
  >;
  if (!data) return;

  try {
    const { rows } = await pool.query(
      `INSERT INTO courses (course_code, title) VALUES ($1, $2) RETURNING course_code, title`,
      [data.course_code, data.title],
    );
    res.status(201).json({ ...rows[0], student_ids: [] });
  } catch (err) {
    if (err instanceof DatabaseError) {
      // If it already exists
      if (err.code === "23505")
        return res.status(409).json({ error: "course already exists" });
      else return res.status(500).json({ error: "database error" });
    } else {
      return res.status(500).json({ error: "something went wrong" });
    }
  }
});

// Enroll a student
app.post("/courses/:course_code/students", async (req, res) => {
  const data = validate_payload(req.body, post_enroll, res) as z.infer<
    typeof post_enroll
  >;
  if (!data) return;

  const { course_code } = req.params;

  // Check if student exists
  try {
    const resp = await fetch(
      `http://students-service:3000/students/${data.student_id}`,
    );
    if (resp.status === 404)
      return res.status(resp.status).json({ error: "student not found" });
    if (!resp.ok)
      return res.status(resp.status).json({ error: "students-service error" });
  } catch (err) {
    // This would be a network failure
    res.status(502).json({ error: "students-service unavailable" });
  }

  // Add student to course
  try {
    await pool.query(
      `
            INSERT INTO enrolments (course_code, student_id) VALUES ($1, $2)`,
      [course_code, data.student_id],
    );
    res
      .status(201)
      .json({ course_code: course_code, student_id: data.student_id });
  } catch (err) {
    if (err instanceof DatabaseError) {
      if (err.code === "23503")
        return res.status(404).json({ error: "course not found" });
      if (err.code === "23505")
        return res.status(409).json({ error: "student already enrolled" });
      else return res.status(500).json({ error: "database error" });
    } else {
      return res.status(500).json({ error: "something went wrong" });
    }
  }
});

// Unenroll a student
app.delete("/courses/:course_code/students/:student_id", async (req, res) => {
  const { course_code, student_id } = req.params;

  // Check if student exists and is currently enrolled
  try {
    const resp = await fetch(
      `http://courses-service:3000/courses/${course_code}/students/${student_id}`,
    );
    if (resp.status === 404) {
      const body = await resp.json();
      return res.status(404).json(body);
    }
    if (!resp.ok)
      return res.status(resp.status).json({ error: "students-service error" });
  } catch (err) {
    // This would be a network failure
    return res.status(502).json({ error: "students-service unavailable" });
  }

  // Remove the student from the course
  const { rowCount } = await pool.query(
    `
            DELETE FROM enrolments WHERE course_code = $1 AND student_id = $2`,
    [course_code, student_id],
  );
  res.status(rowCount ? 204 : 404).end();
});

// Returns http code of if the student is enrolled
app.get("/courses/:course_code/students/:student_id", async (req, res) => {
  const { course_code, student_id } = req.params;

  // Check if student exists
  try {
    const resp = await fetch(
      `http://students-service:3000/students/${student_id}`,
    );
    if (resp.status === 404)
      return res.status(404).json({ error: "student not found" });
    if (!resp.ok)
      return res.status(resp.status).json({ error: "students-service error" });
  } catch (err) {
    // This would be a network failure
    res.status(502).json({ error: "students-service unavailable" });
  }

  // Check if course exists
  const { rowCount } = await pool.query(`SELECT * FROM courses WHERE course_code = $1`, [course_code]);
  if (!rowCount) return res.status(404).json({ error: 'course not found' })

  // See if there is a student enrolled
  const { rowCount : rowCount_enrolled } = await pool.query(
    `SELECT * FROM enrolments WHERE course_code = $1 AND student_id = $2`,
    [course_code, student_id],
  );
  res.status(rowCount_enrolled ? 200 : 404).end();
});

// Only start listening when run directly (not when imported by tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  initDb()
    .then(() =>
      app.listen(PORT, () =>
        console.log(`course-catalogue service listening on ${PORT}`),
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
