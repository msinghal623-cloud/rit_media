import { saveSnapshot, readLatestSnapshot } from "./db.js";
import { getActiveNewsSources } from "./news-sources.js";
import { fetchSourceArticles } from "./rss-ingest.js";
import { groupAndRankArticles } from "./story-grouping.js";

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

  await saveSnapshot(payload);
  return payload;
}

export async function readCurrentSnapshot() {
  return readLatestSnapshot();
}
