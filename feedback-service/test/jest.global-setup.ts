import { PostgreSqlContainer } from "@testcontainers/postgresql";

export default async function () {
  const container = await new PostgreSqlContainer("postgres:18").start();

  // Set before any test file imports db.ts (the Pool reads this at import time)
  process.env.DATABASE_URL = container.getConnectionUri();

  // Stash the container so teardown can stop it
  (globalThis as any).__PG__ = container;
}
