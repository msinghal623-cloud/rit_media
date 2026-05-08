import { finishJobRun, startJobRun } from "../../src/lib/db.js";

export const config = {
  schedule: "*/15 * * * *"
};

async function invokeContentExtraction(request) {
  const url = new URL("/.netlify/functions/extract-content-background", request.url).toString();

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "scheduled-extraction", startedAt: new Date().toISOString() })
  });

  return { ok: response.ok, status: response.status };
}

export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  const nextRun = payload?.next_run || null;
  const jobRunId = await startJobRun("extract-content-scheduled", {
    nextRun,
    source: "netlify-scheduled-function"
  });

  try {
    const extractionInvoke = await invokeContentExtraction(req);

    console.log("Scheduled content extraction invoked.", {
      nextRun,
      status: extractionInvoke.status
    });

    await finishJobRun(jobRunId, {
      status: extractionInvoke.ok ? "success" : "failed",
      message: extractionInvoke.ok
        ? "Scheduled content extraction background run invoked."
        : "Scheduled content extraction background run could not be invoked.",
      metadata: { extractionInvoke }
    });

    return new Response(null, { status: extractionInvoke.ok ? 204 : 500 });
  } catch (error) {
    console.error("Scheduled content extraction invoke failed.", {
      nextRun,
      message: error?.message || "Unknown error"
    });

    await finishJobRun(jobRunId, {
      status: "failed",
      message: error?.message || "Scheduled content extraction invoke failed.",
      metadata: { nextRun }
    });

    return new Response(null, { status: 500 });
  }
};
