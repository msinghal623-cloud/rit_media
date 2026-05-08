import { refreshNewsSnapshot } from "../../src/lib/news-pipeline.js";

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
  } catch (error) {
    console.error("Could not invoke content extraction background function.", {
      message: error?.message || "Unknown error"
    });
  }
}

export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  const nextRun = payload?.next_run || null;

  try {
    const snapshot = await refreshNewsSnapshot();
    await invokeContentExtraction(req);

    console.log("Scheduled refresh completed.", {
      nextRun,
      storyCount: snapshot.storyCount,
      articleCount: snapshot.articleCount,
      successfulSources: snapshot.successfulSources,
      failedSources: snapshot.failedSources
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Scheduled refresh failed.", {
      nextRun,
      message: error?.message || "Unknown error"
    });

    return new Response(null, { status: 500 });
  }
};
