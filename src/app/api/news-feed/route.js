import { readCurrentSnapshot } from "@/lib/news-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await readCurrentSnapshot();

    if (!snapshot || !snapshot.groupedStoryCount) {
      return Response.json({
        generatedAt: null,
        articleCount: 0,
        groupedStoryCount: 0,
        stories: [],
        message: "No processed stories exist yet. Run pnpm refresh:news after configuring DATABASE_URL."
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
      groupedStoryCount: 0,
      stories: [],
      message: error.message || "Could not read the stored stories."
    }, { status: isMissingDatabase ? 200 : 500 });
  }
}
