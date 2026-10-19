import express, { type Response } from "express";

import { pool, initDb } from "./db";

// Payload validation types
import { patch_feedback, post_feedback } from "./types";
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

// Add feedback to a course
app.post("/feedback/course/:course_code", async (req, res) => {
  const data = validate_payload(req.body, post_feedback, res) as z.infer<
    typeof post_feedback
  >;
  if (!data) return;

  const { course_code } = req.params;

  // Check if the student is enrolled in the course, this in turn checks if the student and course exists
  try {
    const resp = await fetch(
      `http://courses-service:3000/courses/${course_code}/students/${data.student_id}`,
    );
    if (resp.status === 404)
      return res
        .status(resp.status)
        .json({ error: "course or student not found" });
    if (!resp.ok)
      return res.status(resp.status).json({ error: "courses-service error" });
  } catch (err) {
    // This would be a network failure
    res.send(502).json({ error: "courses-service unavailable" });
  }

  // Add feedback to course
  try {
    const { rows } = await pool.query(
      `INSERT INTO feedback (course_code, student_id, comment) VALUES ($1, $2, $3) RETURNING feedback_id, course_code, student_id, comment`,
      [course_code, data.student_id, data.comment],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof DatabaseError) {
      // If student has already created feedback for this course
      if (err.code === "23505")
        return res.status(409).json({
          error: "student has already given feedback for this course",
        });
      else return res.status(500).json({ error: "database error" });
    } else return res.status(500).json({ error: "something went wrong" });
  }
});

// Get feedback by id
app.get("/feedback/:feedback_id", async (req, res) => {
  const { feedback_id } = req.params;

  if (Number.isNaN(parseInt(feedback_id)))
    return res.status(400).json({ error: "invalid id" });

  const { rows } = await pool.query(
    `SELECT * FROM feedback WHERE feedback_id = $1`,
    [feedback_id],
  );
  if (!rows.length) return res.status(404).end();
  res.json(rows[0]);
});

// Get all feedback for a course
app.get("/feedback/course/:course_code", async (req, res) => {
  const { course_code } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM feedback WHERE course_code = $1`,
    [course_code],
  );
  if (!rows.length) return res.status(404).end();
  res.json(rows);
});

// Update feedback
app.patch(`/feedback/:feedback_id`, async (req, res) => {
  const data = validate_payload(req.body, patch_feedback, res) as z.infer<
    typeof patch_feedback
  >;
  if (!data) return;

  const { feedback_id } = req.params;

  if (Number.isNaN(parseInt(feedback_id)))
    return res.status(400).json({ error: "invalid id" });

  const { rows } = await pool.query(
    `UPDATE feedback SET comment = $1 WHERE feedback_id = $2 RETURNING feedback_id, course_code, student_id, comment`,
    [data.comment, feedback_id],
  );
  if (rows.length == 0) return res.status(404).end();

  res.json(rows[0]);
});

// Delete feedback
app.delete(`/feedback/:feedback_id`, async (req, res) => {
  const { feedback_id } = req.params;
  if (Number.isNaN(parseInt(feedback_id)))
    return res.status(400).json({ error: "invalid id" });
  const { rowCount } = await pool.query(
    `DELETE FROM feedback WHERE feedback_id = $1`,
    [feedback_id],
  );
  res.status(rowCount ? 204 : 404).end();
});

// Only start listening when run directly (not when imported by tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  initDb()
    .then(() =>
      app.listen(PORT, () =>
        console.log(`feedback-catalogue service listening on ${PORT}`),
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
