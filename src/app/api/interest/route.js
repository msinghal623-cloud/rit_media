import { saveInterestEvent } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_INTERESTS = new Set([
  "daily_compare",
  "local_news",
  "bias_signals",
  "transparency"
]);

export async function POST(request) {
  const payload = await request.json().catch(() => ({}));
  const interest = String(payload.interest || "").trim();

  if (!ALLOWED_INTERESTS.has(interest)) {
    return Response.json({ ok: false, message: "Unknown interest." }, { status: 400 });
  }

  await saveInterestEvent({ interest });
  return Response.json({ ok: true });
}
