import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptsDir);
const sourceDir = join(root, "src", "migrations");
const outputDir = join(root, "dist", "src", "migrations");
const migrations = readdirSync(sourceDir).filter((name) => name.endsWith(".sql")).sort();

if (migrations.length === 0) {
  throw new Error("no SQLite migrations found in src/migrations");
}

// The migration directory is generated output. Recreate it so an incremental
// build cannot retain a removed or renamed SQL file from an older artifact.
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
for (const migration of migrations) {
  copyFileSync(join(sourceDir, migration), join(outputDir, migration));
}
console.log(`copied ${migrations.length} SQLite migrations to dist/src/migrations`);
