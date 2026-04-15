(function () {
  const newsSources = [
    {
      id: "the-hindu",
      name: "The Hindu",
      baseUrl: "https://www.thehindu.com",
      language: "en",
      country: "india",
      coverage: ["national", "politics", "business", "science", "world"],
      fetchStrategy: "rss",
      priority: 1,
      isActive: true,
      clientFetchEnabled: true,
      rssFeeds: [
        "https://www.thehindu.com/news/national/feeder/default.rss",
        "https://www.thehindu.com/business/feeder/default.rss"
      ]
    },
    {
      id: "indian-express",
      name: "The Indian Express",
      baseUrl: "https://indianexpress.com",
      language: "en",
      country: "india",
      coverage: ["national", "explained", "politics", "business", "cities"],
      fetchStrategy: "rss",
      priority: 1,
      isActive: true,
      clientFetchEnabled: true,
      rssFeeds: [
        "https://indianexpress.com/section/india/feed/",
        "https://indianexpress.com/section/business/feed/"
      ]
    },
    {
      id: "times-of-india",
      name: "The Times of India",
      baseUrl: "https://timesofindia.indiatimes.com",
      language: "en",
      country: "india",
      coverage: ["national", "cities", "business", "elections", "world"],
      fetchStrategy: "rss",
      priority: 1,
      isActive: true,
      clientFetchEnabled: true,
      rssFeeds: [
        "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms"
      ]
    },
    {
      id: "ndtv",
      name: "NDTV",
      baseUrl: "https://www.ndtv.com",
      language: "en",
      country: "india",
      coverage: ["national", "breaking", "business", "world", "technology"],
      fetchStrategy: "rss",
      priority: 1,
      isActive: true,
      clientFetchEnabled: true,
      rssFeeds: [
        "https://feeds.feedburner.com/ndtvnews-top-stories"
      ]
    },
    {
      id: "financial-express",
      name: "Financial Express",
      baseUrl: "https://www.financialexpress.com",
      language: "en",
      country: "india",
      coverage: ["business", "economy", "markets", "industry", "policy"],
      fetchStrategy: "rss",
      priority: 2,
      isActive: true,
      clientFetchEnabled: true,
      rssFeeds: [
        "https://www.financialexpress.com/feed/"
      ]
    },
    {
      id: "hindustan-times",
      name: "Hindustan Times",
      baseUrl: "https://www.hindustantimes.com",
      language: "en",
      country: "india",
      coverage: ["national", "politics", "business", "cities", "world"],
      fetchStrategy: "html_or_api",
      priority: 1,
      isActive: true,
      clientFetchEnabled: false,
      rssFeeds: []
    },
    {
      id: "india-today",
      name: "India Today",
      baseUrl: "https://www.indiatoday.in",
      language: "en",
      country: "india",
      coverage: ["national", "politics", "business", "world", "states"],
      fetchStrategy: "html_or_api",
      priority: 2,
      isActive: true,
      clientFetchEnabled: false,
      rssFeeds: []
    },
    {
      id: "mint",
      name: "Mint",
      baseUrl: "https://www.livemint.com",
      language: "en",
      country: "india",
      coverage: ["business", "economy", "markets", "policy", "technology"],
      fetchStrategy: "html_or_api",
      priority: 2,
      isActive: true,
      clientFetchEnabled: false,
      rssFeeds: []
    },
    {
      id: "news18",
      name: "News18",
      baseUrl: "https://www.news18.com",
      language: "en",
      country: "india",
      coverage: ["national", "states", "politics", "world", "explainers"],
      fetchStrategy: "html_or_api",
      priority: 2,
      isActive: true,
      clientFetchEnabled: false,
      rssFeeds: []
    },
    {
      id: "deccan-herald",
      name: "Deccan Herald",
      baseUrl: "https://www.deccanherald.com",
      language: "en",
      country: "india",
      coverage: ["national", "karnataka", "business", "politics", "opinion"],
      fetchStrategy: "html_or_api",
      priority: 2,
      isActive: true,
      clientFetchEnabled: false,
      rssFeeds: []
    }
  ];

  window.RIT_NEWS_SOURCES = newsSources;

  window.getNewsSources = function getNewsSources(filters) {
    const safeFilters = filters || {};

    return newsSources.filter((source) => {
      if (safeFilters.isActive !== undefined && source.isActive !== safeFilters.isActive) {
        return false;
      }

      if (safeFilters.language && source.language !== safeFilters.language) {
        return false;
      }

      if (safeFilters.clientFetchEnabled !== undefined && source.clientFetchEnabled !== safeFilters.clientFetchEnabled) {
        return false;
      }

      if (safeFilters.coverage && !source.coverage.includes(safeFilters.coverage)) {
        return false;
      }

      return true;
    });
  };
})();
