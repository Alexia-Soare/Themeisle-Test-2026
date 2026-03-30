import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";
import { applyMigrations } from "./apply-migrations";

const dbFile = process.env.DB_FILE_NAME || "prediction_market.db";
const sqlite = new Database(dbFile);
const db = drizzle(sqlite, { schema });

console.log("Running migrations...");
await applyMigrations(db);
console.log("✅ Migrations completed");
