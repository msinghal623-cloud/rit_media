(function () {
  const XML_PROXY = "https://api.allorigins.win/raw?url=";
  const JSON_PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";

  function stripHtml(value) {
    return (value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toAbsoluteUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).toString();
    } catch (_) {
      return url || "";
    }
  }

  function normaliseArticle(article, source) {
    const title = stripHtml(article.title || article.titleText || "");
    const link = toAbsoluteUrl(article.link || article.url || "", source.baseUrl);
    const summary = stripHtml(article.summary || article.description || article.contentSnippet || "");
    const publishedAt = article.publishedAt || article.pubDate || article.isoDate || "";

    if (!title || !link) {
      return null;
    }

    return {
      id: article.id || (source.id + ":" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
      sourceId: source.id,
      sourceName: source.name,
      sourcePriority: source.priority,
      sourceCoverage: source.coverage,
      title,
      link,
      summary,
      publishedAt,
      image: article.thumbnail || article.enclosure || "",
      categories: Array.isArray(article.categories) ? article.categories : []
    };
  }

  function parseXmlFeed(xmlText, source) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");
    const hasError = xml.querySelector("parsererror");

    if (hasError) {
      throw new Error("Invalid XML returned for " + source.name);
    }

    return Array.from(xml.querySelectorAll("item")).map((item) => {
      const categoryNodes = Array.from(item.querySelectorAll("category"));

      return normaliseArticle({
        title: item.querySelector("title")?.textContent || "",
        link: item.querySelector("link")?.textContent || "",
        description: item.querySelector("description")?.textContent || "",
        pubDate: item.querySelector("pubDate")?.textContent || "",
        categories: categoryNodes.map((node) => node.textContent).filter(Boolean)
      }, source);
    }).filter(Boolean);
  }

  function parseJsonFeed(payload, source) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map((item) => normaliseArticle({
      title: item.title,
      link: item.link,
      description: item.description,
      pubDate: item.pubDate,
      categories: item.categories,
      thumbnail: item.thumbnail
    }, source)).filter(Boolean);
  }

  async function fetchFeedThroughXmlProxy(feedUrl, source) {
    const response = await fetch(XML_PROXY + encodeURIComponent(feedUrl));
    if (!response.ok) {
      throw new Error("XML proxy request failed with " + response.status);
    }

    const xmlText = await response.text();
    return parseXmlFeed(xmlText, source);
  }

  async function fetchFeedThroughJsonProxy(feedUrl, source) {
    const response = await fetch(JSON_PROXY + encodeURIComponent(feedUrl));
    if (!response.ok) {
      throw new Error("JSON proxy request failed with " + response.status);
    }

    const payload = await response.json();
    return parseJsonFeed(payload, source);
  }

  function dedupeArticles(articles) {
    const seen = new Set();
    return articles.filter((article) => {
      const key = article.sourceId + ":" + article.link;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async function fetchSourceArticles(source, options) {
    const safeOptions = options || {};
    const perFeedLimit = safeOptions.perFeedLimit || 6;
    const feeds = Array.isArray(source.rssFeeds) ? source.rssFeeds : [];
    const collected = [];

    for (const feedUrl of feeds) {
      let feedArticles = [];

      try {
        feedArticles = await fetchFeedThroughXmlProxy(feedUrl, source);
      } catch (_) {
        feedArticles = await fetchFeedThroughJsonProxy(feedUrl, source);
      }

      collected.push(...feedArticles.slice(0, perFeedLimit));
    }

    return dedupeArticles(collected);
  }

  async function fetchAllArticles(sources, options) {
    const safeOptions = options || {};
    const enabledSources = sources.filter((source) => source.isActive && source.clientFetchEnabled && source.rssFeeds.length);
    const settled = await Promise.allSettled(enabledSources.map((source) => fetchSourceArticles(source, safeOptions)));
    const articles = [];
    const diagnostics = [];

    settled.forEach((result, index) => {
      const source = enabledSources[index];
      if (result.status === "fulfilled") {
        articles.push(...result.value);
        diagnostics.push({ sourceId: source.id, sourceName: source.name, ok: true, articleCount: result.value.length });
      } else {
        diagnostics.push({ sourceId: source.id, sourceName: source.name, ok: false, articleCount: 0, error: result.reason?.message || "Unknown fetch error" });
      }
    });

    return {
      articles: dedupeArticles(articles),
      diagnostics,
      attemptedSources: enabledSources.length
    };
  }

  window.RITNewsFetcher = {
    fetchAllArticles,
    fetchSourceArticles
  };
})();
