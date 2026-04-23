const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "in", "into", "is", "it", "of", "on", "or", "that", "the",
  "their", "this", "to", "was", "will", "with", "india", "indian"
]);

function toTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeText(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titleTokens(value) {
  return normalizeText(value).split(" ").filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function jaccard(tokensA, tokensB) {
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

function dedupeByLink(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = `${article.sourceId}:${article.link}`;
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

function transparencyLabel(sourceCount) {
  if (sourceCount >= 5) return "Transparency: high";
  if (sourceCount >= 3) return "Transparency: medium-high";
  if (sourceCount >= 2) return "Transparency: medium";
  return "Transparency: limited";
}

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickTheme(articles) {
  const counts = new Map();
  articles.forEach((article) => {
    article.categories.forEach((category) => {
      const key = normalizeText(category);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return winner ? titleCase(winner) : "Top story";
}

function buildSignals(articles) {
  const counts = new Map();
  articles.forEach((article) => {
    titleTokens(article.title).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([token]) => titleCase(token));
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

  const sourceCount = new Set(articles.map((article) => article.sourceId)).size;
  const freshness = Math.max(...articles.map((article) => toTimestamp(article.publishedAt)), 0);

  return {
    id: `story-${index + 1}`,
    title: articles[0]?.title || "Grouped story",
    summary: buildSummary(articles),
    theme: pickTheme(articles),
    transparency: transparencyLabel(sourceCount),
    signals: buildSignals(articles),
    publishedAt: freshness ? new Date(freshness).toISOString() : null,
    image: articles.find((article) => article.image)?.image || "",
    sourceCount,
    rankScore: sourceCount * 100 + freshness / 100000000,
    sources: articles.map((article) => ({
      sourceId: article.sourceId,
      sourceName: article.sourceName,
      framing: classifyFraming(article.title),
      title: article.title,
      link: article.link,
      publishedAt: article.publishedAt,
      image: article.image || ""
    }))
  };
}

export function groupAndRankArticles(inputArticles, options = {}) {
  const minSimilarity = options.minSimilarity ?? 0.34;
  const articles = dedupeByLink(inputArticles).sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));
  const groups = [];

  for (const article of articles) {
    const tokens = titleTokens(article.title);
    let bestGroup = null;
    let bestScore = 0;

    for (const group of groups) {
      const score = jaccard(tokens, group.tokens);
      if (score > bestScore) {
        bestGroup = group;
        bestScore = score;
      }
    }

    if (bestGroup && bestScore >= minSimilarity) {
      bestGroup.articles.push(article);
      bestGroup.tokens = Array.from(new Set([...bestGroup.tokens, ...tokens]));
    } else {
      groups.push({ articles: [article], tokens });
    }
  }

  return groups
    .map((group, index) => buildCluster(group, index))
    .filter((group) => group.sourceCount >= 2)
    .sort((a, b) => b.rankScore - a.rankScore);
}
