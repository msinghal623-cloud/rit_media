import { ensureSchema } from "../../src/lib/db.js";

await ensureSchema();
console.log("Database schema is ready.");
