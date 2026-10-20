import express, { type Response } from "express";

import { pool, initDb } from "./db";

// Payload validation types
import { post_student, patch_student } from "./types";
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

// Get all students
app.get("/students", async (req, res) => {
  const result = await query_database(`SELECT * FROM students`, res);
  if (!result) return;

  return res.json(result.rows);
});

// Create a new student
app.post("/students", async (req, res) => {
  const data = validate_payload(req.body, post_student, res) as z.infer<
    typeof post_student
  >;
  if (!data) return;

  const result = await query_database(
    `INSERT INTO students (name, email, degree) VALUES ($1, $2, $3) RETURNING student_id, name, email, degree`,
    res,
    [data.name, data.email, data.degree],
    { "23505": [409, "student with that email already exists"] },
  );
  if (!result) return;

  return res.status(201).json(result.rows[0]);
});

// Get a student
app.get("/students/:student_id", async (req, res) => {
  const { student_id } = req.params;

  if (Number.isNaN(parseInt(student_id))) return res.status(400).json({ error: 'invalid id' })

  const result = await query_database(
    `SELECT * FROM students WHERE student_id = $1`,
    res,
    [student_id],
  );
  if (!result) return;

  if (!result.rowCount) return res.status(404).end();
  return res.json(result.rows[0]);
});

// Update a student
app.patch("/students/:student_id", async (req, res) => {
  const data = validate_payload(req.body, patch_student, res) as z.infer<
    typeof patch_student
  >;
  if (!data) return;

  const { student_id } = req.params;

  if (Number.isNaN(parseInt(student_id))) return res.status(400).json({ error: 'invalid id' })

  const result = await query_database(
    `UPDATE students
            SET name = COALESCE($1, name),
                email = COALESCE($2, email),
                degree = COALESCE($3, degree)
            WHERE student_id = $4
            RETURNING student_id, name, email, degree`,
    res,
    [data.name, data.email, data.degree, student_id],
    { "23505": [409, "student with that email already exists"] },
  );
  if (!result) return;

  if (!result.rowCount) return res.status(404).end();
  return res.json(result.rows[0]);
});

// Delete a student
app.delete(`/students/:student_id`, async (req, res) => {

  const { student_id } = req.params;

  if (Number.isNaN(parseInt(student_id))) return res.status(400).json({ error: 'invalid id' })

  const result = await query_database(
    `DELETE FROM students WHERE student_id = $1`,
    res,
    [student_id],
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
        console.log(`students-catalogue service listening on ${PORT}`),
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
