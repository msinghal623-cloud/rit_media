import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

let sqlClient;
let schemaReady;
const publisherCache = new Map();

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

function normalizeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDatabaseError(error) {
  const message = `${error?.message || ""} ${error?.sourceError?.message || ""} ${error?.sourceError?.cause?.message || ""} ${error?.sourceError?.cause?.code || ""}`;
  return /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|Connect Timeout/i.test(message);
}

async function withDatabaseRetry(operation, retries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientDatabaseError(error) || attempt === retries) {
        throw error;
      }

      await delay(1000 * (attempt + 1));
    }
  }

  throw lastError;
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

  await withDatabaseRetry(() => sql.transaction([
    sql`DROP TABLE IF EXISTS articles CASCADE`,
    sql`DROP TABLE IF EXISTS stories CASCADE`,
    sql`DROP TABLE IF EXISTS publishers CASCADE`,
  ]));

  schemaReady = undefined;
  publisherCache.clear();
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = withDatabaseRetry(() => sql.transaction([
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
        rss_title TEXT NOT NULL,
        rss_description TEXT,
        rss_category TEXT,
        content_text TEXT,
        author TEXT,
        extraction_status VARCHAR(30),
        extraction_error TEXT,
        rss_article_url TEXT NOT NULL UNIQUE,
        rss_image_url TEXT,
        language VARCHAR(10),
        rss_published_at TIMESTAMPTZ,
        fetched_at TIMESTAMPTZ
      )`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS articles_rss_article_url_key ON articles (rss_article_url)`,
      sql`CREATE INDEX IF NOT EXISTS articles_story_id_idx ON articles (story_id)`,
      sql`CREATE INDEX IF NOT EXISTS articles_publisher_id_idx ON articles (publisher_id)`,
      sql`CREATE INDEX IF NOT EXISTS articles_rss_published_at_idx ON articles (rss_published_at DESC NULLS LAST)`,
      sql`CREATE TABLE IF NOT EXISTS job_runs (
        id BIGSERIAL PRIMARY KEY,
        job_name TEXT NOT NULL,
        status VARCHAR(30) NOT NULL,
        message TEXT,
        metadata JSONB,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS job_runs_job_name_started_at_idx ON job_runs (job_name, started_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS job_runs_status_idx ON job_runs (status)`,
      sql`CREATE TABLE IF NOT EXISTS job_locks (
        lock_name TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        locked_until TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    ]));
  }

  return schemaReady;
}

export async function startJobRun(jobName, metadata = {}) {
  await ensureSchema();
  const sql = getSql();

  const rows = await withDatabaseRetry(() => sql`
    INSERT INTO job_runs (
      job_name,
      status,
      metadata,
      started_at
    )
    VALUES (
      ${jobName},
      'running',
      ${normalizeJson(metadata)}::jsonb,
      NOW()
    )
    RETURNING id
  `);

  return rows[0]?.id || null;
}

export async function finishJobRun(jobRunId, { status = "success", message = "", metadata = {} } = {}) {
  if (!jobRunId) {
    return null;
  }

  await ensureSchema();
  const sql = getSql();

  const rows = await withDatabaseRetry(() => sql`
    UPDATE job_runs
    SET
      status = ${normalizeText(status, 30) || "success"},
      message = ${normalizeText(message)},
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(${normalizeJson(metadata)}::jsonb, '{}'::jsonb),
      finished_at = NOW()
    WHERE id = ${jobRunId}
    RETURNING id, status
  `);

  return rows[0] || null;
}

export async function acquireJobLock(lockName, ttlMs = 15 * 60 * 1000) {
  await ensureSchema();
  const sql = getSql();
  const owner = randomUUID();
  const normalizedTtlMs = Math.max(1000, Number(ttlMs) || 1000);

  const rows = await withDatabaseRetry(() => sql`
    INSERT INTO job_locks (
      lock_name,
      owner,
      locked_until,
      updated_at
    )
    VALUES (
      ${normalizeText(lockName)},
      ${owner},
      NOW() + ${normalizedTtlMs} * INTERVAL '1 millisecond',
      NOW()
    )
    ON CONFLICT (lock_name) DO UPDATE
    SET
      owner = EXCLUDED.owner,
      locked_until = EXCLUDED.locked_until,
      updated_at = NOW()
    WHERE job_locks.locked_until <= NOW()
    RETURNING lock_name AS "lockName", owner, locked_until AS "lockedUntil"
  `);

  return rows[0] || null;
}

export async function releaseJobLock(lockName, owner) {
  if (!lockName || !owner) {
    return false;
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await withDatabaseRetry(() => sql`
    DELETE FROM job_locks
    WHERE lock_name = ${lockName}
      AND owner = ${owner}
    RETURNING lock_name
  `);

  return Boolean(rows[0]);
}

export async function readRecentJobRuns(limit = 50) {
  await ensureSchema();
  const sql = getSql();

  return withDatabaseRetry(() => sql`
    SELECT
      id,
      job_name AS "jobName",
      status,
      message,
      metadata,
      started_at AS "startedAt",
      finished_at AS "finishedAt",
      created_at AS "createdAt"
    FROM job_runs
    ORDER BY started_at DESC
    LIMIT ${Math.max(1, Number(limit) || 50)}
  `);
}

export async function upsertPublisher(source) {
  await ensureSchema();
  const sql = getSql();
  const domain = publisherDomain(source);

  if (!domain) {
    throw new Error(`Could not derive publisher domain for source "${source?.name || "unknown"}".`);
  }

  if (publisherCache.has(domain)) {
    return publisherCache.get(domain);
  }

  const rows = await withDatabaseRetry(() => sql`
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
  `);

  publisherCache.set(domain, rows[0]);
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

  const publishedAt = normalizeDate(article.rssPublishedAt || article.publishedAt);
  const fetchedAtValue = normalizeDate(article.fetchedAt || fetchedAt) || new Date().toISOString();
  const rssCategory = Array.isArray(article.categories)
    ? article.categories.filter(Boolean).join(", ")
    : article.rssCategory || article.categories;

  const rows = await withDatabaseRetry(() => sql`
    INSERT INTO articles (
      publisher_id,
      rss_title,
      rss_description,
      rss_category,
      content_text,
      author,
      extraction_status,
      extraction_error,
      rss_article_url,
      rss_image_url,
      language,
      rss_published_at,
      fetched_at
    )
    VALUES (
      ${publisher.id},
      ${article.rssTitle || article.title},
      ${normalizeText(article.rssDescription || article.summary)},
      ${normalizeText(rssCategory)},
      ${normalizeText(article.contentText)},
      ${normalizeText(article.author)},
      ${normalizeText(article.extractionStatus, 30) || "rss_only"},
      ${normalizeText(article.extractionError)},
      ${article.rssArticleUrl || article.link},
      ${normalizeText(article.rssImageUrl || article.image)},
      ${normalizeText(article.language || article.publisher?.language || article.source?.language, 10)},
      ${publishedAt},
      ${fetchedAtValue}
    )
    ON CONFLICT (rss_article_url) DO UPDATE
    SET
      publisher_id = EXCLUDED.publisher_id,
      rss_title = EXCLUDED.rss_title,
      rss_description = EXCLUDED.rss_description,
      rss_category = EXCLUDED.rss_category,
      content_text = COALESCE(EXCLUDED.content_text, articles.content_text),
      author = COALESCE(EXCLUDED.author, articles.author),
      extraction_status = CASE
        WHEN EXCLUDED.extraction_status IS NULL OR EXCLUDED.extraction_status = 'rss_only'
          THEN COALESCE(articles.extraction_status, EXCLUDED.extraction_status)
        ELSE EXCLUDED.extraction_status
      END,
      extraction_error = CASE
        WHEN EXCLUDED.extraction_status IS NULL OR EXCLUDED.extraction_status = 'rss_only'
          THEN articles.extraction_error
        ELSE EXCLUDED.extraction_error
      END,
      rss_image_url = EXCLUDED.rss_image_url,
      language = EXCLUDED.language,
      rss_published_at = EXCLUDED.rss_published_at,
      fetched_at = EXCLUDED.fetched_at
    RETURNING id, publisher_id, story_id, rss_title AS title, rss_article_url AS article_url
  `);

  return rows[0];
}

export async function readArticlesForExtraction({ publisherDomain = "", limit = 2, excludeArticleIds = [] } = {}) {
  await ensureSchema();
  const sql = getSql();
  const excludedIds = [...new Set(excludeArticleIds)].filter(Boolean);

  return withDatabaseRetry(() => sql`
    SELECT
      a.id,
      a.rss_article_url AS "rssArticleUrl",
      a.extraction_status AS "extractionStatus",
      p.domain AS "publisherDomain",
      p.name AS "publisherName"
    FROM articles a
    JOIN publishers p ON p.id = a.publisher_id
    WHERE COALESCE(a.extraction_status, 'rss_only') = 'rss_only'
      AND a.rss_article_url IS NOT NULL
      AND a.rss_article_url <> ''
      AND (${publisherDomain || null}::TEXT IS NULL OR p.domain = ${publisherDomain})
      AND (${excludedIds.length ? excludedIds : null}::BIGINT[] IS NULL OR NOT (a.id = ANY(${excludedIds})))
    ORDER BY RANDOM()
    LIMIT ${limit}
  `);
}

export async function updateArticleExtraction(articleId, extraction) {
  await ensureSchema();
  const sql = getSql();

  const rows = await withDatabaseRetry(() => sql`
    UPDATE articles
    SET
      content_text = ${normalizeText(extraction.contentText)},
      author = ${normalizeText(extraction.author)},
      extraction_status = ${normalizeText(extraction.extractionStatus, 30) || "rss_only"},
      extraction_error = ${normalizeText(extraction.extractionError)}
    WHERE id = ${articleId}
    RETURNING id, extraction_status AS "extractionStatus"
  `);

  return rows[0];
}

export async function deleteOldArticles(days = 14) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    DELETE FROM articles
    WHERE rss_published_at < NOW() - ${days} * INTERVAL '1 day'
  `;
}

export async function deleteExcessArticles(maxArticles = 3000) {
  await ensureSchema();
  const sql = getSql();
  const normalizedMax = Math.max(0, Number(maxArticles) || 0);

  if (!normalizedMax) {
    return 0;
  }

  const rows = await withDatabaseRetry(() => sql`
    WITH article_count AS (
      SELECT COUNT(*)::int AS count FROM articles
    ),
    deletion_candidates AS (
      SELECT
        a.id,
        ROW_NUMBER() OVER (
          ORDER BY
            a.rss_published_at ASC NULLS FIRST,
            a.id ASC
        ) AS delete_rank
      FROM articles a
    ),
    deleted AS (
      DELETE FROM articles
      WHERE id IN (
        SELECT dc.id
        FROM deletion_candidates dc
        CROSS JOIN article_count ac
        WHERE dc.delete_rank <= GREATEST(ac.count - ${normalizedMax}, 0)
      )
      RETURNING id
    )
    SELECT COUNT(*)::int AS "deletedCount"
    FROM deleted
  `);

  return rows[0]?.deletedCount || 0;
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
      a.rss_published_at AS "publishedAt",
      a.rss_title AS title,
      COALESCE(a.rss_description, '') AS summary,
      a.content_text AS "contentText",
      a.rss_article_url AS "articleUrl",
      COALESCE(a.rss_image_url, '') AS image,
      a.language,
      CASE
        WHEN a.rss_category IS NULL OR a.rss_category = '' THEN NULL::TEXT[]
        ELSE string_to_array(a.rss_category, ', ')
      END AS categories,
      p.country,
      NULL::VARCHAR(100) AS region,
      NULL::VARCHAR(100) AS district
    FROM articles a
    JOIN publishers p ON p.id = a.publisher_id
    WHERE COALESCE(a.rss_published_at, a.fetched_at) >= NOW() - ${days} * INTERVAL '1 day'
    ORDER BY COALESCE(a.rss_published_at, a.fetched_at) DESC
  `;
}

export async function readStoriesIndex() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT
      id,
      canonical_title AS title,
      summary,
      topic,
      country,
      region,
      district,
      language,
      updated_at AS "updatedAt"
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

  await sql`UPDATE articles SET story_id = NULL WHERE story_id = ${storyId}`;

  if (!distinctArticleIds.length) {
    return;
  }

  await sql`
    UPDATE articles
    SET story_id = ${storyId}
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
      MAX(a.rss_published_at) AS "publishedAt",
      COUNT(DISTINCT a.publisher_id)::int AS "publisherCount",
      MAX(a.rss_image_url) FILTER (WHERE a.rss_image_url IS NOT NULL AND a.rss_image_url <> '') AS image
    FROM stories s
    JOIN articles a ON a.story_id = s.id
    GROUP BY s.id
    ORDER BY COUNT(DISTINCT a.publisher_id) DESC, MAX(a.rss_published_at) DESC NULLS LAST, s.updated_at DESC
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
      a.rss_title AS title,
      COALESCE(a.rss_description, '') AS summary,
      COALESCE(a.content_text, '') AS "contentText",
      a.rss_article_url AS "articleUrl",
      a.rss_published_at AS "publishedAt",
      a.rss_image_url AS image,
      a.language,
      p.country
    FROM articles a
    JOIN publishers p ON p.id = a.publisher_id
    WHERE a.story_id = ANY(${storyIds})
    ORDER BY COALESCE(a.rss_published_at, a.fetched_at) DESC
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
