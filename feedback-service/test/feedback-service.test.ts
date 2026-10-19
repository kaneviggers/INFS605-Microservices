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
  await pool.query("TRUNCATE feedback CASCADE");
  fetchSpy = jest.spyOn(global, "fetch");
});

afterEach(async () => jest.restoreAllMocks());
afterAll(async () => await pool.end());

describe("POST /feedback/course/:course_code", () => {
  it("added feedback to a course", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app).post("/feedback/course/INFS605").send({
      student_id: 1234,
      comment: "Hello there",
    });

    expect(res.status).toBe(201);

    const { rowCount } = await pool.query(`SELECT * FROM feedback`);
    expect(rowCount).toBe(1);
  });

  it("returns 409 when feedback is already given", async () => {
    await pool.query(
      `INSERT INTO feedback (course_code, student_id, comment) VALUES ('INFS605', 1234, 'Goodbye')`,
    );

    fetchSpy.mockResolvedValue(fakeResponse(200));

    const res = await request(app).post("/feedback/course/INFS605").send({
      student_id: 1234,
      comment: "Hello there",
    });

    expect(res.status).toBe(409);

    const { rowCount } = await pool.query(`SELECT * FROM feedback`);
    expect(rowCount).toBe(1);
  });

  it("returns 404 for non existant course_code or student_id", async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404));

    const res = await request(app).post("/feedback/course/INFS605").send({
      student_id: 1234,
      comment: "Hello there",
    });

    expect(res.status).toBe(404);

    const { rowCount } = await pool.query(`SELECT * FROM feedback`);
    expect(rowCount).toBe(0);
  });

  it("returns 400 for invalid student_id", async () => {
    const res = await request(app).post("/feedback/course/INFS605").send({
      student_id: "1234",
      comment: "Hello there",
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed request body", async () => {
    const res = await request(app).post("/feedback/course/INFS605").send({
      comment: 1234,
      random: true,
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /feedback/:feedback_id", () => {
  it("gets feedback by id", async () => {
    const { rows } = await pool.query(
      `INSERT INTO feedback (course_code, student_id, comment) VALUES ('INFS605', 1234, 'It was good') RETURNING feedback_id`,
    );

    let feedback_id = rows[0].feedback_id;

    const res = await request(app).get(`/feedback/${feedback_id}`);

    expect(res.status).toBe(200);
    expect(res.body.comment).toBe("It was good");
  });

  it("returns 400 for malformed feedback_id", async () => {
    const res = await request(app).get(`/feedback/NOPE`);

    expect(res.status).toBe(400);
  });

  it("returns 404 for non existant feedback_id", async () => {
    const res = await request(app).get(`/feedback/4321`);

    expect(res.status).toBe(404);
  });
});

describe("GET /feedback/course/:course_code", () => {
  it("gets feedback for a course", async () => {
    await pool.query(
      `INSERT INTO feedback (course_code, student_id, comment) VALUES ('INFS605', 1234, 'It was good'), ('INFS605', 4321, 'Pretty good, I must say')`,
    );

    const res = await request(app).get(`/feedback/course/INFS605`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it("returns 404 for non existant course_code", async () => {
    const res = await request(app).get(`/feedback/course/NOPE`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /feedback/:feedback_id", () => {
  let feedback_id: number;

  beforeEach(async () => {
    const { rows } = await pool.query(
      `INSERT INTO feedback (course_code, student_id, comment) VALUES ('INFS605', 1234, 'It was good') RETURNING feedback_id`,
    );
    feedback_id = rows[0].feedback_id;
  })

  it("updates feedback", async () => {
    const res = await request(app).patch(`/feedback/${feedback_id}`).send({
      comment: "Something here"
    });

    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `SELECT comment FROM feedback`,
    );
    expect(rows[0].comment).toBe("Something here")
  })

  it("returns 400 with malformed request body", async () => {
    const res = await request(app).patch(`/feedback/${feedback_id}`).send({
      comment: true
    });

    expect(res.status).toBe(400);

    const { rows } = await pool.query(
      `SELECT comment FROM feedback`,
    );
    expect(rows[0].comment).toBe("It was good")
  })

  it("returns 400 with malformed feedback_id", async () => {
    const res = await request(app).patch(`/feedback/NOPE`).send({
      comment: "Something here"
    });

    expect(res.status).toBe(400);
  })

  it("returns 404 with non existant feedback", async () => {
    const res = await request(app).patch(`/feedback/1234`).send({
      comment: "Something here"
    });

    expect(res.status).toBe(404);
  })
})

describe("DELETE /feedback/:feedback_id", () => {

  it("deletes feedback", async () => {
    const { rows } = await pool.query(
      `INSERT INTO feedback (course_code, student_id, comment) VALUES ('INFS605', 1234, 'It was good') RETURNING feedback_id`,
    );
    let feedback_id = rows[0].feedback_id;

    const res = await request(app).delete(`/feedback/${feedback_id}`);

    expect(res.status).toBe(204);

    const { rowCount } = await pool.query(
      `SELECT * FROM feedback`,
    );
    expect(rowCount).toBe(0)
  })

  it("returns 400 with malformed feedback_id", async () => {
    const res = await request(app).delete(`/feedback/NOPE`);

    expect(res.status).toBe(400);
  })

  it("returns 404 with non existant feedback_id", async () => {
    const res = await request(app).delete(`/feedback/4321`);

    expect(res.status).toBe(404);
  })
})