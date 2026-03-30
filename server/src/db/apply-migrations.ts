import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

function splitStatements(fileContents: string): string[] {
  // Drizzle breakpoint comments may produce empty statements on Bun SQLite, so normalize and filter.
  return fileContents
    .replaceAll("--> statement-breakpoint", ";")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function isIgnorableMigrationError(error: unknown): boolean {
  const getMessage = (value: unknown): string => {
    if (typeof value === "string") {
      return value.toLowerCase();
    }

    if (value instanceof Error) {
      return value.message.toLowerCase();
    }

    return "";
  };

  const message = getMessage(error);
  const nestedCause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  const nestedMessage = getMessage(nestedCause);

  return [message, nestedMessage].some(
    (candidate) =>
      candidate.includes("duplicate column name") ||
      candidate.includes("already exists") ||
      candidate.includes("duplicate key name"),
  );
}

export async function applyMigrations(
  db: BunSQLiteDatabase<typeof schema>,
  migrationsFolder = DEFAULT_MIGRATIONS_FOLDER,
) {
  const migrationFiles = (await readdir(migrationsFolder))
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));

  for (const file of migrationFiles) {
    const fullPath = join(migrationsFolder, file);
    const contents = await readFile(fullPath, "utf8");
    const statements = splitStatements(contents);

    for (const statement of statements) {
      try {
        db.run(sql.raw(statement));
      } catch (error) {
        if (!isIgnorableMigrationError(error)) {
          throw error;
        }
      }
    }
  }
}
