(function () {
  const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "in", "into", "is", "it", "its", "of", "on", "or", "s", "that", "the", "their", "this", "to", "up", "with", "will", "after", "amid", "india", "indian"
  ]);

  function toTimestamp(value) {
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function normaliseText(value) {
    return (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleTokens(value) {
    return normaliseText(value)
      .split(" ")
      .filter((token) => token && token.length > 2 && !STOPWORDS.has(token));
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

  function classifyFraming(article) {
    const title = normaliseText(article.title);
    if (title.includes("live") || title.includes("updates")) {
      return "Live update framing";
    }
    if (title.includes("explained") || title.includes("why") || title.includes("how")) {
      return "Explainer framing";
    }
    if (title.includes("market") || title.includes("inflation") || title.includes("economy") || title.includes("stocks")) {
      return "Economic framing";
    }
    if (title.includes("election") || title.includes("parliament") || title.includes("government") || title.includes("policy")) {
      return "Political framing";
    }
    if (title.includes("court") || title.includes("police") || title.includes("arrest") || title.includes("crime")) {
      return "Law-and-order framing";
    }
    return "General report framing";
  }

  function transparencyLabel(sourceCount) {
    if (sourceCount >= 4) {
      return "Transparency: high";
    }
    if (sourceCount >= 3) {
      return "Transparency: medium-high";
    }
    if (sourceCount >= 2) {
      return "Transparency: medium";
    }
    return "Transparency: limited";
  }

  function pickTopicLabel(group) {
    const coverages = group.articles.flatMap((article) => article.sourceCoverage || []);
    const counts = new Map();

    coverages.forEach((item) => {
      counts.set(item, (counts.get(item) || 0) + 1);
    });

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) {
      return "General";
    }

    return ranked[0][0].replace(/(^|\s)\S/g, (match) => match.toUpperCase());
  }

  function buildSummary(group) {
    const lead = group.articles[0];
    const sources = [...new Set(group.articles.map((article) => article.sourceName))];
    const intro = lead.summary || lead.title;
    const compactIntro = intro.replace(/\.$/, "");
    return sources.length + " sources are covering " + compactIntro + ". Coverage is being compared from " + sources.slice(0, 3).join(", ") + (sources.length > 3 ? ", and others." : ".");
  }

  function buildSignals(group) {
    const wordCounts = new Map();

    group.articles.forEach((article) => {
      titleTokens(article.title).forEach((token) => {
        wordCounts.set(token, (wordCounts.get(token) || 0) + 1);
      });
    });

    return [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([token]) => token.replace(/(^|\s)\S/g, (match) => match.toUpperCase()));
  }

  function buildCoverageNotes(group) {
    return group.articles
      .map((article) => article.sourceName + ": " + article.title)
      .join(" ");
  }

  function buildGroup(group, index) {
    const sortedArticles = [...group.articles].sort((a, b) => {
      if (b.sourcePriority !== a.sourcePriority) {
        return a.sourcePriority - b.sourcePriority;
      }
      return toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt);
    });

    const latestTimestamp = Math.max(...sortedArticles.map((article) => toTimestamp(article.publishedAt)), 0);
    const sourceCount = new Set(sortedArticles.map((article) => article.sourceId)).size;
    const headline = sortedArticles[0]?.title || "Grouped coverage";

    return {
      id: "story-" + (index + 1),
      title: headline,
      topicLabel: pickTopicLabel({ articles: sortedArticles }),
      publishedAt: latestTimestamp,
      sourceCount,
      transparency: transparencyLabel(sourceCount),
      signals: buildSignals({ articles: sortedArticles }),
      summary: buildSummary({ articles: sortedArticles }),
      notes: buildCoverageNotes({ articles: sortedArticles }),
      sources: sortedArticles.map((article) => ({
        sourceId: article.sourceId,
        sourceName: article.sourceName,
        title: article.title,
        link: article.link,
        framing: classifyFraming(article)
      }))
    };
  }

  function groupArticles(articles, options) {
    const safeOptions = options || {};
    const minSimilarity = safeOptions.minSimilarity || 0.34;
    const sortedArticles = [...articles].sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));
    const groups = [];

    sortedArticles.forEach((article) => {
      const tokens = titleTokens(article.title);
      let bestGroup = null;
      let bestScore = 0;

      groups.forEach((group) => {
        const score = jaccard(tokens, group.tokens);
        if (score > bestScore) {
          bestScore = score;
          bestGroup = group;
        }
      });

      if (bestGroup && bestScore >= minSimilarity) {
        bestGroup.articles.push(article);
        bestGroup.tokens = Array.from(new Set([...bestGroup.tokens, ...tokens]));
      } else {
        groups.push({ articles: [article], tokens });
      }
    });

    return groups
      .map((group, index) => buildGroup(group, index))
      .filter((group) => group.sources.length >= 2)
      .sort((a, b) => {
        if (b.sourceCount !== a.sourceCount) {
          return b.sourceCount - a.sourceCount;
        }
        return b.publishedAt - a.publishedAt;
      });
  }

  window.RITStoryGrouping = {
    groupArticles
  };
})();
