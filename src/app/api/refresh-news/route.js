import { refreshNewsSnapshot } from "@/lib/news-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-refresh-secret") === secret;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, message: "Unauthorized refresh request." }, { status: 401 });
  }

  const snapshot = await refreshNewsSnapshot();
  return Response.json({ ok: true, snapshot });
}

export async function GET(request) {
  return POST(request);
}
