import { readCurrentSnapshot } from "@/lib/news-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await readCurrentSnapshot();

    if (!snapshot || !snapshot.storyCount) {
      return Response.json({
        generatedAt: null,
        articleCount: 0,
        storyCount: 0,
        stories: [],
        message: "No stories are available yet. Please check back shortly."
      });
    }

    return Response.json(snapshot, {
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300"
      }
    });
  } catch (error) {
    const isMissingDatabase = /DATABASE_URL/.test(error.message || "");
    return Response.json({
      generatedAt: null,
      articleCount: 0,
      storyCount: 0,
      stories: [],
      message: "Could not load the latest stories. Please try again shortly."
    }, { status: isMissingDatabase ? 200 : 500 });
  }
}
