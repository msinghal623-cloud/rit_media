import {
  deleteOldArticles,
  deleteOrphanStories,
  deleteStoriesNotIn,
  readFeedStories,
  readRecentArticles,
  readStoriesIndex,
  replaceStoryArticles,
  upsertArticle,
  upsertStory
} from "./db.js";
import { getActiveNewsSources } from "./news-sources.js";
import { fetchSourceArticles } from "./rss-ingest.js";
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

    const score = storySimilarity(candidateStory.title, existingStory.title);
    if (score > bestScore) {
      bestMatch = existingStory;
      bestScore = score;
    }
  }

  return bestScore >= 0.42 ? bestMatch : null;
}

export async function refreshNewsSnapshot() {
  const sources = getActiveNewsSources();
  const results = await Promise.allSettled(
    sources.map((source) => fetchSourceArticles(source, { limitPerFeed: 12 }))
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

  const recentArticles = await readRecentArticles(14);
  const groupedStories = groupAndRankArticles(recentArticles).slice(0, 24);
  const existingStories = await readStoriesIndex();
  const usedStoryIds = new Set();
  const activeStoryIds = [];

  for (const story of groupedStories) {
    const match = bestMatchingStory(story, existingStories, usedStoryIds);
    const storyId = await upsertStory(story, match?.id || null);
    await replaceStoryArticles(
      storyId,
      (story.articles || []).map((article) => article.articleId)
    );

    activeStoryIds.push(storyId);
    usedStoryIds.add(storyId);
  }

  await deleteStoriesNotIn(activeStoryIds);
  await deleteOrphanStories();

  const stories = await readFeedStories(12);
  return buildPayload({ stories, diagnostics });
}

export async function readCurrentSnapshot() {
  const stories = await readFeedStories(12);

  return {
    generatedAt: stories[0]?.publishedAt || null,
    articleCount: stories.reduce((count, story) => count + (story.articles?.length || 0), 0),
    storyCount: stories.length,
    stories
  };
}
