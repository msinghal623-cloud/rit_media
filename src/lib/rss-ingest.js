import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url || "";
  }
}

function pickImage(item, baseUrl) {
  const mediaContent = asArray(item["media:content"]).map((entry) => entry?.url).filter(Boolean);
  const mediaThumbnail = asArray(item["media:thumbnail"]).map((entry) => entry?.url).filter(Boolean);
  const enclosure = typeof item.enclosure === "object" ? item.enclosure?.url : "";
  const imageNode = typeof item.image === "object" ? item.image?.url || item.image?.href : "";
  const rawMarkup = String(item["content:encoded"] || item.description || "");
  const inlineImage = rawMarkup.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
  const candidate = mediaContent[0] || mediaThumbnail[0] || enclosure || imageNode || inlineImage;
  return absoluteUrl(candidate, baseUrl);
}

function normalizeRssItem(item, source, feedUrl) {
  const categories = asArray(item.category)
    .map((value) => (typeof value === "string" ? value : value?.["#text"]))
    .filter(Boolean);

  const article = {
    id: `${source.id}:${(item.guid?.["#text"] || item.guid || item.link || item.title || "").slice(0, 180)}`,
    sourceId: source.id,
    sourceName: source.name,
    sourcePriority: source.priority,
    sourceUrl: source.siteUrl,
    feedUrl,
    title: stripHtml(item.title),
    link: absoluteUrl(stripHtml(item.link), source.siteUrl),
    summary: stripHtml(item.description || item["content:encoded"] || item.summary || ""),
    publishedAt: item.pubDate || item.published || item.updated || "",
    image: pickImage(item, source.siteUrl),
    categories
  };

  if (!article.title || !article.link) {
    return null;
  }

  return article;
}

export async function fetchFeedArticles(source, feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      "user-agent": "rit-media/2.0 (+https://rit-media.netlify.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Feed request failed for ${source.name}: ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const items = asArray(parsed?.rss?.channel?.item || parsed?.feed?.entry);

  return items.map((item) => normalizeRssItem(item, source, feedUrl)).filter(Boolean);
}

export async function fetchSourceArticles(source, options = {}) {
  const limitPerFeed = options.limitPerFeed ?? 10;
  const results = await Promise.allSettled(source.feeds.map((feedUrl) => fetchFeedArticles(source, feedUrl)));
  const articles = [];
  const diagnostics = [];

  results.forEach((result, index) => {
    const feedUrl = source.feeds[index];
    if (result.status === "fulfilled") {
      articles.push(...result.value.slice(0, limitPerFeed));
      diagnostics.push({ feedUrl, ok: true, articleCount: result.value.length });
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
