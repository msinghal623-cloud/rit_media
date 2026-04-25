"use client";

import { useEffect, useMemo, useState } from "react";

function track(eventName, params) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params || {});
  }
}

function formatDateTime(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function titleCase(value = "") {
  return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

function storyImage(story) {
  if (story.image) return story.image;
  return (story.articles || []).find((article) => article.image)?.image || "";
}

function storyLocation(story) {
  return [story.district, story.region, story.country].filter(Boolean).join(", ") || "Location pending";
}

function StoryCard({ story }) {
  const [open, setOpen] = useState(false);
  const visibleArticles = useMemo(() => (story.articles || []).slice(0, story.publisherCount > 3 ? 6 : 3), [story]);
  const imageUrl = storyImage(story);

  return (
    <article className="story-card">
      <div className="story-hero">
        {imageUrl ? <div className="story-hero-media" style={{ backgroundImage: `url("${imageUrl.replace(/"/g, "%22")}")` }} /> : null}
        <div className="story-top">
          <div className="story-meta">
            <span>{titleCase(story.topic || "general")}</span>
            <span>{formatDateTime(story.publishedAt)}</span>
            <span>{story.publisherCount || 0} publishers</span>
          </div>
          <div className="score-chip">Importance {story.importanceScore || 0}</div>
        </div>
        <div className="story-heading-wrap">
          <button className="headline-btn" onClick={() => setOpen((value) => !value)}>
            {story.canonicalTitle}
          </button>
          <div className="story-heading-badges">
            <span className="story-badge">{story.storyStatus || "developing"}</span>
            <span className="story-badge">{story.language || "en"}</span>
            <span className="story-badge">{storyLocation(story)}</span>
          </div>
        </div>
      </div>

      <div className="story-body">
        <p className="story-summary">{story.summary || "Summary pending for this story cluster."}</p>
        <div className="signal-row">
          <span className="tag">Topic: {titleCase(story.topic || "general")}</span>
          <span className="tag">Status: {story.storyStatus || "developing"}</span>
          <span className="tag">Publishers: {story.publisherCount || 0}</span>
        </div>
        <div className={`source-list ${visibleArticles.length > 3 ? "is-expanded" : "is-compact"}`}>
          {visibleArticles.map((article) => (
            <div className="source-item" key={article.articleId}>
              <div className="source-left">
                <div className="source-name">{article.publisherName}</div>
                <div className="source-framing">{article.publisherDomain}</div>
                <div className="source-title">{article.title}</div>
              </div>
              <a
                className="source-pill"
                href={article.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("article_open", { publisher: article.publisherDomain, story: story.id })}
              >
                Open article
              </a>
            </div>
          ))}
        </div>
        {open ? (
          <div className="story-detail">
            <strong>Story record:</strong> topic `{story.topic || "general"}`, status `{story.storyStatus || "developing"}`, location `{storyLocation(story)}`.
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function Home() {
  const [stories, setStories] = useState([]);
  const [status, setStatus] = useState("Loading news stories from the database...");

  useEffect(() => {
    let cancelled = false;

    async function loadStories() {
      try {
        const response = await fetch("/api/news-feed", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`Feed request failed with status ${response.status}`);
        const payload = await response.json();

        if (cancelled) return;
        setStories(payload.stories || []);
        setStatus(payload.generatedAt
          ? `Last refresh: ${new Date(payload.generatedAt).toLocaleString("en-IN")}. ${payload.articleCount || 0} articles mapped into ${payload.storyCount || 0} stories.`
          : (payload.message || "No stories exist yet."));
        track("feed_loaded", {
          article_count: payload.articleCount || 0,
          story_count: payload.storyCount || 0
        });
      } catch (error) {
        if (cancelled) return;
        setStories([]);
        setStatus("Could not load stored stories from the local API.");
        track("feed_error", { message: error.message || "Unknown error" });
      }
    }

    loadStories();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">RIT</div>
            <div className="brand-copy">
              <h1>rit-media</h1>
              <p>stories, articles, publishers</p>
            </div>
          </div>
          <div className="top-note">Central schema: `publishers`, `stories`, `articles`</div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container">
            <div className="hero-head">
              <div>
                <div className="eyebrow">News Aggregator MVP Schema</div>
                <h2>Stored stories linked directly to publishers and articles.</h2>
              </div>
            </div>

            <section className="summary-panel" aria-label="Snapshot summary">
              <div className="section-kicker">Snapshot</div>
              <p className="feed-status">{status}</p>
            </section>

            <section className="story-section" aria-label="Stories feed">
              <div className={`story-rail ${stories.length ? "" : "loading"}`} aria-live="polite">
                {stories.length ? stories.map((story) => <StoryCard story={story} key={story.id} />) : (
                  <article className="story-card story-card-placeholder">
                    <div className="story-hero story-hero-placeholder">
                      <div className="story-top">
                        <div className="story-meta"><span>No stories yet</span><span>Awaiting refresh</span></div>
                        <div className="score-chip">Schema ready</div>
                      </div>
                      <div className="headline-static">Run `pnpm refresh:news` to populate `publishers`, `stories`, and `articles`.</div>
                    </div>
                  </article>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p>rit-media . canonical story records backed by publisher and article rows</p>
        </div>
      </footer>
    </>
  );
}
