import type { FastifyPluginAsync } from "fastify";
import { defaultClaimBidUsd, listToday } from "../../core/board.js";
import { boardTimeZone, dayKey } from "../../core/day.js";
import { renderBoardPage } from "../../views/board.js";

export const BOARD_PATH = "/" as const;

export const boardRoutes: FastifyPluginAsync = async (app) => {
  app.get(BOARD_PATH, async (_request, reply) => {
    const tz = boardTimeZone();
    const day = dayKey(new Date(), tz);
    const listings = listToday(app.db, day);
    const html = renderBoardPage({
      day,
      tz,
      listings,
      defaultBidUsd: defaultClaimBidUsd(listings),
    });
    return reply.type("text/html; charset=utf-8").send(html);
  });
};
