import "../load-env.js";
import { ensureSchema, resetSchema } from "../../src/lib/db.js";

await resetSchema();
await ensureSchema();

console.log("Database schema was reset and recreated.");
