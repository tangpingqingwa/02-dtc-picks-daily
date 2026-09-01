import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrate, type AppDb } from "../src/db.js";

const Database = createRequire(import.meta.url)(
  "better-sqlite3",
) as typeof import("better-sqlite3");

test("migration DDL and marker roll back together and retry cleanly", () => {
  const directory = mkdtempSync(join(tmpdir(), "dtc-migration-atomic-"));
  const path = join(directory, "board.sqlite");
  let db: AppDb | undefined;

  try {
    db = new Database(path);
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        day TEXT NOT NULL,
        product_url TEXT NOT NULL,
        why_test_this_today TEXT NOT NULL,
        bid_usd INTEGER NOT NULL CHECK (bid_usd >= 5),
        paid_usd INTEGER NOT NULL CHECK (paid_usd >= 0),
        clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (day, product_url)
      );
      CREATE TABLE checkout_events (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL REFERENCES listings(id),
        amount_usd INTEGER NOT NULL CHECK (amount_usd >= 0),
        paid_at TEXT NOT NULL
      );
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    ).run("001_init.sql", "2026-08-27T00:00:00.000Z");
    db.prepare(
      "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    ).run("002_checkouts.sql", "2026-08-27T00:00:00.000Z");
    db.exec(`
      CREATE TRIGGER fail_003_marker
      BEFORE INSERT ON schema_migrations
      WHEN NEW.id = '003_checkout_reservations.sql'
      BEGIN
        SELECT RAISE(ABORT, 'forced migration marker failure');
      END;
    `);

    assert.throws(() => migrate(db as AppDb), /forced migration marker failure/);
    assert.equal(
      db
        .prepare<[string], { count: number }>(
          "SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?",
        )
        .get("003_checkout_reservations.sql")?.count,
      0,
    );
    assert.equal(
      db
        .prepare<[string], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("checkout_reservations"),
      undefined,
    );
    const eventColumns = db
      .prepare("PRAGMA table_info(checkout_events)")
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      eventColumns.map((column) => column.name),
      ["id", "listing_id", "amount_usd", "paid_at"],
    );

    db.exec("DROP TRIGGER fail_003_marker");
    db.close();
    db = undefined;

    db = new Database(path);
    db.pragma("foreign_keys = ON");
    migrate(db);
    migrate(db);
    assert.deepEqual(
      db
        .prepare<[], { id: string }>(
          "SELECT id FROM schema_migrations ORDER BY id",
        )
        .all()
        .map((row) => row.id),
      [
        "001_init.sql",
        "002_checkouts.sql",
        "003_checkout_reservations.sql",
        "004_polar_webhook_deliveries.sql",
        "005_waffo_payment_boundary.sql",
        "006_waffo_webhook_conflicts.sql",
        "007_waffo_tax_audit.sql",
        "008_waffo_webhook_rejections.sql",
        "009_waffo_conflict_identity_indexes.sql",
      ],
    );
    assert.ok(
      db
        .prepare<[string], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("checkout_reservations"),
    );
    const migratedEventColumns = db
      .prepare("PRAGMA table_info(checkout_events)")
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      migratedEventColumns.map((column) => column.name),
      ["id", "listing_id", "amount_usd", "paid_at", "day", "product_url", "bid_usd"],
    );
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
