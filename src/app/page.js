"use client";

import { useEffect, useMemo, useState } from "react";

function track(eventName, params) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params || {});
  }
}

function formatDate(value) {
  if (!value) return "Latest";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));
}

function storyImage(story) {
  if (story.image) return story.image;
  return (story.sources || []).find((source) => source.image)?.image || "";
}

function StoryCard({ story }) {
  const [open, setOpen] = useState(false);
  const visibleSources = useMemo(() => (story.sources || []).slice(0, story.sourceCount > 3 ? 6 : 3), [story]);
  const signals = story.signals?.length ? story.signals : ["Grouped from overlapping headlines"];
  const imageUrl = storyImage(story);

  return (
    <article className="story-card">
      <div className="story-hero">
        {imageUrl ? <div className="story-hero-media" style={{ backgroundImage: `url("${imageUrl.replace(/"/g, "%22")}")` }} /> : null}
        <div className="story-top">
          <div className="story-meta">
            <span>{story.theme || "Top story"}</span>
            <span>{formatDate(story.publishedAt)}</span>
            <span>{story.sourceCount || 0} sources</span>
          </div>
          <div className="score-chip">{story.transparency || "Transparency: limited"}</div>
        </div>
        <div className="story-heading-wrap">
          <button className="headline-btn" onClick={() => setOpen((value) => !value)}>
            {story.title}
          </button>
          <div className="story-heading-badges">
            <span className="story-badge">{(story.sourceCount || visibleSources.length) > 3 ? "6-source view" : "3-source view"}</span>
            <span className="story-badge">{story.theme || "Top story"}</span>
          </div>
        </div>
      </div>

      <div className="story-body">
        <p className="story-summary">{story.summary}</p>
        <div className="signal-row">
          {signals.map((signal) => <span className="tag" key={signal}>{signal}</span>)}
        </div>
        <div className={`source-list ${visibleSources.length > 3 ? "is-expanded" : "is-compact"}`}>
          {visibleSources.map((source, index) => (
            <div className="source-item" key={`${source.sourceId}-${index}`}>
              <div className="source-left">
                <div className="source-name">{source.sourceName}</div>
                <div className="source-framing">{source.framing}</div>
                <div className="source-title">{source.title}</div>
              </div>
              <a
                className="source-pill"
                href={source.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("source_open", { source: source.sourceId, story: story.id })}
              >
                Open source
              </a>
            </div>
          ))}
        </div>
        {open ? (
          <div className="story-detail">
            This grouped story combines overlapping reporting from multiple publishers in the latest refresh snapshot.
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function Home() {
  const [stories, setStories] = useState([]);
  const [status, setStatus] = useState("Loading prepared news snapshot...");
  const [email, setEmail] = useState("");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState(new Set());

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
          ? `Last refresh: ${new Date(payload.generatedAt).toLocaleString("en-IN")}. ${payload.articleCount || 0} articles processed into ${payload.groupedStoryCount || 0} grouped stories.`
          : (payload.message || "No snapshot exists yet."));
        track("feed_loaded", {
          article_count: payload.articleCount || 0,
          grouped_story_count: payload.groupedStoryCount || 0
        });
      } catch (error) {
        if (cancelled) return;
        setStories([]);
        setStatus("Could not load the prepared feed from the local API.");
        track("feed_error", { message: error.message || "Unknown error" });
      }
    }

    loadStories();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markInterest(interest) {
    setSelectedInterests((current) => new Set([...current, interest]));
    track("interest_click", { interest });

    await fetch("/api/interest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interest })
    }).catch(() => {});
  }

  async function submitWaitlist(event) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, origin: "homepage" })
    });

    if (response.ok) {
      setWaitlistOpen(false);
      setThanks(true);
      setEmail("");
      track("waitlist_submit");
    }
  }

  function revealWaitlist(origin) {
    setWaitlistOpen(true);
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth", block: "center" });
    track("waitlist_reveal", { origin });
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">RIT</div>
            <div className="brand-copy">
              <h1>rit-media</h1>
              <p>same story. many sources. visible framing</p>
            </div>
          </div>
          <button className="top-cta" onClick={() => revealWaitlist("topbar")}>Get early access</button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container">
            <div className="hero-head">
              <div>
                <div className="eyebrow">India demo . live grouped headlines</div>
                <h2>One story. Many sources. You decide.</h2>
              </div>
            </div>

            <section className="story-section" aria-label="Grouped stories feed">
              <div className="story-toolbar">
                <p className="feed-status">{status}</p>
              </div>
              <div className="story-rail-shell">
                <div className={`story-rail ${stories.length ? "" : "loading"}`} aria-live="polite">
                  {stories.length ? stories.map((story) => <StoryCard story={story} key={story.id} />) : (
                    <article className="story-card story-card-placeholder">
                      <div className="story-hero story-hero-placeholder">
                        <div className="story-top">
                          <div className="story-meta"><span>No grouped stories yet</span><span>Awaiting refresh</span></div>
                          <div className="score-chip">Feed not ready</div>
                        </div>
                        <div className="headline-static">Run the local database migration and refresh command to build the first snapshot.</div>
                      </div>
                    </article>
                  )}
                </div>
              </div>
            </section>

            <div className="bottom-grid">
              <section className="interest-panel">
                <div className="section-kicker">Interest test</div>
                <h3>Would you use this?</h3>
                <div className="interest-row">
                  {[
                    ["daily_compare", "I would compare daily", "Use this instead of reading one outlet."],
                    ["local_news", "I want local news", "District and city stories like this."],
                    ["bias_signals", "I want bias signals", "Show framing and missing context clearly."],
                    ["transparency", "I care about transparency", "Show source differences before opinion."]
                  ].map(([id, title, copy]) => (
                    <button
                      className={`interest-btn ${selectedInterests.has(id) ? "is-selected" : ""}`}
                      key={id}
                      onClick={() => markInterest(id)}
                    >
                      <strong>{title}</strong>
                      <span>{copy}</span>
                    </button>
                  ))}
                </div>
              </section>

              <aside className="waitlist-panel" id="waitlist">
                <div className="section-kicker">Early access</div>
                <h3>Want the first version?</h3>
                <p className="waitlist-copy">Join only if you would actually want to use this when it becomes real.</p>
                <button className="waitlist-btn" onClick={() => revealWaitlist("panel")}>Get early access</button>
                {waitlistOpen ? (
                  <form className="waitlist-form is-open" onSubmit={submitWaitlist}>
                    <input type="email" placeholder="Enter your email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                    <button type="submit" className="submit-btn">Join waitlist</button>
                  </form>
                ) : null}
                {thanks ? <div className="thank-you is-visible">Thanks - your interest was recorded.</div> : null}
              </aside>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p>rit-media . source comparison . transparency signals . reader judgment</p>
        </div>
      </footer>
    </>
  );
}
