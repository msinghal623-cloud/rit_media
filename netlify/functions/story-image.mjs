function safeAbsoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractMetaImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return safeAbsoluteUrl(match[1], pageUrl);
    }
  }

  return "";
}

export default async (request) => {
  const pageUrl = new URL(request.url).searchParams.get("url") || "";

  if (!/^https?:\/\//i.test(pageUrl)) {
    return new Response(JSON.stringify({ image: "" }), {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }

  try {
    const response = await fetch(pageUrl, {
      headers: {
        "user-agent": "rit-media/1.0 (+https://rit-media.netlify.app)"
      }
    });

    if (!response.ok) {
      throw new Error("Source page request failed");
    }

    const html = await response.text();
    const image = extractMetaImage(html, pageUrl);

    return new Response(JSON.stringify({ image }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=1800, stale-while-revalidate=86400"
      }
    });
  } catch {
    return new Response(JSON.stringify({ image: "" }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=120, stale-while-revalidate=600"
      }
    });
  }
};
