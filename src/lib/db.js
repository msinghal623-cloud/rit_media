import { neon } from "@neondatabase/serverless";

let sqlClient;
let schemaReady;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to your Neon Postgres connection string.");
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }

  return sqlClient;
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS news_snapshots (
        id BIGSERIAL PRIMARY KEY,
        generated_at TIMESTAMPTZ NOT NULL,
        article_count INTEGER NOT NULL DEFAULT 0,
        grouped_story_count INTEGER NOT NULL DEFAULT 0,
        successful_sources INTEGER NOT NULL DEFAULT 0,
        failed_sources INTEGER NOT NULL DEFAULT 0,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS news_snapshots_generated_at_idx
        ON news_snapshots (generated_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS waitlist_signups (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        origin TEXT NOT NULL DEFAULT 'homepage',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE TABLE IF NOT EXISTS interest_events (
        id BIGSERIAL PRIMARY KEY,
        interest TEXT NOT NULL,
        source_page TEXT NOT NULL DEFAULT 'homepage',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    ]);
  }

  return schemaReady;
}

export async function saveSnapshot(payload) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    INSERT INTO news_snapshots (
      generated_at,
      article_count,
      grouped_story_count,
      successful_sources,
      failed_sources,
      payload
    )
    VALUES (
      ${payload.generatedAt},
      ${payload.articleCount},
      ${payload.groupedStoryCount},
      ${payload.successfulSources},
      ${payload.failedSources},
      ${JSON.stringify(payload)}::jsonb
    )
  `;
}

export async function readLatestSnapshot() {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT payload
    FROM news_snapshots
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  return rows[0]?.payload || null;
}

export async function saveWaitlistSignup({ email, origin = "homepage" }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    INSERT INTO waitlist_signups (email, origin)
    VALUES (${email}, ${origin})
    ON CONFLICT (email) DO UPDATE
    SET origin = EXCLUDED.origin
  `;
}

export async function saveInterestEvent({ interest, sourcePage = "homepage" }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    INSERT INTO interest_events (interest, source_page)
    VALUES (${interest}, ${sourcePage})
  `;
}
