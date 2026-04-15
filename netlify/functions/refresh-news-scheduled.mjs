export const config = {
  schedule: "@hourly"
};

export default async (request) => {
  const origin = new URL(request.url).origin;
  const headers = {
    "content-type": "application/json"
  };

  if (process.env.REFRESH_SECRET) {
    headers["x-refresh-secret"] = process.env.REFRESH_SECRET;
  }

  const response = await fetch(`${origin}/.netlify/functions/refresh-news-background`, {
    method: "POST",
    headers,
    body: JSON.stringify({ trigger: "scheduled" })
  });

  return new Response(
    JSON.stringify({
      ok: response.ok,
      status: response.status
    }),
    {
      status: response.ok ? 200 : 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
};
