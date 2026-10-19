import request from "supertest";
import { app } from "./server";
import { pool, initDb } from "./db";
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
  await pool.query("TRUNCATE courses, enrolments CASCADE");
  fetchSpy = jest.spyOn(global, "fetch");
});

afterEach(async () => jest.restoreAllMocks());
afterAll(async () => await pool.end());

describe("POST /courses", () => {

  it("creates a course", async () => {
    const res = await request(app)
      .post("/courses")
      .send({ title: "Microservices", course_code: "INFS605" });
    expect(res.status).toBe(201);
  });

  it("return 400 when missing a parameter", async () => {
    const res = await request(app)
      .post("/courses")
      .send({ title: "Microservices" });
    expect(res.status).toBe(400);
  });

  it("return 400 when missing request body", async () => {
    const res = await request(app)
      .post("/courses")
    expect(res.status).toBe(400);
  });
});

describe("GET /courses", () => {
  it("gets all courses", async () => {
    await pool.query(
      `INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices'), ('ENGE803', 'Innovation Management')`,
    );

    const res = await request(app).get("/courses");
    expect(res.status).toBe(200);
  });
});

describe("GET /courses/:course_code", () => {

  beforeEach(async () => {
    await pool.query(
      `INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices')`,
    );
  })

  it("gets a course by id", async () => {
    const res = await request(app).get("/courses/INFS605");
    expect(res.status).toBe(200);
  });

  it("return 404 for missing couse code", async () => {
    const res = await request(app).get("/courses/NOPE");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /courses/:course_code", () => {

  beforeEach(async () => {
    await pool.query(
      `INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices')`,
    );
  })

  it("updates a course by id", async () => {
    const res = await request(app)
      .patch("/courses/INFS605")
      .send({ title: "Data and AI" });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `SELECT * FROM courses WHERE title = 'Data and AI'`,
    );
    expect(rows.length).toBe(1);
  });

  it("return 404 when updating a non existant course", async () => {
    const res = await request(app)
      .patch("/courses/NOPE")
      .send({ title: "Data and AI" });
    expect(res.status).toBe(404);

    const { rows } = await pool.query(
      `SELECT * FROM courses WHERE title = 'Data and AI'`,
    );
    expect(rows.length).toBe(0);
  });

  it("return 400 when not sending request body", async () => {
    const res = await request(app)
      .patch("/courses/INFS605")
    expect(res.status).toBe(400);
  });
});

describe("DELETE /courses/:course_code", () => {

  beforeEach(async () => {
    await pool.query(
      `INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices')`,
    );
  })

  it("deletes a course by id", async () => {
    const res = await request(app).delete("/courses/INFS605");
    expect(res.status).toBe(204);

    const { rowCount } = await pool.query(`SELECT * FROM courses`);
    expect(rowCount).toBe(0);
  });

  it("returns 404 with id that doesn't exist", async () => {
    const res = await request(app).delete("/courses/NOPE");
    expect(res.status).toBe(404);

    const { rowCount } = await pool.query(`SELECT * FROM courses`);
    expect(rowCount).toBe(1);
  });
});

describe("POST /courses/:course_code/students", () => {
  beforeEach(async () => {
    await pool.query(
      `INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices')`,
    );
  });

  it("enrolls a student who exists", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app)
      .post("/courses/INFS605/students")
      .send({ student_id: "23204039" });

    expect(res.status).toBe(201);

    const { rowCount } = await pool.query(`SELECT * FROM enrolments`);
    expect(rowCount).toBe(1);
  });

  it("returns 404 when the student doesn't exist", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404));

    const res = await request(app)
      .post("/courses/INFS605/students")
      .send({ student_id: "23204039" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("student not found");
  });

  it("returns 404 when the course doesn't exist", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app)
      .post("/courses/NOPE/students")
      .send({ student_id: "23204039" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("course not found");
  });

  it("returns 409 when the student is already enrolled", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    await pool.query(
      `INSERT INTO enrolments (course_code, student_id) VALUES ('INFS605', '23204039')`,
    );

    const res = await request(app)
      .post("/courses/INFS605/students")
      .send({ student_id: "23204039" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("student already enrolled");
  });
});

describe("DELETE /courses/:course_code/students", () => {
  beforeEach(async () => {
    await pool.query(`
            INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices');
            INSERT INTO enrolments (course_code, student_id) VALUES ('INFS605', '23204039');`);
  });

  it("unenrolls a student who exists", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app).delete("/courses/INFS605/students/23204039");

    expect(res.status).toBe(204);

    const { rowCount } = await pool.query(`SELECT * FROM enrolments`);
    expect(rowCount).toBe(0);
  });

  it("returns 404 when unenrolling a student who doesn't exists", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'student not found' }));

    const res = await request(app).delete("/courses/INFS605/students/NOPE");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("student not found");
  });

  it("returns 404 when unenrolling a student from a course that doesn't exists", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'course not found' }));

    const res = await request(app).delete("/courses/NOPE/students/23204039");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("course not found");
  });
});

describe("GET /courses/:course_code/students/:student_id", () => {
  beforeEach(async () => {
    await pool.query(`
            INSERT INTO courses (course_code, title) VALUES ('INFS605', 'Microservices');
            INSERT INTO enrolments (course_code, student_id) VALUES ('INFS605', '23204039');`);
  })

  it("checks if a student exists", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app).get("/courses/INFS605/students/23204039");

    expect(res.status).toBe(200);
  })

  it("returns 404 when student doesn't exist", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'student not found' }));

    const res = await request(app).get("/courses/INFS605/students/23204039");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('student not found');
  })

  it("returns 404 when course doesn't exist", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app).get("/courses/NOPE/students/23204039");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('course not found');
  })
})