// ─────────────────────────────────────────────────────────────
// db.js: the ONLY file that knows how to reach the database.
// Every other file imports `query` from here.
// ─────────────────────────────────────────────────────────────
import pg from "pg";
import fs from "node:fs/promises";

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");

// A "pool" keeps a few connections open and reuses them (much faster
// than connecting fresh on every request).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL, // secret comes from the environment, never hard-coded
  ssl: isLocal ? false : { rejectUnauthorized: true }, // cloud databases (Neon) require encrypted connections
  max: 5,
});

// query("SELECT ... WHERE id = $1", [id])
// The $1, $2 placeholders are PARAMETERIZED QUERIES: user input is sent
// separately from the SQL text, so it can never be run as SQL (no SQL injection).
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

// Runs several queries as one all-or-nothing unit (a "transaction").
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await work(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Creates the tables on startup if they don't exist yet.
export async function initDb() {
  const schema = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
}
