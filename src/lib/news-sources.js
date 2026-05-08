export const NEWS_SOURCES = [
  {
    id: "hindustan-times",
    parser: "hindustan-times",
    name: "Hindustan Times",
    siteUrl: "https://www.hindustantimes.com",
    domain: "hindustantimes.com",
    country: "India",
    language: "en",
    priority: 1,
    feeds: [
      //"https://www.hindustantimes.com/feeds/rss/top-news/rssfeed.xml",
      "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
      //"https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml"
    ]
  },
  {
    id: "mint",
    parser: "mint",
    name: "Mint",
    siteUrl: "https://www.livemint.com",
    domain: "livemint.com",
    country: "India",
    language: "en",
    priority: 1,
    feeds: [
      "https://www.livemint.com/rss/news",
      "https://www.livemint.com/rss/politics",
      //"https://www.livemint.com/rss/markets"
    ]
  },
  {
    id: "times-of-india",
    parser: "times-of-india",
    name: "The Times of India",
    siteUrl: "https://timesofindia.indiatimes.com",
    domain: "timesofindia.indiatimes.com",
    country: "India",
    language: "en",
    priority: 1,
    feeds: [
      //"https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms",
    ]
  },
  {
    id: "ndtv",
    parser: "ndtv",
    name: "NDTV",
    siteUrl: "https://www.ndtv.com",
    domain: "ndtv.com",
    country: "India",
    language: "en",
    priority: 1,
    feeds: [
      //"https://feeds.feedburner.com/ndtvnews-top-stories",
      //"https://feeds.feedburner.com/ndtvnews-india-news",
    ]
  },
  {
    id: "deccan-herald",
    parser: "deccan-herald",
    name: "Deccan Herald",
    siteUrl: "https://www.deccanherald.com",
    domain: "deccanherald.com",
    country: "India",
    language: "en",
    priority: 2,
    feeds: [
      //"https://www.deccanherald.com/rss/latest-news"
    ]
  }
];

export function getActiveNewsSources() {
  return NEWS_SOURCES;
}
