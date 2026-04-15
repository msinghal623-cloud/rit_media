import { refreshNewsSnapshot } from "../../lib/server/news-pipeline.mjs";

function isAuthorized(request) {
  const configuredSecret = process.env.REFRESH_SECRET;
  if (!configuredSecret) {
    return true;
  }

  return request.headers.get("x-refresh-secret") === configuredSecret;
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await refreshNewsSnapshot();

  return new Response(
    JSON.stringify({
      ok: true,
      generatedAt: payload.generatedAt,
      articleCount: payload.articleCount,
      groupedStoryCount: payload.groupedStoryCount
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
};
