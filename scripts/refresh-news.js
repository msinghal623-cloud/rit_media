import "./load-env.js";
import { refreshNewsSnapshot } from "../src/lib/news-pipeline.js";

const snapshot = await refreshNewsSnapshot();

console.log(`Refreshed ${snapshot.articleCount} articles into ${snapshot.groupedStoryCount} grouped stories.`);
console.log(`Successful sources: ${snapshot.successfulSources}. Failed sources: ${snapshot.failedSources}.`);
