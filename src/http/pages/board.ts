import type { FastifyPluginAsync } from "fastify";
import { defaultClaimBidUsd, listLast24h, listToday } from "../../core/board.js";
import { boardTimeZone, dayKey } from "../../core/day.js";
import { renderBoardPage } from "../../views/board.js";

export const BOARD_PATH = "/" as const;

export const boardRoutes: FastifyPluginAsync = async (app) => {
  app.get(BOARD_PATH, async (_request, reply) => {
    const tz = boardTimeZone();
    const now = app.now();
    const day = dayKey(now, tz);
    const listings = listToday(app.db, day);
    const last24h = listLast24h(app.db, now);
    const html = renderBoardPage({
      day,
      tz,
      listings,
      last24h,
      defaultBidUsd: defaultClaimBidUsd(listings),
      now,
    });
    return reply.type("text/html; charset=utf-8").send(html);
  });
};
