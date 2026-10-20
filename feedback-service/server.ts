import express, { type Response } from "express";

import { pool, initDb } from "./db";

// Payload validation types
import { patch_feedback, post_feedback } from "./types";
import * as z from "zod";
import { ZodObject } from "zod";
import { DatabaseError, QueryResult } from "pg";

function validate_payload(body: Object, type: ZodObject<any>, res: Response) {
  const result = type.safeParse(body);

  if (!result.success) {
    res.status(400).json({ error: JSON.parse(result.error.message) });
    return null;
  }

  return result.data;
}

async function query_database(
  query: string,
  res: Response,
  values: unknown[] = [],
  errors: Record<string, [number, string]> = {},
): Promise<QueryResult | null> {
  try {
    return await pool.query(query, values);
  } catch (err) {
    // Use the caller's status and message for known error codes, otherwise 500
    const mapped =
      err instanceof DatabaseError && err.code ? errors[err.code] : undefined;
    if (mapped) res.status(mapped[0]).json({ error: mapped[1] });
    else
      res.status(500).json({
        error:
          err instanceof DatabaseError
            ? "database error"
            : "something went wrong",
      });
    return null;
  }
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
  const result = await query_database(
    `INSERT INTO feedback (course_code, student_id, comment) VALUES ($1, $2, $3) RETURNING feedback_id, course_code, student_id, comment`,
    res,
    [course_code, data.student_id, data.comment],
    { "23505": [409, "student has already given feedback for this course"] },
  );
  if (!result) return;

  return res.status(201).json(result.rows[0]);
});

// Get feedback by id
app.get("/feedback/:feedback_id", async (req, res) => {
  const { feedback_id } = req.params;

  if (Number.isNaN(parseInt(feedback_id)))
    return res.status(400).json({ error: "invalid id" });

  const result = await query_database(
    `SELECT * FROM feedback WHERE feedback_id = $1`,
    res,
    [feedback_id],
  );
  if (!result) return;

  if (!result.rowCount) return res.status(404).end();
  return res.json(result.rows[0]);
});

// Get all feedback for a course
app.get("/feedback/course/:course_code", async (req, res) => {
  const { course_code } = req.params;
  const result = await query_database(
    `SELECT * FROM feedback WHERE course_code = $1`,
    res,
    [course_code],
  );
  if (!result) return;

  if (!result.rowCount) return res.status(404).end();
  return res.json(result.rows);
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

  const result = await query_database(
    `UPDATE feedback SET comment = $1 WHERE feedback_id = $2 RETURNING feedback_id, course_code, student_id, comment`,
    res,
    [data.comment, feedback_id],
  );
  if (!result) return;

  if (!result.rowCount) return res.status(404).end();
  return res.json(result.rows[0]);
});

// Delete feedback
app.delete(`/feedback/:feedback_id`, async (req, res) => {
  const { feedback_id } = req.params;
  if (Number.isNaN(parseInt(feedback_id)))
    return res.status(400).json({ error: "invalid id" });
  const result = await query_database(
    `DELETE FROM feedback WHERE feedback_id = $1`,
    res,
    [feedback_id],
  );
  if (!result) return;

  return res.status(result.rowCount ? 204 : 404).end();
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
