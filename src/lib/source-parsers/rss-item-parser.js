export function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function absoluteUrl(url, baseUrl) {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url || "";
  }
}

function nodeText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return value["#text"] || value._text || value.text || "";
}

function nodeUrl(value) {
  if (!value || typeof value !== "object") return "";
  return value.url || value._url || value.href || value._href || "";
}

function categoryFromFeedUrl(feedUrl = "") {
  try {
    const segments = new URL(feedUrl).pathname.split("/").filter(Boolean);
    return segments.at(-1) || "";
  } catch {
    return "";
  }
}

export class RssItemParser {
  constructor(source = {}) {
    this.source = source;
  }

  pickImage(item, baseUrl) {
    const mediaContent = [
      ...asArray(item["media:content"]),
      ...asArray(item.content).filter((entry) => entry?.__prefix === "media")
    ].map(nodeUrl).filter(Boolean);
    const mediaThumbnail = asArray(item["media:thumbnail"]).map(nodeUrl).filter(Boolean);
    const enclosure = nodeUrl(item.enclosure);
    const imageNode = nodeUrl(item.image);
    const rawMarkup = String(item["content:encoded"] || item.description || "");
    const inlineImage = rawMarkup.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    const candidate = mediaContent[0] || mediaThumbnail[0] || enclosure || imageNode || inlineImage;
    return absoluteUrl(candidate, baseUrl);
  }

  parseRssItem(item, source = this.source, feedUrl = "") {
    const categories = asArray(item.category).map(nodeText).filter(Boolean);
    const rssCategory = categories.length ? categories.join(", ") : categoryFromFeedUrl(feedUrl);
    const link = nodeText(item.link) || nodeUrl(item.link);
    const guid = nodeText(item.guid) || item.guid || link;
    const description = item.description || item["content:encoded"] || item.summary || "";

    const article = {
      id: `${source.id}:${String(guid || item.title || "").slice(0, 180)}`,
      sourceId: source.id,
      sourceName: source.name,
      sourcePriority: source.priority,
      sourceUrl: source.siteUrl,
      publisher: {
        name: source.name,
        domain: source.domain,
        siteUrl: source.siteUrl,
        logoUrl: source.logoUrl,
        country: source.country,
        language: source.language,
        isActive: true
      },
      feedUrl,
      rssTitle: stripHtml(nodeText(item.title) || item.title),
      rssDescription: stripHtml(description),
      rssCategory,
      contentText: "",
      author: "",
      extractionStatus: "rss_only",
      extractionError: "",
      rssArticleUrl: absoluteUrl(stripHtml(link), source.siteUrl),
      rssImageUrl: this.pickImage(item, source.siteUrl),
      language: source.language,
      country: source.country,
      rssPublishedAt: item.pubDate || item.published || item.updated || "",
      fetchedAt: ""
    };

    if (!article.rssTitle || !article.rssArticleUrl) {
      return null;
    }

    return article;
  }
}
