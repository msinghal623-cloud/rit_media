import { refreshNewsSnapshot } from "../../src/lib/news-pipeline.js";
import { finishJobRun, startJobRun } from "../../src/lib/db.js";

export const config = {
  schedule: "@hourly"
};

async function invokeContentExtraction(request) {
  const url = new URL("/.netlify/functions/extract-content-background", request.url).toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "scheduled-refresh", startedAt: new Date().toISOString() })
    });

    console.log("Content extraction background function invoked.", {
      status: response.status
    });

    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.error("Could not invoke content extraction background function.", {
      message: error?.message || "Unknown error"
    });

    return { ok: false, error: error?.message || "Unknown error" };
  }
}

export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  const nextRun = payload?.next_run || null;
  const jobRunId = await startJobRun("refresh-news-scheduled", {
    nextRun,
    source: "netlify-scheduled-function"
  });

  try {
    const snapshot = await refreshNewsSnapshot();
    const extractionInvoke = await invokeContentExtraction(req);

    console.log("Scheduled refresh completed.", {
      nextRun,
      storyCount: snapshot.storyCount,
      articleCount: snapshot.articleCount,
      successfulSources: snapshot.successfulSources,
      failedSources: snapshot.failedSources
    });

    await finishJobRun(jobRunId, {
      status: "success",
      message: "Scheduled RSS refresh and story grouping completed.",
      metadata: {
        storyCount: snapshot.storyCount,
        articleCount: snapshot.articleCount,
        successfulSources: snapshot.successfulSources,
        failedSources: snapshot.failedSources,
        extractionInvoke
      }
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Scheduled refresh failed.", {
      nextRun,
      message: error?.message || "Unknown error"
    });

    await finishJobRun(jobRunId, {
      status: "failed",
      message: error?.message || "Scheduled refresh failed.",
      metadata: { nextRun }
    });

    return new Response(null, { status: 500 });
  }
};
