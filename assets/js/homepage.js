(function () {
  const topWaitlistBtn = document.getElementById("topWaitlistBtn");
  const waitlistRevealBtn = document.getElementById("waitlistRevealBtn");
  const waitlistForm = document.getElementById("waitlistForm");
  const thankYou = document.getElementById("thankYou");
  const interestButtons = document.querySelectorAll(".interest-btn");
  const storyRail = document.getElementById("storyRail");
  const feedStatus = document.getElementById("feedStatus");

  function track(eventName, params) {
    if (typeof gtag === "function") {
      gtag("event", eventName, params || {});
    }
  }

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function revealWaitlist(origin) {
    waitlistForm.classList.add("is-open");
    document.getElementById("waitlist").scrollIntoView({ behavior: "smooth", block: "center" });
    track("waitlist_reveal", { origin });
  }

  function formatDate(value) {
    if (!value) {
      return "Latest";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short"
    }).format(new Date(value));
  }

  function domainFromLink(link) {
    try {
      return new URL(link, window.location.href).hostname;
    } catch (_) {
      return "";
    }
  }

  function toStoryImage(story) {
    if (story.image) {
      return {
        url: story.image,
        kind: "article"
      };
    }

    const sourceWithImage = (story.sources || []).find((source) => source.image);
    if (sourceWithImage?.image) {
      return {
        url: sourceWithImage.image,
        kind: "article"
      };
    }

    const sourceWithLink = (story.sources || []).find((source) => source.link);
    const sourceDomain = domainFromLink(sourceWithLink?.link || "");
    if (sourceDomain) {
      return {
        url: "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(sourceDomain) + "&sz=256",
        kind: "source"
      };
    }

    return {
      url: "",
      kind: "none"
    };
  }

  function sourceGridClass(count) {
    return count > 3 ? "is-expanded" : "is-compact";
  }

  function buildSourceMosaic(story) {
    const sourceTiles = (story.sources || [])
      .slice(0, 4)
      .map((source) => {
        const domain = domainFromLink(source.link || "");
        if (!domain) {
          return "";
        }

        const faviconUrl = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(domain) + "&sz=256";
        return '<div class="story-source-tile">' +
          '<div class="story-source-icon" style="background-image: url(&quot;' + escapeAttribute(faviconUrl) + '&quot;);"></div>' +
          '<span>' + escapeHtml(source.sourceName) + "</span>" +
        "</div>";
      })
      .filter(Boolean)
      .join("");

    if (!sourceTiles) {
      return "";
    }

    return '<div class="story-source-mosaic">' + sourceTiles + "</div>";
  }

  function storyCardTemplate(story) {
    const detailId = story.id + "-detail";
    const visibleSources = (story.sources || []).slice(0, story.sourceCount > 3 ? 6 : 3);
    const signals = (story.signals || []).length
      ? story.signals.map((signal) => '<span class="tag">' + escapeHtml(signal) + "</span>").join("")
      : '<span class="tag">Grouped from overlapping headlines</span>';
    const sources = visibleSources.map((source, index) => {
      return '<div class="source-item">' +
        '<div class="source-left">' +
          '<div class="source-name">' + escapeHtml(source.sourceName) + "</div>" +
          '<div class="source-framing">' + escapeHtml(source.framing) + "</div>" +
          '<div class="source-title">' + escapeHtml(source.title) + "</div>" +
        "</div>" +
        '<a class="source-pill" href="' + escapeHtml(source.link) + '" target="_blank" rel="noopener" data-track="' + escapeHtml(story.id + "_" + source.sourceId + "_" + (index + 1)) + '">Open source</a>' +
      "</div>";
    }).join("");
    const heroImage = toStoryImage(story);
    const heroMedia = heroImage.url
      ? '<div class="story-hero-media" style="background-image: url(&quot;' + escapeAttribute(heroImage.url) + '&quot;);"></div>'
      : "";
    const heroClass = heroImage.kind === "source" ? " story-hero-source-fallback" : "";
    const sourceMosaic = heroImage.kind === "source" ? buildSourceMosaic(story) : "";

    return '<article class="story-card" data-story="' + escapeHtml(story.id) + '">' +
      '<div class="story-shell">' +
        '<div class="story-hero' + heroClass + '">' +
          heroMedia +
          sourceMosaic +
          '<div class="story-top">' +
            '<div class="story-meta">' +
              "<span>" + escapeHtml(story.theme || "Top story") + "</span>" +
              "<span>.</span>" +
              "<span>" + escapeHtml(formatDate(story.publishedAt)) + "</span>" +
              "<span>.</span>" +
              "<span>" + escapeHtml(String(story.sourceCount || 0)) + " sources</span>" +
            "</div>" +
            '<div class="score-chip">' + escapeHtml(story.transparency || "Transparency: limited") + "</div>" +
          "</div>" +
          '<div class="story-heading-wrap">' +
            '<button class="headline-btn" data-target="' + escapeHtml(detailId) + '" data-ui-label="' + escapeHtml(story.id + "_headline") + '">' + escapeHtml(story.title) + "</button>" +
            '<div class="story-heading-badges">' +
              '<span class="story-badge">' + escapeHtml((story.sourceCount || visibleSources.length) > 3 ? "6-source view" : "3-source view") + "</span>" +
              '<span class="story-badge">' + escapeHtml(story.theme || "Top story") + "</span>" +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div class="story-body">' +
          '<p class="story-summary">' + escapeHtml(story.summary || "") + "</p>" +
          '<div class="signal-row">' + signals + "</div>" +
          '<div class="source-list ' + sourceGridClass(visibleSources.length) + '">' + sources + "</div>" +
          '<div class="story-detail" id="' + escapeHtml(detailId) + '">This grouped story combines overlapping reporting from multiple publishers in the latest refresh snapshot.</div>' +
        "</div>" +
      "</div>" +
      "</article>";
  }

  function renderStories(stories) {
    storyRail.classList.remove("loading");

    if (!stories.length) {
      storyRail.innerHTML = '<article class="story-card story-card-placeholder">' +
        '<div class="story-shell">' +
          '<div class="story-hero story-hero-placeholder">' +
            '<div class="story-top">' +
              '<div class="story-meta"><span>No grouped stories yet</span><span>.</span><span>Awaiting refresh</span></div>' +
              '<div class="score-chip">Feed not ready</div>' +
            "</div>" +
            '<div class="headline-static">Deploy the site, run the refresh function once, and the hourly Netlify schedule will keep this homepage updated from the stored feed snapshot.</div>' +
          "</div>" +
        "</div>" +
        "</article>";
      return;
    }

    storyRail.innerHTML = stories.map(storyCardTemplate).join("");
  }

  async function loadStories() {
    feedStatus.textContent = "Loading prepared news snapshot...";

    try {
      const response = await fetch("/api/news-feed", {
        headers: {
          accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Feed request failed with status " + response.status);
      }

      const payload = await response.json();
      renderStories(payload.stories || []);
      feedStatus.textContent = payload.generatedAt
        ? "Last refresh: " + new Date(payload.generatedAt).toLocaleString("en-IN") + ". " + (payload.articleCount || 0) + " articles processed into " + (payload.groupedStoryCount || 0) + " grouped stories."
        : (payload.message || "No snapshot exists yet.");
      track("feed_loaded", {
        article_count: payload.articleCount || 0,
        grouped_story_count: payload.groupedStoryCount || 0
      });
    } catch (error) {
      renderStories([]);
      feedStatus.textContent = "Could not load the prepared feed from the Netlify API.";
      track("feed_error", { message: error.message || "Unknown error" });
    }
  }

  interestButtons.forEach((button) => {
    button.addEventListener("click", function () {
      this.classList.add("is-selected");
      track("interest_click", { interest: this.getAttribute("data-interest") });
    });
  });

  topWaitlistBtn.addEventListener("click", function () {
    revealWaitlist("topbar");
  });

  waitlistRevealBtn.addEventListener("click", function () {
    revealWaitlist("panel");
  });

  waitlistForm.addEventListener("submit", function (event) {
    event.preventDefault();
    waitlistForm.classList.remove("is-open");
    thankYou.classList.add("is-visible");
    track("waitlist_submit");
  });

  document.addEventListener("click", function (event) {
    const headlineButton = event.target.closest(".headline-btn");
    if (headlineButton) {
      const targetPanel = document.getElementById(headlineButton.getAttribute("data-target"));
      const isOpen = targetPanel.classList.contains("is-open");
      document.querySelectorAll(".story-detail").forEach((panel) => panel.classList.remove("is-open"));
      if (!isOpen) {
        targetPanel.classList.add("is-open");
      }
    }

    const el = event.target;
    const clickableAncestor = el.closest("a, button, .story-card, .tag, .score-chip, .story-badge, .brand, .source-item, .story-meta, .interest-panel, .waitlist-panel");
    const trackedEl = clickableAncestor || el;
    const storyCard = trackedEl.closest(".story-card");
    const section = trackedEl.closest("section, header, footer, article, aside");
    const href = trackedEl.getAttribute && trackedEl.getAttribute("href") ? trackedEl.getAttribute("href") : "";

    if (trackedEl.matches && trackedEl.matches("a[data-track]")) {
      track("source_open", {
        source: trackedEl.getAttribute("data-track"),
        story: trackedEl.closest(".story-card")?.getAttribute("data-story") || ""
      });
    }

    track("ui_click", {
      tag: (trackedEl.tagName || "").toLowerCase(),
      label: trackedEl.getAttribute?.("data-ui-label") || trackedEl.getAttribute?.("data-track") || cleanText(trackedEl.textContent),
      id: trackedEl.id || "",
      class_name: typeof trackedEl.className === "string" ? trackedEl.className.split(" ").slice(0, 3).join("_") : "",
      story: storyCard ? storyCard.getAttribute("data-story") : "",
      section: section ? (section.id || section.className.toString().split(" ")[0]) : "",
      href_domain: href ? (() => { try { return new URL(href, window.location.href).hostname; } catch (_) { return ""; } })() : ""
    });
  }, true);

  loadStories();
})();
