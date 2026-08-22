import Fastify, { type FastifyInstance } from "fastify";
import { FixtureCheckout } from "./billing/fixture.js";
import type { CheckoutPort } from "./billing/port.js";
import { DEFAULT_DATABASE_PATH, openDatabase, type AppDb } from "./db.js";
import { checkoutRoutes } from "./http/checkout.js";
import { healthRoutes } from "./http/health.js";
import { aboutRoutes } from "./http/pages/about.js";
import { boardRoutes } from "./http/pages/board.js";
import { rulesRoutes } from "./http/pages/rules.js";
import { webhookRoutes } from "./http/webhook.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
    checkout: CheckoutPort;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
  checkout?: CheckoutPort;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  const db =
    options.db ??
    openDatabase(options.databasePath ?? process.env.DATABASE_PATH ?? ":memory:");
  const checkout = options.checkout ?? new FixtureCheckout();
  app.decorate("db", db);
  app.decorate("checkout", checkout);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  await app.register(healthRoutes);
  await app.register(boardRoutes);
  await app.register(aboutRoutes);
  await app.register(rulesRoutes);
  await app.register(checkoutRoutes);
  await app.register(webhookRoutes);
  return app;
}

export { DEFAULT_DATABASE_PATH };
