import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildApp, DEFAULT_DATABASE_PATH } from "./app.js";
import { createCheckoutPort } from "./billing/port.js";
import { validateProductionConfig } from "./config.js";
import { listenHost } from "./config.js";
import { validateBoardTimeZone } from "./core/day.js";

const DEFAULT_PORT = 3000;

export function parseListenPort(value = process.env.PORT): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer 1-65535, got ${JSON.stringify(value)}`);
  }
  return port;
}

export function isExecutedAsMain(
  metaUrl = import.meta.url,
  entry = process.argv[1],
): boolean {
  if (!entry) {
    return false;
  }
  return metaUrl === pathToFileURL(path.resolve(entry)).href;
}

if (isExecutedAsMain()) {
  const databasePath = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
  const mode = validateProductionConfig(process.env, process.env.DATABASE_PATH);
  validateBoardTimeZone();
  const app = await buildApp({
    logger: true,
    databasePath,
    checkout: createCheckoutPort(),
  });
  await app.listen({ host: listenHost(process.env, mode), port: parseListenPort() });
}
