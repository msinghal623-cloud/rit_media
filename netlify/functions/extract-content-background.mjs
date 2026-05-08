import { extractPendingArticleContent } from "../../src/lib/news-pipeline.js";
import { finishJobRun, startJobRun } from "../../src/lib/db.js";

const RUN_BUDGET_MS = 10 * 60 * 1000;

function backgroundFunctionUrl(request) {
  return new URL("/.netlify/functions/extract-content-background", request.url).toString();
}

async function invokeNextRun(request) {
  try {
    await fetch(backgroundFunctionUrl(request), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chained: true, startedAt: new Date().toISOString() })
    });
  } catch (error) {
    console.error("Could not enqueue next content extraction run.", {
      message: error?.message || "Unknown error"
    });
  }
}

export default async (request) => {
  const payload = await request.json().catch(() => ({}));
  const jobRunId = await startJobRun("extract-content-background", {
    chained: Boolean(payload?.chained),
    source: payload?.source || "background-function",
    budgetMs: RUN_BUDGET_MS
  });

  try {
    const result = await extractPendingArticleContent({ maxDurationMs: RUN_BUDGET_MS });

    console.log("Content extraction background run completed.", {
      chained: Boolean(payload?.chained),
      attemptedCount: result.attemptedCount,
      stoppedDueToTime: result.stoppedDueToTime
    });

    await finishJobRun(jobRunId, {
      status: "success",
      message: "Background content extraction run completed.",
      metadata: {
        attemptedCount: result.attemptedCount,
        stoppedDueToTime: result.stoppedDueToTime,
        diagnosticsCount: result.diagnostics?.length || 0,
        chained: Boolean(payload?.chained)
      }
    });

    if (result.stoppedDueToTime && result.attemptedCount > 0) {
      await invokeNextRun(request);
    }
  } catch (error) {
    console.error("Content extraction background run failed.", {
      chained: Boolean(payload?.chained),
      message: error?.message || "Unknown error"
    });
    await finishJobRun(jobRunId, {
      status: "failed",
      message: error?.message || "Background content extraction failed.",
      metadata: { chained: Boolean(payload?.chained) }
    });
    throw error;
  }
};
