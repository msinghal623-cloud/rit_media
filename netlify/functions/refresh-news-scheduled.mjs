export const config = {
  schedule: "@hourly"
};

export default async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.REFRESH_SECRET;

  if (!baseUrl || !secret) {
    return new Response(JSON.stringify({
      ok: false,
      message: "Missing URL or REFRESH_SECRET."
    }), {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }

  const response = await fetch(`${baseUrl}/api/refresh-news`, {
    method: "POST",
    headers: {
      "x-refresh-secret": secret
    }
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
};
