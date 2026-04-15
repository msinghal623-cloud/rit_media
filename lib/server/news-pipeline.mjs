import { getStore } from "@netlify/blobs";
import { getActiveNewsSources } from "./news-sources.mjs";
import { fetchSourceArticles } from "./rss-ingest.mjs";
import { groupAndRankArticles } from "./story-grouping.mjs";

const STORE_NAME = "rit-media-news";
const CURRENT_KEY = "feed/current.json";
const STATUS_KEY = "feed/status.json";

function buildPayload({ sources, articles, stories, diagnostics }) {
  const successfulSources = diagnostics.filter((item) => item.ok).length;
  const failedSources = diagnostics.filter((item) => !item.ok).length;

  return {
    generatedAt: new Date().toISOString(),
    sourceCount: sources.length,
    articleCount: articles.length,
    groupedStoryCount: stories.length,
    successfulSources,
    failedSources,
    diagnostics,
    stories
  };
}

export async function refreshNewsSnapshot() {
  const sources = getActiveNewsSources();
  const results = await Promise.allSettled(
    sources.map((source) => fetchSourceArticles(source, { limitPerFeed: 12 }))
  );

  const articles = [];
  const diagnostics = [];

  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      articles.push(...result.value.articles);
      diagnostics.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: result.value.articles.length > 0,
        articleCount: result.value.articles.length,
        feeds: result.value.diagnostics
      });
      return;
    }

    diagnostics.push({
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      articleCount: 0,
      error: result.reason?.message || "Unknown source failure"
    });
  });

  const stories = groupAndRankArticles(articles).slice(0, 12);
  const payload = buildPayload({ sources, articles, stories, diagnostics });
  const store = getStore(STORE_NAME);

  await store.setJSON(CURRENT_KEY, payload);
  await store.setJSON(STATUS_KEY, {
    updatedAt: payload.generatedAt,
    articleCount: payload.articleCount,
    groupedStoryCount: payload.groupedStoryCount,
    successfulSources: payload.successfulSources,
    failedSources: payload.failedSources
  });

  return payload;
}

export async function readCurrentSnapshot() {
  const store = getStore(STORE_NAME);
  return store.get(CURRENT_KEY, { type: "json" });
}
