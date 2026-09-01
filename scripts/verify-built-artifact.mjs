import { spawn } from "node:child_process";
import { createServer, get } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptsDir);
const sourceMigrationsDir = join(root, "src", "migrations");
const migrationsDir = join(root, "dist", "src", "migrations");
const sourceMigrations = readMigrationManifest(sourceMigrationsDir);
const compiledMigrations = readMigrationManifest(migrationsDir);
const sourceNames = sourceMigrations.map(({ name }) => name);
const compiledNames = compiledMigrations.map(({ name }) => name);
if (!sameNames(sourceNames, compiledNames)) {
  throw new Error(
    `compiled migration manifest mismatch: source=[${sourceNames.join(", ")}] compiled=[${compiledNames.join(", ")}]`,
  );
}
for (const sourceMigration of sourceMigrations) {
  const compiledMigration = compiledMigrations.find(({ name }) => name === sourceMigration.name);
  if (!compiledMigration || !sourceMigration.bytes.equals(compiledMigration.bytes)) {
    throw new Error(`compiled migration content mismatch: ${sourceMigration.name}`);
  }
}

const port = await freePort();
const workdir = mkdtempSync(join(tmpdir(), "dtc-built-artifact-"));
const childEnv = {
  ...process.env,
  PAYMENT_MODE: "fixture",
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  BOARD_TZ: "UTC",
  DATABASE_PATH: join(workdir, "board.sqlite"),
  PORT: String(port),
};
for (const key of Object.keys(childEnv)) {
  if (key === "WAFFO_MODE" || key.startsWith("WAFFO_") || key.startsWith("POLAR_")) {
    delete childEnv[key];
  }
}

const child = spawn(process.execPath, [join(root, "dist", "src", "server.js")], {
  cwd: root,
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-4_000);
});

try {
  const response = await waitForHealth(port, child);
  let body;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw new Error(`compiled health response was not JSON: ${response.body}`);
  }
  if (
    response.statusCode !== 200 ||
    body?.ok !== true ||
    body?.ready !== true ||
    body?.boardTimeZone !== "UTC"
  ) {
    throw new Error(`compiled health response was not ready: ${response.statusCode} ${response.body}`);
  }
  console.log(`compiled artifact smoke: PASS (${sourceMigrations.length} exact migrations, /healthz ready)`);
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await onceExit(child);
  }
  rmSync(workdir, { recursive: true, force: true });
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (address === null || typeof address === "string") {
    listener.close();
    throw new Error("could not allocate a local test port");
  }
  const selected = address.port;
  await new Promise((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
  return selected;
}

async function waitForHealth(portNumber, processHandle) {
  const deadline = Date.now() + 5_000;
  let lastError = "server did not answer";
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`compiled server exited before readiness: ${stderr || "no stderr"}`);
    }
    try {
      return await requestHealth(portNumber);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`compiled server readiness timed out: ${lastError}; ${stderr}`);
}

function requestHealth(portNumber) {
  return new Promise((resolve, reject) => {
    const request = get({ hostname: "127.0.0.1", port: portNumber, path: "/healthz" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve({ statusCode: response.statusCode, body }));
    });
    request.setTimeout(500, () => request.destroy(new Error("health request timed out")));
    request.on("error", reject);
  });
}

function onceExit(processHandle) {
  return new Promise((resolve) => {
    if (processHandle.exitCode !== null) {
      resolve();
      return;
    }
    processHandle.once("exit", resolve);
  });
}

function readMigrationManifest(directory) {
  let names;
  try {
    names = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read SQLite migrations in ${directory}: ${detail}`);
  }
  if (names.length === 0) {
    throw new Error(`no SQLite migrations found in ${directory}`);
  }
  return names.map((name) => ({ name, bytes: readFileSync(join(directory, name)) }));
}

function sameNames(left, right) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}
