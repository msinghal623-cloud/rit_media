import * as cheerio from "cheerio";
import { absoluteUrl, RssItemParser, stripHtml } from "./rss-item-parser.js";

function firstValue(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function normalizeJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeJsonLd);
  if (typeof value !== "object") return [];

  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(normalizeJsonLd) : [];
  return [value, ...graph];
}

function typeMatches(entry, names) {
  const rawType = entry?.["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((type) => names.includes(String(type || "").toLowerCase()));
}

function textFromSelector($, selector) {
  return $(selector)
    .map((_, el) => stripHtml($(el).text()))
    .get()
    .filter(Boolean)
    .join("\n\n");
}

function imageFromJsonLd(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return imageFromJsonLd(image[0]);
  return image.url || image.contentUrl || "";
}

function authorFromJsonLd(author) {
  if (!author) return "";
  if (typeof author === "string") return author;
  if (Array.isArray(author)) {
    return author.map(authorFromJsonLd).filter(Boolean).join(", ");
  }
  return author.name || "";
}

export class MintParser extends RssItemParser {
  parseJsonLd($) {
    return $("script[type='application/ld+json']")
      .map((_, el) => {
        try {
          return JSON.parse($(el).contents().text().trim());
        } catch {
          return null;
        }
      })
      .get()
      .filter(Boolean)
      .flatMap(normalizeJsonLd);
  }

  meta($, ...names) {
    for (const name of names) {
      const value = firstValue(
        $(`meta[property='${name}']`).attr("content"),
        $(`meta[name='${name}']`).attr("content"),
        $(`meta[itemprop='${name}']`).attr("content")
      );
      if (value) return value;
    }
    return "";
  }

  parseArticlePage(html, url) {
    const $ = cheerio.load(html || "");
    const jsonLd = this.parseJsonLd($);
    const articleJson = jsonLd.find((entry) => typeMatches(entry, ["newsarticle", "article"])) || {};
    const bodySelectors = [
      "[itemprop='articleBody'] p",
      "article p",
      "[class*='storyContent'] p",
      "[class*='storyPage'] p",
      "[class*='mainArea'] p",
      ".storyParagraph",
      ".paywall p"
    ];
    const bodyFromSelectors = bodySelectors.map((selector) => textFromSelector($, selector)).find(Boolean) || "";

    const title = firstValue(
      articleJson.headline,
      this.meta($, "og:title", "twitter:title"),
      $("article h1").first().text(),
      $("h1").first().text()
    );
    const image = absoluteUrl(
      firstValue(imageFromJsonLd(articleJson.image), this.meta($, "og:image", "twitter:image")),
      url
    );
    const publishedAt = firstValue(
      articleJson.datePublished,
      this.meta($, "article:published_time", "datePublished", "pubdate"),
      $("time[datetime]").first().attr("datetime")
    );

    return {
      title: stripHtml(title),
      fullContentText: stripHtml(firstValue(articleJson.articleBody, bodyFromSelectors)),
      author: stripHtml(firstValue(authorFromJsonLd(articleJson.author), this.meta($, "author", "article:author"))),
      image,
      publishedAt,
      updatedAt: firstValue(articleJson.dateModified, this.meta($, "article:modified_time", "dateModified")),
      canonicalUrl: absoluteUrl($("link[rel='canonical']").attr("href") || this.meta($, "og:url") || url, url),
      rawMetadata: {
        jsonLdTypes: jsonLd.map((entry) => entry?.["@type"]).filter(Boolean),
        extractionSource: articleJson.articleBody ? "json_ld" : bodyFromSelectors ? "html" : "metadata"
      }
    };
  }
}
