import type { FastifyPluginAsync } from "fastify";
import type { WebhookResult } from "../billing/port.js";
import { applyPaidBid } from "../core/board.js";

export const POLAR_WEBHOOK_PATH = "/webhooks/polar" as const;

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.post(POLAR_WEBHOOK_PATH, async (request, reply) => {
    const rawBody = rawWebhookBody(request.body);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (Array.isArray(value) && value[0]) {
        headers[key] = value[0];
      }
    }
    let result: WebhookResult;
    try {
      result = await app.checkout.parseWebhook(rawBody, headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid webhook";
      const status =
        message.startsWith("BLOCKED-SECRET") || message.includes("signature") ? 400 : 500;
      return reply.status(status).send({ error: message });
    }
    if ("ignored" in result) {
      return reply.send({ received: true, applied: false });
    }
    applyPaidBid(app.db, {
      sessionId: result.sessionId,
      productUrl: result.draft.productUrl,
      whyTestThisToday: result.draft.whyTestThisToday,
      bidUsd: result.draft.bidUsd,
      day: result.draft.day,
      paidUsd: result.amountUsd,
      paidAt: result.paidAt,
    });
    return reply.send({ received: true, applied: true });
  });
};

function rawWebhookBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  return JSON.stringify(body ?? {});
}
