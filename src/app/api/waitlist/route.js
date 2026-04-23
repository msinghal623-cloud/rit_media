import { saveWaitlistSignup } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request) {
  const payload = await request.json().catch(() => ({}));
  const email = String(payload.email || "").trim().toLowerCase();
  const origin = String(payload.origin || "homepage").trim().slice(0, 80);

  if (!isEmail(email)) {
    return Response.json({ ok: false, message: "Enter a valid email." }, { status: 400 });
  }

  await saveWaitlistSignup({ email, origin });
  return Response.json({ ok: true });
}
