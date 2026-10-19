import request from "supertest";
import { app } from "../server";
import { pool, initDb } from "../db";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const fakeResponse = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchSpy: jest.SpiedFunction<typeof fetch>;

beforeAll(async () => await initDb());

beforeEach(async () => {
  await pool.query("TRUNCATE students CASCADE");
  fetchSpy = jest.spyOn(global, "fetch");
});

afterEach(async () => jest.restoreAllMocks());
afterAll(async () => await pool.end());

describe("GET /students", () => {
  it("gets an array of all students", async () => {
    await pool.query(
      `INSERT INTO students (name, email, degree) VALUES ('Kane Viggers', 'ddh9393@autuni.ac.nz', 'Engineering'), ('Sophie Clark', 'csd7719@autuni.ac.nz', 'Communications')`,
    );

    const res = await request(app).get("/students");

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });
});

describe("POST /students", () => {
  it("creates a new student", async () => {
    const res = await request(app).post("/students").send({
      name: "Kane Viggers",
      email: "ddh9393@autuni.ac.nz",
      degree: "Engineering",
    });

    expect(res.status).toBe(201);

    const { rowCount } = await pool.query(`SELECT * FROM students`);
    expect(rowCount).toBe(1);
  });

  it("return 400 with malformed email", async () => {
    const res = await request(app).post("/students").send({
      name: "Kane Viggers",
      email: "what",
      degree: "Engineering",
    });

    expect(res.status).toBe(400);

    const { rowCount } = await pool.query(`SELECT * FROM students`);
    expect(rowCount).toBe(0);
  });

  it("return 400 with malformed body", async () => {
    const res = await request(app).post("/students").send({
      name: "Kane Viggers",
      email: "ddh9393@autuni.ac.nz",
    });

    expect(res.status).toBe(400);

    const { rowCount } = await pool.query(`SELECT * FROM students`);
    expect(rowCount).toBe(0);
  });

  it("return 400 with no body", async () => {
    const res = await request(app).post("/students");

    expect(res.status).toBe(400);
  });
});

describe("GET /students/:student_id", () => {
  let studentId: number;

  beforeEach(async () => {
    const { rows } = await pool.query(
      `INSERT INTO students (name, email, degree) VALUES ('Kane Viggers', 'ddh9393@autuni.ac.nz', 'Engineering') RETURNING student_id`,
    );
    studentId = rows[0].student_id;
  });

  it("gets a student", async () => {
    const res = await request(app).get(`/students/${studentId}`);

    expect(res.status).toBe(200);
  });

  it("returns 400 for malformed id", async () => {
    const res = await request(app).get("/students/NOPE");

    expect(res.status).toBe(400);
  });

  it("returns 404 for non existant id", async () => {
    const res = await request(app).get("/students/1234");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /students/:student_id", () => {
  let studentId: number;

  beforeEach(async () => {
    const { rows } = await pool.query(
      `INSERT INTO students (name, email, degree) VALUES ('Kane Viggers', 'ddh9393@autuni.ac.nz', 'Engineering') RETURNING student_id`,
    );
    studentId = rows[0].student_id;
  });

  it("updates a student", async () => {
    const res = await request(app).patch(`/students/${studentId}`).send({
      name: "Vane Kiggers",
    })

    expect(res.status).toBe(200);

    const { rowCount } = await pool.query(`SELECT * FROM students WHERE name = 'Vane Kiggers'`);
    expect(rowCount).toBe(1);
  });

  it("returns 400 when updating with malformed email", async () => {
    const res = await request(app).patch(`/students/${studentId}`).send({
      email: "what",
    })

    expect(res.status).toBe(400);

    const { rowCount } = await pool.query(`SELECT * FROM students WHERE email = 'what'`);
    expect(rowCount).toBe(0);
  });

  it("returns 400 when using a malformed student_id", async () => {
    const res = await request(app).patch(`/students/NOPE`).send({
      name: "Hello world",
    })

    expect(res.status).toBe(400);
  });

  it("returns 404 for non existant student", async () => {
    const res = await request(app).patch(`/students/1234`).send({
      name: "Hello world",
    })

    expect(res.status).toBe(404);
  });
});

describe("DELETE /students/:student_id", () => {
  let studentId: number;

  beforeEach(async () => {
    const { rows } = await pool.query(
      `INSERT INTO students (name, email, degree) VALUES ('Kane Viggers', 'ddh9393@autuni.ac.nz', 'Engineering') RETURNING student_id`,
    );
    studentId = rows[0].student_id;
  });

  it("deletes a student", async () => {
    const res = await request(app).delete(`/students/${studentId}`);

    expect(res.status).toBe(204);

    const { rowCount } = await pool.query(`SELECT * FROM students`);
    expect(rowCount).toBe(0);
  })

  it("returns 400 with malformed student_id", async () => {
    const res = await request(app).delete(`/students/NOPE`);

    expect(res.status).toBe(400);
  })

  it("returns 404 non existant student", async () => {
    const res = await request(app).delete(`/students/1234`);

    expect(res.status).toBe(404);
  })
})