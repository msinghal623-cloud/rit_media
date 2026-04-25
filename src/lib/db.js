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

export async function resetSchema() {
  const sql = getSql();

  await sql.transaction([
    sql`DROP TABLE IF EXISTS story_articles CASCADE`,
    sql`DROP TABLE IF EXISTS stories CASCADE`,
    sql`DROP TABLE IF EXISTS articles CASCADE`,
    sql`DROP TABLE IF EXISTS news_snapshots CASCADE`,
    sql`DROP TABLE IF EXISTS waitlist_signups CASCADE`,
    sql`DROP TABLE IF EXISTS interest_events CASCADE`
  ]);

  schemaReady = undefined;
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS articles (
        id BIGSERIAL PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL,
        published_at TIMESTAMPTZ,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL UNIQUE,
        image_url TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS articles_published_at_idx
        ON articles (published_at DESC NULLS LAST)`,
      sql`CREATE INDEX IF NOT EXISTS articles_fetched_at_idx
        ON articles (fetched_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS stories (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT 'Top story',
        transparency TEXT NOT NULL DEFAULT 'Transparency: limited',
        signals JSONB NOT NULL DEFAULT '[]'::jsonb,
        lead_image_url TEXT NOT NULL DEFAULT '',
        latest_published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS stories_latest_published_at_idx
        ON stories (latest_published_at DESC NULLS LAST)`,
      sql`CREATE TABLE IF NOT EXISTS story_articles (
        story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (story_id, article_id)
      )`,
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

function normalizeDate(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export async function upsertArticle(article, fetchedAt = new Date().toISOString()) {
  await ensureSchema();
  const sql = getSql();
  const publishedAt = normalizeDate(article.publishedAt);

  const rows = await sql`
    INSERT INTO articles (
      source_id,
      source_name,
      fetched_at,
      published_at,
      title,
      summary,
      source_url,
      image_url,
      updated_at
    )
    VALUES (
      ${article.sourceId},
      ${article.sourceName},
      ${fetchedAt},
      ${publishedAt},
      ${article.title},
      ${article.summary || ""},
      ${article.link},
      ${article.image || ""},
      NOW()
    )
    ON CONFLICT (source_url) DO UPDATE
    SET
      source_id = EXCLUDED.source_id,
      source_name = EXCLUDED.source_name,
      fetched_at = EXCLUDED.fetched_at,
      published_at = EXCLUDED.published_at,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      image_url = EXCLUDED.image_url,
      updated_at = NOW()
    RETURNING id, source_id, source_name, fetched_at, published_at, title, summary, source_url, image_url
  `;

  return rows[0];
}

export async function deleteOldArticles(days = 14) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    DELETE FROM articles
    WHERE COALESCE(published_at, fetched_at) < NOW() - ${days} * INTERVAL '1 day'
  `;
}

export async function readRecentArticles(days = 14) {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT
      id,
      source_id AS "sourceId",
      source_name AS "sourceName",
      fetched_at AS "fetchedAt",
      published_at AS "publishedAt",
      title,
      summary,
      source_url AS "link",
      image_url AS "image"
    FROM articles
    WHERE COALESCE(published_at, fetched_at) >= NOW() - ${days} * INTERVAL '1 day'
    ORDER BY COALESCE(published_at, fetched_at) DESC
  `;
}

export async function readStoriesIndex() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT id, title
    FROM stories
    ORDER BY updated_at DESC
  `;
}

export async function upsertStory(story, existingStoryId = null) {
  await ensureSchema();
  const sql = getSql();
  const latestPublishedAt = normalizeDate(story.publishedAt);
  const signals = JSON.stringify(story.signals || []);

  if (existingStoryId) {
    const rows = await sql`
      UPDATE stories
      SET
        title = ${story.title},
        summary = ${story.summary || ""},
        theme = ${story.theme || "Top story"},
        transparency = ${story.transparency || "Transparency: limited"},
        signals = ${signals}::jsonb,
        lead_image_url = ${story.image || ""},
        latest_published_at = ${latestPublishedAt},
        updated_at = NOW()
      WHERE id = ${existingStoryId}
      RETURNING id
    `;

    return rows[0]?.id || existingStoryId;
  }

  const rows = await sql`
    INSERT INTO stories (
      title,
      summary,
      theme,
      transparency,
      signals,
      lead_image_url,
      latest_published_at,
      updated_at
    )
    VALUES (
      ${story.title},
      ${story.summary || ""},
      ${story.theme || "Top story"},
      ${story.transparency || "Transparency: limited"},
      ${signals}::jsonb,
      ${story.image || ""},
      ${latestPublishedAt},
      NOW()
    )
    RETURNING id
  `;

  return rows[0].id;
}

export async function replaceStoryArticles(storyId, articleIds) {
  await ensureSchema();
  const sql = getSql();
  const distinctArticleIds = [...new Set(articleIds)].filter(Boolean);

  await sql`DELETE FROM story_articles WHERE story_id = ${storyId}`;

  for (const articleId of distinctArticleIds) {
    await sql`
      INSERT INTO story_articles (story_id, article_id)
      VALUES (${storyId}, ${articleId})
      ON CONFLICT (story_id, article_id) DO NOTHING
    `;
  }
}

export async function deleteStoriesNotIn(storyIds) {
  await ensureSchema();
  const sql = getSql();

  if (!storyIds.length) {
    await sql`DELETE FROM stories`;
    return;
  }

  await sql`
    DELETE FROM stories
    WHERE NOT (id = ANY(${storyIds}))
  `;
}

export async function deleteOrphanStories() {
  await ensureSchema();
  const sql = getSql();
  await sql`
    DELETE FROM stories
    WHERE NOT EXISTS (
      SELECT 1
      FROM story_articles
      WHERE story_articles.story_id = stories.id
    )
  `;
}

export async function readFeedStories(limit = 12) {
  await ensureSchema();
  const sql = getSql();
  const storyRows = await sql`
    SELECT
      s.id,
      s.title,
      s.summary,
      s.theme,
      s.transparency,
      s.signals,
      s.lead_image_url AS image,
      s.latest_published_at AS "publishedAt",
      COUNT(DISTINCT a.source_id)::int AS "sourceCount"
    FROM stories s
    JOIN story_articles sa ON sa.story_id = s.id
    JOIN articles a ON a.id = sa.article_id
    GROUP BY s.id
    ORDER BY COUNT(DISTINCT a.source_id) DESC, s.latest_published_at DESC NULLS LAST
    LIMIT ${limit}
  `;

  if (!storyRows.length) {
    return [];
  }

  const storyIds = storyRows.map((story) => story.id);
  const articleRows = await sql`
    SELECT
      sa.story_id AS "storyId",
      a.id AS "articleId",
      a.source_id AS "sourceId",
      a.source_name AS "sourceName",
      a.title,
      a.source_url AS link,
      a.published_at AS "publishedAt",
      a.image_url AS image
    FROM story_articles sa
    JOIN articles a ON a.id = sa.article_id
    WHERE sa.story_id = ANY(${storyIds})
    ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
  `;

  const articlesByStoryId = new Map();

  for (const article of articleRows) {
    const list = articlesByStoryId.get(article.storyId) || [];
    list.push({
      articleId: article.articleId,
      sourceId: article.sourceId,
      sourceName: article.sourceName,
      framing: "Reported story",
      title: article.title,
      link: article.link,
      publishedAt: article.publishedAt,
      image: article.image || ""
    });
    articlesByStoryId.set(article.storyId, list);
  }

  return storyRows.map((story) => ({
    id: `story-${story.id}`,
    dbId: story.id,
    title: story.title,
    summary: story.summary,
    theme: story.theme,
    transparency: story.transparency,
    signals: Array.isArray(story.signals) ? story.signals : [],
    publishedAt: story.publishedAt,
    image: story.image || "",
    sourceCount: story.sourceCount,
    sources: articlesByStoryId.get(story.id) || []
  }));
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
