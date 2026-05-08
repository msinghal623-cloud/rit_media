import {
  deleteExcessArticles,
  deleteOldArticles,
  readArticlesForExtraction,
  readFeedStories,
  readRecentArticles,
  readStoriesIndex,
  replaceStoryArticles,
  updateArticleExtraction,
  upsertArticle,
  upsertStory
} from "./db.js";
import { getActiveNewsSources } from "./news-sources.js";
import { fetchSourceArticles, fetchWithRetry } from "./rss-ingest.js";
import { getParserForSource } from "./source-parsers/parser-registry.js";
import { groupAndRankArticles, storySimilarity } from "./story-grouping.js";

function buildPayload({ stories, diagnostics }) {
  const successfulSources = diagnostics.filter((item) => item.ok).length;
  const failedSources = diagnostics.filter((item) => !item.ok).length;

  return {
    generatedAt: new Date().toISOString(),
    articleCount: stories.reduce((count, story) => count + (story.articles?.length || 0), 0),
    storyCount: stories.length,
    successfulSources,
    failedSources,
    diagnostics,
    stories
  };
}

function bestMatchingStory(candidateStory, existingStories, usedStoryIds) {
  let bestMatch = null;
  let bestScore = 0;

  for (const existingStory of existingStories) {
    if (usedStoryIds.has(existingStory.id)) {
      continue;
    }

    const score = storySimilarity(candidateStory, existingStory);
    if (score > bestScore) {
      bestMatch = existingStory;
      bestScore = score;
    }
  }

  return bestScore >= 0.45 ? bestMatch : null;
}

function storyRefreshLimit() {
  const configured = Number(process.env.STORY_REFRESH_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : 100;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractPendingArticleContent(options = {}) {
  const sources = options.sources || getActiveNewsSources();
  const maxDurationMs = options.maxDurationMs ?? 10 * 60 * 1000;
  const stopAt = Date.now() + maxDurationMs;
  const extractionDiagnostics = [];
  let attemptedCount = 0;
  let stoppedDueToTime = false;

  for (const source of sources) {
    if (Date.now() >= stopAt) {
      stoppedDueToTime = true;
      break;
    }

    const sourceParser = getParserForSource(source);

    if (typeof sourceParser.parseArticlePage !== "function") {
      extractionDiagnostics.push({
        sourceId: source.id,
        ok: false,
        extractionStatus: "skipped",
        error: "No article page parser configured for source"
      });
      continue;
    }

    const attemptedArticleIds = new Set();

    while (true) {
      if (Date.now() >= stopAt) {
        stoppedDueToTime = true;
        break;
      }

      const candidates = await readArticlesForExtraction({
        publisherDomain: source.domain,
        limit: randomInt(1, 2),
        excludeArticleIds: [...attemptedArticleIds]
      });

      if (!candidates.length) {
        break;
      }

      for (const article of candidates) {
        if (Date.now() >= stopAt) {
          stoppedDueToTime = true;
          break;
        }

        attemptedArticleIds.add(article.id);
        attemptedCount += 1;

        try {
          const response = await fetchWithRetry(article.rssArticleUrl);
          const html = await response.text();
          const page = sourceParser.parseArticlePage(html, article.rssArticleUrl) || {};
          const hasFullContent = Boolean(page.fullContentText);

          await updateArticleExtraction(article.id, {
            contentText: page.fullContentText || "",
            author: page.author || "",
            extractionStatus: hasFullContent ? "full" : "failed",
            extractionError: hasFullContent ? "" : "No article content extracted"
          });

          extractionDiagnostics.push({
            articleId: article.id,
            sourceId: source.id,
            ok: hasFullContent,
            extractionStatus: hasFullContent ? "full" : "failed",
            error: hasFullContent ? undefined : "No article content extracted"
          });
        } catch (error) {
          const extractionStatus = error.blocked ? "blocked" : "failed";

          await updateArticleExtraction(article.id, {
            contentText: "",
            author: "",
            extractionStatus,
            extractionError: error.message || "Article extraction failed"
          });

          extractionDiagnostics.push({
            articleId: article.id,
            sourceId: source.id,
            ok: false,
            extractionStatus,
            error: error.message || "Article extraction failed"
          });
        }

        if (Date.now() < stopAt) {
          await delay(Math.min(randomInt(1000, 5000), Math.max(0, stopAt - Date.now())));
        }
      }

      if (stoppedDueToTime) {
        break;
      }
    }

    if (stoppedDueToTime) {
      break;
    }
  }

  return {
    attemptedCount,
    stoppedDueToTime,
    diagnostics: extractionDiagnostics
  };
}

export async function refreshNewsSnapshot() {
  const sources = getActiveNewsSources();
  const results = await Promise.allSettled(
    sources.map((source) => fetchSourceArticles(source))
  );

  const diagnostics = [];
  const fetchedAt = new Date().toISOString();

  for (const [index, result] of results.entries()) {
    const source = sources[index];

    if (result.status !== "fulfilled") {
      diagnostics.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        articleCount: 0,
        error: result.reason?.message || "Unknown source failure"
      });
      continue;
    }

    let storedCount = 0;

    for (const article of result.value.articles) {
      await upsertArticle(article, fetchedAt);
      storedCount += 1;
    }

    diagnostics.push({
      sourceId: source.id,
      sourceName: source.name,
      ok: storedCount > 0,
      articleCount: storedCount,
      feeds: result.value.diagnostics
    });
  }

  await deleteOldArticles(14);
  await deleteExcessArticles(3000);

  const recentArticles = await readRecentArticles(14);
  const groupedStories = groupAndRankArticles(recentArticles).slice(0, storyRefreshLimit());
  const existingStories = await readStoriesIndex();
  const usedStoryIds = new Set();

  for (const story of groupedStories) {
    const match = bestMatchingStory(story, existingStories, usedStoryIds);
    const storyId = await upsertStory(story, match?.id || null);
    await replaceStoryArticles(
      storyId,
      (story.articles || []).map((article) => article.articleId)
    );
    usedStoryIds.add(storyId);
  }

  // Do not destructively delete stories during a normal refresh. A story missing from one run may still be useful history.

  const stories = await readFeedStories(30);
  return buildPayload({ stories, diagnostics });
}

export async function readCurrentSnapshot() {
  const stories = await readFeedStories(30);

  return {
    generatedAt: stories[0]?.publishedAt || null,
    articleCount: stories.reduce((count, story) => count + (story.articles?.length || 0), 0),
    storyCount: stories.length,
    stories
  };
}
