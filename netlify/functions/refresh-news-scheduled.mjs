import { refreshNewsSnapshot } from "../../src/lib/news-pipeline.js";

export const config = {
  schedule: "@hourly"
};

export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  const nextRun = payload?.next_run || null;

  try {
    const snapshot = await refreshNewsSnapshot();

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
