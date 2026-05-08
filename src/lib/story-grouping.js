const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "in", "into", "is", "it", "of", "on", "or", "that", "the",
  "their", "this", "to", "was", "will", "with", "india", "indian"
]);

export function toTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeText(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function titleTokens(value) {
  return normalizeText(value).split(" ").filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function textTokens(value) {
  return titleTokens(value);
}

export function jaccard(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const union = new Set([...setA, ...setB]);
  let intersection = 0;

  setA.forEach((token) => {
    if (setB.has(token)) {
      intersection += 1;
    }
  });

  return union.size ? intersection / union.size : 0;
}

function categoryTokens(article = {}) {
  const categories = Array.isArray(article.categories)
    ? article.categories
    : [article.topic, article.category].filter(Boolean);
  return categories.flatMap((category) => textTokens(category));
}

function timeProximity(valueA, valueB) {
  const timestampA = toTimestamp(valueA);
  const timestampB = toTimestamp(valueB);

  if (!timestampA || !timestampB) {
    return 0;
  }

  const hoursApart = Math.abs(timestampA - timestampB) / (1000 * 60 * 60);
  return Math.max(0, 1 - hoursApart / 72);
}

function languageCountryScore(articleA = {}, articleB = {}) {
  const languageScore = articleA.language && articleB.language && articleA.language === articleB.language ? 0.5 : 0;
  const countryScore = articleA.country && articleB.country && articleA.country === articleB.country ? 0.5 : 0;
  return languageScore + countryScore;
}

function storyComparable(value) {
  if (typeof value === "string") {
    return { title: value };
  }

  return value || {};
}

export function articleSimilarity(articleA = {}, articleB = {}) {
  const titleScore = jaccard(titleTokens(articleA.title), titleTokens(articleB.title));
  const summaryScore = jaccard(textTokens(articleA.summary || articleA.contentText), textTokens(articleB.summary || articleB.contentText));
  const categoryScore = jaccard(categoryTokens(articleA), categoryTokens(articleB));
  const timeScore = timeProximity(articleA.publishedAt, articleB.publishedAt);
  const placeScore = languageCountryScore(articleA, articleB);

  return (
    titleScore * 0.45 +
    summaryScore * 0.25 +
    categoryScore * 0.15 +
    timeScore * 0.10 +
    placeScore * 0.05
  );
}

export function storyArticleSimilarity(story = {}, article = {}) {
  const storyAsArticle = {
    title: story.title || story.canonicalTitle,
    summary: story.summary,
    categories: [story.topic].filter(Boolean),
    publishedAt: story.publishedAt || story.updatedAt || story.updated_at,
    language: story.language,
    country: story.country
  };

  return articleSimilarity(storyAsArticle, article);
}

export function storySimilarity(storyA, storyB) {
  if (typeof storyA === "string" && typeof storyB === "string") {
    return jaccard(titleTokens(storyA), titleTokens(storyB));
  }

  const comparableA = storyComparable(storyA);
  const comparableB = storyComparable(storyB);
  return articleSimilarity(
    {
      title: comparableA.title || comparableA.canonicalTitle,
      summary: comparableA.summary,
      categories: [comparableA.topic].filter(Boolean),
      publishedAt: comparableA.publishedAt || comparableA.updatedAt || comparableA.updated_at,
      language: comparableA.language,
      country: comparableA.country
    },
    {
      title: comparableB.title || comparableB.canonicalTitle,
      summary: comparableB.summary,
      categories: [comparableB.topic].filter(Boolean),
      publishedAt: comparableB.publishedAt || comparableB.updatedAt || comparableB.updated_at,
      language: comparableB.language,
      country: comparableB.country
    }
  );
}

function dedupeByLink(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = `${article.publisherDomain}:${article.articleUrl}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function classifyFraming(title) {
  const text = normalizeText(title);
  if (text.includes("live") || text.includes("updates")) return "Live update framing";
  if (text.includes("explained") || text.includes("why") || text.includes("how")) return "Explainer framing";
  if (text.includes("stocks") || text.includes("market") || text.includes("economy") || text.includes("inflation")) return "Economic framing";
  if (text.includes("election") || text.includes("government") || text.includes("parliament") || text.includes("policy")) return "Political framing";
  return "General report framing";
}

function pickTopic(articles) {
  const counts = new Map();
  articles.forEach((article) => {
    (article.categories || []).forEach((category) => {
      const key = normalizeText(category);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "general";
}

function pickField(articles, fieldName, fallback = null) {
  return articles.find((article) => article[fieldName])?.[fieldName] || fallback;
}

function compactText(value = "") {
  return String(value).replace(/\s+/g, " ").replace(/\.\.\.+/g, ".").trim();
}

function toSentence(value = "") {
  const cleaned = compactText(value)
    .replace(/^[\-\s:;,.]+/, "")
    .replace(/\s+[|:-]\s+.*$/, "")
    .replace(/(Read more|Also read|Watch live|Live updates).*$/i, "")
    .trim();

  if (!cleaned) return "";
  const sentence = (cleaned.match(/[^.!?]+[.!?]?/)?.[0] || cleaned).trim();
  if (!sentence) return "";
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function normalizeForCompare(value = "") {
  return compactText(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function buildSummary(articles) {
  const candidateSentences = articles.map((article) => toSentence(article.summary || article.title)).filter(Boolean);
  const leadSentence = candidateSentences[0] || toSentence(articles[0]?.title || "Grouped story");
  const leadNormalized = normalizeForCompare(leadSentence);
  const secondarySentence = candidateSentences.find((sentence) => {
    const normalized = normalizeForCompare(sentence);
    return normalized && normalized !== leadNormalized && normalized.length > 36;
  });

  if (!secondarySentence) {
    return leadSentence;
  }

  return `${leadSentence} Other reports focus on ${secondarySentence.charAt(0).toLowerCase()}${secondarySentence.slice(1)}`;
}

function buildCluster(group, index) {
  const articles = [...group.articles].sort((a, b) => {
    if (a.sourcePriority !== b.sourcePriority) {
      return a.sourcePriority - b.sourcePriority;
    }
    return toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt);
  });

  const publisherCount = new Set(articles.map((article) => article.publisherDomain)).size;
  const freshness = Math.max(...articles.map((article) => toTimestamp(article.publishedAt)), 0);

  return {
    id: `story-${index + 1}`,
    title: articles[0]?.title || "Grouped story",
    summary: buildSummary(articles),
    topic: pickTopic(articles),
    country: pickField(articles, "country"),
    region: pickField(articles, "region"),
    district: pickField(articles, "district"),
    language: pickField(articles, "language"),
    storyStatus: "developing",
    importanceScore: publisherCount,
    publishedAt: freshness ? new Date(freshness).toISOString() : null,
    image: articles.find((article) => article.image)?.image || "",
    publisherCount,
    rankScore: publisherCount * 100 + freshness / 100000000,
    articles: articles.map((article) => ({
      articleId: article.id,
      publisherId: article.publisherId,
      publisherDomain: article.publisherDomain,
      publisherName: article.publisherName,
      title: article.title,
      summary: article.summary || "",
      contentText: article.contentText || "",
      articleUrl: article.articleUrl,
      publishedAt: article.publishedAt,
      image: article.image || "",
      language: article.language,
      country: article.country,
      framing: classifyFraming(article.title)
    }))
  };
}

export function groupAndRankArticles(inputArticles, options = {}) {
  const minSimilarity = options.minSimilarity ?? 0.4;
  const articles = dedupeByLink(inputArticles).sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));
  const groups = [];

  for (const article of articles) {
    let bestGroup = null;
    let bestScore = 0;

    for (const group of groups) {
      const score = Math.max(...group.articles.map((candidate) => articleSimilarity(article, candidate)));
      if (score > bestScore) {
        bestGroup = group;
        bestScore = score;
      }
    }

    if (bestGroup && bestScore >= minSimilarity) {
      bestGroup.articles.push(article);
    } else {
      groups.push({ articles: [article] });
    }
  }

  // Single-source stories are valid. Multi-source stories rank higher, but they are not the only stories worth saving.
  return groups
    .map((group, index) => buildCluster(group, index))
    .filter((group) => group.articles.length >= 1)
    .sort((a, b) => b.rankScore - a.rankScore);
}
