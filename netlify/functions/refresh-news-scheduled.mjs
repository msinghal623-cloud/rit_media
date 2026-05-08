import { refreshNewsSnapshot } from "../../src/lib/news-pipeline.js";
import { finishJobRun, startJobRun } from "../../src/lib/db.js";

export const config = {
  schedule: "@hourly"
};

export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  const nextRun = payload?.next_run || null;
  const jobRunId = await startJobRun("refresh-news-scheduled", {
    nextRun,
    source: "netlify-scheduled-function"
  });

  try {
    const snapshot = await refreshNewsSnapshot();

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
        failedSources: snapshot.failedSources
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
