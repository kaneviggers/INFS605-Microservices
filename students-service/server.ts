import express, { type Response } from "express";

import { pool, initDb } from "./db";

// Payload validation types
import { post_student, patch_student } from "./types";
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

// Get all students
app.get("/students", async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM students`);
  res.json(rows);
});

// Create a new student
app.post("/students", async (req, res) => {
  const data = validate_payload(req.body, post_student, res) as z.infer<
    typeof post_student
  >;
  if (!data) return;

  try {
    const { rows } = await pool.query(
      `INSERT INTO students (name, email, degree) VALUES ($1, $2, $3) RETURNING student_id, name, email, degree`,
      [data.name, data.email, data.degree],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof DatabaseError) {
      // If it already exists
      if (err.code === "23505") {
        return res
          .status(409)
          .json({ error: "student with that email already exists" });
      } else return res.status(500).json({ error: "database error" });
    } else return res.status(500).json({ error: "something went wrong" });
  }
});

// Get a student
app.get("/students/:student_id", async (req, res) => {
  const { student_id } = req.params;

  if (Number.isNaN(parseInt(student_id))) return res.status(400).json({ error: 'invalid id' })

  try {
    const { rows } = await pool.query(
      `SELECT * FROM students WHERE student_id = $1`,
      [req.params.student_id],
    );
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
  } catch (err) {
    console.log(err);
  }
});

// Update a student
app.patch("/students/:student_id", async (req, res) => {
  const data = validate_payload(req.body, patch_student, res) as z.infer<
    typeof patch_student
  >;
  if (!data) return;

  const { student_id } = req.params;

  if (Number.isNaN(parseInt(student_id))) return res.status(400).json({ error: 'invalid id' })

  try {
    const { rows } = await pool.query(
      `UPDATE students
            SET name = COALESCE($1, name),
                email = COALESCE($2, email),
                degree = COALESCE($3, degree)
            WHERE student_id = $4
            RETURNING student_id, name, email, degree`,
      [data.name, data.email, data.degree, student_id],
    );
    if (rows.length == 0) return res.status(404).end();
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof DatabaseError) {
      // Student with that email already exists
      if (err.code === "23505")
        return res
          .status(409)
          .json({ error: "student with that email already exists" });
      else return res.status(500).json({ error: "database error" });
    } else return res.status(500).json({ error: "something went wrong" });
  }
});

// Delete a student
app.delete(`/students/:student_id`, async (req, res) => {

  const { student_id } = req.params;

  if (Number.isNaN(parseInt(student_id))) return res.status(400).json({ error: 'invalid id' })

  const { rowCount } = await pool.query(
    `DELETE FROM students WHERE student_id = $1`,
    [req.params.student_id],
  );
  res.status(rowCount ? 204 : 404).end();
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
