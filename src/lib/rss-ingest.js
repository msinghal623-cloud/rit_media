import { XMLParser } from "fast-xml-parser";
import { getParserForSource } from "./source-parsers/parser-registry.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const DEFAULT_USER_AGENTS = [
  "rit-media/2.0 (+https://rit-media.netlify.app)",
  "Mozilla/5.0 (compatible; rit-media/2.0; +https://rit-media.netlify.app)"
];

function userAgentForAttempt(attempt, userAgents = DEFAULT_USER_AGENTS) {
  const agents = userAgents.length ? userAgents : DEFAULT_USER_AGENTS;
  return agents[attempt % agents.length];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url, options = {}) {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 10000;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options.fetchOptions,
        signal: controller.signal,
        headers: {
          "user-agent": userAgentForAttempt(attempt, options.userAgents),
          accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(options.fetchOptions?.headers || {})
        }
      });

      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      lastError = new Error(`Request failed for ${url}: ${response.status}`);

      if ([401, 403, 429].includes(response.status)) {
        lastError.blocked = true;
        throw lastError;
      }
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (error.blocked || attempt === retries) {
        throw error;
      }
    }

    await delay(Math.min(1000 * (attempt + 1), 3000));
  }

  throw lastError || new Error(`Request failed for ${url}`);
}

export async function fetchFeedArticles(source, feedUrl, sourceParser = getParserForSource(source), options = {}) {
  const response = await fetchWithRetry(feedUrl, {
    accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8",
    retries: options.retries,
    timeoutMs: options.timeoutMs,
    userAgents: options.userAgents
  });

  const xml = await response.text();
  const parsed = xmlParser.parse(xml);
  const items = asArray(parsed?.rss?.channel?.item || parsed?.feed?.entry);

  return items.map((item) => sourceParser.parseRssItem(item, source, feedUrl)).filter(Boolean);
}

export async function fetchSourceArticles(source, options = {}) {
  const limitPerFeed = Number.isFinite(options.limitPerFeed) ? options.limitPerFeed : null;
  const sourceParser = getParserForSource(source);
  const results = await Promise.allSettled(
    source.feeds.map((feedUrl) => fetchFeedArticles(source, feedUrl, sourceParser, options))
  );
  const articles = [];
  const diagnostics = [];

  results.forEach((result, index) => {
    const feedUrl = source.feeds[index];
    if (result.status === "fulfilled") {
      const feedArticles = limitPerFeed ? result.value.slice(0, limitPerFeed) : result.value;
      articles.push(...feedArticles);
      diagnostics.push({
        feedUrl,
        ok: true,
        articleCount: result.value.length,
        returnedArticleCount: feedArticles.length
      });
      return;
    }

    diagnostics.push({
      feedUrl,
      ok: false,
      articleCount: 0,
      error: result.reason?.message || "Unknown fetch error"
    });
  });

  return { source, articles, diagnostics };
}
