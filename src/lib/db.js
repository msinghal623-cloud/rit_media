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

function normalizeDate(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  return maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function publisherDomain(source = {}) {
  try {
    return new URL(source.siteUrl || source.baseUrl || source.sourceUrl || "").hostname.replace(/^www\./, "");
  } catch {
    return normalizeText(source.domain);
  }
}

export async function resetSchema() {
  const sql = getSql();

  await sql.transaction([
    sql`DROP TABLE IF EXISTS story_articles CASCADE`,
    sql`DROP TABLE IF EXISTS interest_events CASCADE`,
    sql`DROP TABLE IF EXISTS waitlist_signups CASCADE`,
    sql`DROP TABLE IF EXISTS articles CASCADE`,
    sql`DROP TABLE IF EXISTS stories CASCADE`,
    sql`DROP TABLE IF EXISTS publishers CASCADE`,
    sql`DROP TABLE IF EXISTS news_snapshots CASCADE`
  ]);

  schemaReady = undefined;
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS publishers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE,
        base_url TEXT,
        logo_url TEXT,
        country VARCHAR(50),
        language VARCHAR(10),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE TABLE IF NOT EXISTS stories (
        id BIGSERIAL PRIMARY KEY,
        canonical_title TEXT NOT NULL,
        summary TEXT,
        topic VARCHAR(100),
        country VARCHAR(50),
        region VARCHAR(100),
        district VARCHAR(100),
        language VARCHAR(10),
        story_status VARCHAR(30) NOT NULL DEFAULT 'developing',
        importance_score DOUBLE PRECISION,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS stories_region_idx ON stories (region)`,
      sql`CREATE INDEX IF NOT EXISTS stories_topic_idx ON stories (topic)`,
      sql`CREATE INDEX IF NOT EXISTS stories_created_at_idx ON stories (created_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS articles (
        id BIGSERIAL PRIMARY KEY,
        publisher_id BIGINT NOT NULL REFERENCES publishers(id),
        story_id BIGINT REFERENCES stories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        summary TEXT,
        content_text TEXT,
        article_url TEXT NOT NULL UNIQUE,
        image_url TEXT,
        language VARCHAR(10),
        published_at TIMESTAMPTZ,
        fetched_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS articles_story_id_idx ON articles (story_id)`,
      sql`CREATE INDEX IF NOT EXISTS articles_publisher_id_idx ON articles (publisher_id)`,
      sql`CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC NULLS LAST)`
    ]);
  }

  return schemaReady;
}

export async function upsertPublisher(source) {
  await ensureSchema();
  const sql = getSql();
  const domain = publisherDomain(source);

  if (!domain) {
    throw new Error(`Could not derive publisher domain for source "${source?.name || "unknown"}".`);
  }

  const rows = await sql`
    INSERT INTO publishers (
      name,
      domain,
      base_url,
      logo_url,
      country,
      language,
      is_active,
      updated_at
    )
    VALUES (
      ${normalizeText(source.name) || domain},
      ${domain},
      ${normalizeText(source.siteUrl || source.baseUrl)},
      ${normalizeText(source.logoUrl)},
      ${normalizeText(source.country, 50)},
      ${normalizeText(source.language, 10)},
      ${source.isActive ?? true},
      NOW()
    )
    ON CONFLICT (domain) DO UPDATE
    SET
      name = EXCLUDED.name,
      base_url = EXCLUDED.base_url,
      logo_url = EXCLUDED.logo_url,
      country = EXCLUDED.country,
      language = EXCLUDED.language,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING id, name, domain
  `;

  return rows[0];
}

export async function upsertArticle(article, fetchedAt = new Date().toISOString()) {
  await ensureSchema();
  const sql = getSql();
  const publisher = await upsertPublisher(article.publisher || article.source || {
    name: article.sourceName,
    siteUrl: article.sourceUrl,
    domain: article.sourceDomain,
    country: article.country,
    language: article.language
  });

  const publishedAt = normalizeDate(article.publishedAt);
  const fetchedAtValue = normalizeDate(fetchedAt) || new Date().toISOString();

  const rows = await sql`
    INSERT INTO articles (
      publisher_id,
      title,
      summary,
      content_text,
      article_url,
      image_url,
      language,
      published_at,
      fetched_at,
      updated_at
    )
    VALUES (
      ${publisher.id},
      ${article.title},
      ${normalizeText(article.summary)},
      ${normalizeText(article.contentText || article.summary)},
      ${article.link},
      ${normalizeText(article.image)},
      ${normalizeText(article.language || article.publisher?.language || article.source?.language, 10)},
      ${publishedAt},
      ${fetchedAtValue},
      NOW()
    )
    ON CONFLICT (article_url) DO UPDATE
    SET
      publisher_id = EXCLUDED.publisher_id,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      content_text = EXCLUDED.content_text,
      image_url = EXCLUDED.image_url,
      language = EXCLUDED.language,
      published_at = EXCLUDED.published_at,
      fetched_at = EXCLUDED.fetched_at,
      updated_at = NOW()
    RETURNING id, publisher_id, story_id, title, article_url
  `;

  return rows[0];
}

export async function deleteOldArticles(days = 14) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    DELETE FROM articles
    WHERE COALESCE(published_at, fetched_at, created_at) < NOW() - ${days} * INTERVAL '1 day'
  `;
}

export async function readRecentArticles(days = 14) {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT
      a.id,
      p.id AS "publisherId",
      p.domain AS "publisherDomain",
      p.name AS "publisherName",
      p.base_url AS "publisherBaseUrl",
      NULL::INT AS "sourcePriority",
      a.fetched_at AS "fetchedAt",
      a.published_at AS "publishedAt",
      a.title,
      COALESCE(a.summary, '') AS summary,
      a.content_text AS "contentText",
      a.article_url AS "articleUrl",
      COALESCE(a.image_url, '') AS image,
      a.language,
      NULL::TEXT[] AS categories,
      p.country,
      NULL::VARCHAR(100) AS region,
      NULL::VARCHAR(100) AS district
    FROM articles a
    JOIN publishers p ON p.id = a.publisher_id
    WHERE COALESCE(a.published_at, a.fetched_at, a.created_at) >= NOW() - ${days} * INTERVAL '1 day'
    ORDER BY COALESCE(a.published_at, a.fetched_at, a.created_at) DESC
  `;
}

export async function readStoriesIndex() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT id, canonical_title AS title
    FROM stories
    ORDER BY updated_at DESC
  `;
}

export async function upsertStory(story, existingStoryId = null) {
  await ensureSchema();
  const sql = getSql();
  const topic = normalizeText((story.topic || "").toLowerCase(), 100);
  const language = normalizeText(story.language, 10);
  const country = normalizeText(story.country, 50);
  const region = normalizeText(story.region, 100);
  const district = normalizeText(story.district, 100);
  const storyStatus = normalizeText(story.storyStatus, 30) || "developing";
  const importanceScore = Number.isFinite(Number(story.importanceScore))
    ? Number(story.importanceScore)
    : Number(story.publisherCount || 0);

  if (existingStoryId) {
    const rows = await sql`
      UPDATE stories
      SET
        canonical_title = ${story.title},
        summary = ${normalizeText(story.summary)},
        topic = ${topic},
        country = ${country},
        region = ${region},
        district = ${district},
        language = ${language},
        story_status = ${storyStatus},
        importance_score = ${importanceScore},
        updated_at = NOW()
      WHERE id = ${existingStoryId}
      RETURNING id
    `;

    return rows[0]?.id || existingStoryId;
  }

  const rows = await sql`
    INSERT INTO stories (
      canonical_title,
      summary,
      topic,
      country,
      region,
      district,
      language,
      story_status,
      importance_score,
      updated_at
    )
    VALUES (
      ${story.title},
      ${normalizeText(story.summary)},
      ${topic},
      ${country},
      ${region},
      ${district},
      ${language},
      ${storyStatus},
      ${importanceScore},
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

  await sql`UPDATE articles SET story_id = NULL, updated_at = NOW() WHERE story_id = ${storyId}`;

  if (!distinctArticleIds.length) {
    return;
  }

  await sql`
    UPDATE articles
    SET story_id = ${storyId}, updated_at = NOW()
    WHERE id = ANY(${distinctArticleIds})
  `;
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
      FROM articles
      WHERE articles.story_id = stories.id
    )
  `;
}

export async function readFeedStories(limit = 12) {
  await ensureSchema();
  const sql = getSql();
  const storyRows = await sql`
    SELECT
      s.id,
      s.canonical_title AS title,
      COALESCE(s.summary, '') AS summary,
      s.topic,
      s.story_status AS "storyStatus",
      s.language,
      s.country,
      s.region,
      s.district,
      s.importance_score AS "importanceScore",
      MAX(a.published_at) AS "publishedAt",
      COUNT(DISTINCT a.publisher_id)::int AS "publisherCount",
      MAX(a.image_url) FILTER (WHERE a.image_url IS NOT NULL AND a.image_url <> '') AS image
    FROM stories s
    JOIN articles a ON a.story_id = s.id
    GROUP BY s.id
    ORDER BY COUNT(DISTINCT a.publisher_id) DESC, MAX(a.published_at) DESC NULLS LAST, s.updated_at DESC
    LIMIT ${limit}
  `;

  if (!storyRows.length) {
    return [];
  }

  const storyIds = storyRows.map((story) => story.id);
  const articleRows = await sql`
    SELECT
      a.story_id AS "storyId",
      a.id AS "articleId",
      p.id AS "publisherId",
      p.domain AS "publisherDomain",
      p.name AS "publisherName",
      a.title,
      COALESCE(a.summary, '') AS summary,
      COALESCE(a.content_text, '') AS "contentText",
      a.article_url AS "articleUrl",
      a.published_at AS "publishedAt",
      a.image_url AS image,
      a.language,
      p.country
    FROM articles a
    JOIN publishers p ON p.id = a.publisher_id
    WHERE a.story_id = ANY(${storyIds})
    ORDER BY COALESCE(a.published_at, a.fetched_at, a.created_at) DESC
  `;

  const articlesByStoryId = new Map();

  for (const article of articleRows) {
    const list = articlesByStoryId.get(article.storyId) || [];
    list.push({
      articleId: article.articleId,
      publisherId: article.publisherId,
      publisherDomain: article.publisherDomain,
      publisherName: article.publisherName,
      title: article.title,
      summary: article.summary,
      contentText: article.contentText,
      articleUrl: article.articleUrl,
      publishedAt: article.publishedAt,
      image: article.image || "",
      language: article.language,
      country: article.country
    });
    articlesByStoryId.set(article.storyId, list);
  }

  return storyRows.map((story) => ({
    id: `story-${story.id}`,
    dbId: story.id,
    canonicalTitle: story.title,
    summary: story.summary,
    topic: story.topic,
    storyStatus: story.storyStatus,
    language: story.language,
    country: story.country,
    region: story.region,
    district: story.district,
    importanceScore: story.importanceScore,
    publishedAt: story.publishedAt,
    image: story.image || "",
    publisherCount: story.publisherCount,
    articles: articlesByStoryId.get(story.id) || []
  }));
}
