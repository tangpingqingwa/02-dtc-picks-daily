import type { FastifyPluginAsync } from "fastify";
import { ClickError, incrementClick } from "../core/clicks.js";

export const REDIRECT_PATH = "/r/:id" as const;

export const redirectRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>(REDIRECT_PATH, async (request, reply) => {
    try {
      const listing = incrementClick(app.db, request.params.id);
      return reply.redirect(listing.productUrl, 302);
    } catch (error) {
      if (error instanceof ClickError) {
        return reply.status(error.statusCode).type("text/plain; charset=utf-8").send(error.message);
      }
      throw error;
    }
  });
};
