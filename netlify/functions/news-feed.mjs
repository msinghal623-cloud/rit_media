import { readCurrentSnapshot } from "../../lib/server/news-pipeline.mjs";

export default async () => {
  const snapshot = await readCurrentSnapshot();

  if (!snapshot) {
    return new Response(
      JSON.stringify({
        generatedAt: null,
        articleCount: 0,
        groupedStoryCount: 0,
        stories: [],
        message: "No feed snapshot exists yet. Trigger the refresh function after deploy."
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60, stale-while-revalidate=300"
        }
      }
    );
  }

  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=900"
    }
  });
};
