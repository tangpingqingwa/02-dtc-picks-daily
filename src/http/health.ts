import type { FastifyPluginAsync } from "fastify";
import { validateBoardTimeZone } from "../core/day.js";

export const HEALTHZ_PATH = "/healthz" as const;

export type HealthzOk = {
  ok: true;
  ready: true;
  boardTimeZone: string;
};

export type HealthzFailure = {
  ok: false;
  ready: false;
  error: string;
};

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(HEALTHZ_PATH, async (_request, reply): Promise<HealthzOk | HealthzFailure> => {
    try {
      const boardTimeZone = validateBoardTimeZone();
      app.db.prepare("SELECT 1").get();
      return { ok: true, ready: true, boardTimeZone };
    } catch (error) {
      const message = error instanceof Error ? error.message : "readiness check failed";
      return reply.status(503).send({ ok: false, ready: false, error: message });
    }
  });
};
