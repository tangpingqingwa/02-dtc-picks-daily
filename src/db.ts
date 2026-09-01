import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type AppDb = import("better-sqlite3").Database;

const Database = createRequire(import.meta.url)(
  "better-sqlite3",
) as typeof import("better-sqlite3");

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

type MigrationRow = { id: string };

export const DEFAULT_DATABASE_PATH = "./data/board.sqlite";

export function openDatabase(path: string): AppDb {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  if (path !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: AppDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    db
      .prepare<[], MigrationRow>("SELECT id FROM schema_migrations")
      .all()
      .map((row) => row.id),
  );
  const insert = db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    // Keep the DDL/data change and its marker in one SQLite transaction. The
    // marker is re-checked after the write lock is acquired so two app
    // instances cannot both replay a migration from the same stale snapshot.
    const applyMigration = db.transaction(() => {
      const marker = db
        .prepare<[string], MigrationRow>(
          "SELECT id FROM schema_migrations WHERE id = ?",
        )
        .get(file);
      if (marker) {
        return;
      }
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      insert.run(file, new Date().toISOString());
    });
    applyMigration.immediate();
  }
}
