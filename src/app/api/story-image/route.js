export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function absoluteImageUrl(imageUrl, pageUrl) {
  try {
    return new URL(imageUrl, pageUrl).toString();
  } catch {
    return "";
  }
}

function pickOpenGraphImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return absoluteImageUrl(match[1], pageUrl);
    }
  }

  return "";
}

export async function GET(request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return Response.json({ image: "" }, { status: 400 });
  }

  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) {
      return Response.json({ image: "" }, { status: 400 });
    }

    const response = await fetch(target.toString(), {
      headers: {
        "user-agent": "rit-media/2.0 (+https://rit-media.netlify.app)"
      }
    });

    if (!response.ok) {
      return Response.json({ image: "" });
    }

    const html = await response.text();
    return Response.json({ image: pickOpenGraphImage(html, target.toString()) });
  } catch {
    return Response.json({ image: "" });
  }
}
