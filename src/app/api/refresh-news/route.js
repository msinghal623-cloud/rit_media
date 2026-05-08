import { refreshNewsSnapshot } from "@/lib/news-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-refresh-secret") === secret;
}

async function invokeContentExtraction(request) {
  try {
    const url = new URL("/.netlify/functions/extract-content-background", request.url).toString();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual-refresh", startedAt: new Date().toISOString() })
    });

    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error.message || "Could not start content extraction." };
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, message: "Unauthorized refresh request." }, { status: 401 });
  }

  const snapshot = await refreshNewsSnapshot();
  const extraction = await invokeContentExtraction(request);
  return Response.json({ ok: true, snapshot, extraction });
}

export async function GET(request) {
  return POST(request);
}
