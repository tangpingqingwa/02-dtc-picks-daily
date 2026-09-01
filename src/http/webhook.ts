import type { FastifyPluginAsync } from "fastify";
import type { WebhookResult } from "../billing/port.js";
import {
  recordWaffoWebhookRejection,
  settleWaffoPayment,
  WaffoPaymentConflictError,
} from "../core/board.js";

export const WAFFO_WEBHOOK_PATH = "/webhooks/waffo" as const;

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.post(WAFFO_WEBHOOK_PATH, async (request, reply) => {
    const rawBody = rawWebhookBody(request.body);
    const headers = requestHeaders(request.headers);
    let result: WebhookResult;
    try {
      result = await app.checkout.parseWebhook(rawBody, headers);
    } catch (error) {
      return webhookError(reply, error);
    }
    if ("ignored" in result) {
      return reply.send({ received: true, applied: false, ignored: true });
    }
    if ("rejected" in result) {
      const outcome = recordWaffoWebhookRejection(app.db, result);
      if (outcome.status === "replayed") {
        return reply.send({ received: true, applied: false, status: outcome.status });
      }
      return reply.status(409).send({
        received: true,
        applied: false,
        status: outcome.status,
        reason: outcome.reason,
      });
    }
    if (result.provider !== "waffo") {
      return reply.status(400).send({ error: "WAFFO_WEBHOOK_REJECTED: Waffo provider is required" });
    }
    const event = result;
    if (
      !event.deliveryId ||
      !event.eventId ||
      !event.paymentId ||
      !event.orderId ||
      !event.payloadHash ||
      !event.normalizedFingerprint ||
      !event.draft.intentFingerprint ||
      !event.metadataFingerprint ||
      !event.productId ||
      !event.storeId ||
      !event.mode ||
      !event.currency ||
      event.subtotalCents === undefined ||
      event.taxCents === undefined ||
      event.amountCents === undefined ||
      event.totalCents === undefined
    ) {
      return reply.status(400).send({ error: "WAFFO_WEBHOOK_REJECTED: verified event identity is incomplete" });
    }
    let outcome;
    try {
      outcome = settleWaffoPayment(app.db, {
        deliveryId: event.deliveryId,
        eventType: event.eventType ?? "order.completed",
        eventId: event.eventId,
        paymentId: event.paymentId,
        orderId: event.orderId,
        intentId: event.draft.intentId ?? event.sessionId,
        payloadHash: event.payloadHash,
        normalizedFingerprint: event.normalizedFingerprint,
        intentFingerprint: event.draft.intentFingerprint,
        metadataFingerprint: event.metadataFingerprint,
        productId: event.productId,
        storeId: event.storeId,
        mode: event.mode,
        currency: "USD",
        subtotalCents: event.subtotalCents,
        taxCents: event.taxCents,
        amountCents: event.amountCents,
        totalCents: event.totalCents,
        productUrl: event.draft.productUrl,
        whyTestThisToday: event.draft.whyTestThisToday,
        bidUsd: event.draft.bidUsd,
        chargeUsd: event.draft.chargeUsd,
        day: event.draft.day,
        paidAt: event.paidAt,
        receivedAt: app.now().toISOString(),
        quoteBaseBidCents:
          event.draft.quoteBaseBidUsd === undefined
            ? undefined
            : event.draft.quoteBaseBidUsd * 100,
      });
    } catch (error) {
      if (error instanceof WaffoPaymentConflictError) {
        return reply.status(409).send({ error: error.message });
      }
      throw error;
    }
    if (outcome.status === "needs_reconciliation") {
      return reply.status(202).send({
        received: true,
        applied: false,
        status: outcome.status,
        reason: outcome.reason,
      });
    }
    if (outcome.status === "rejected") {
      return reply.status(409).send({
        received: true,
        applied: false,
        status: outcome.status,
        reason: outcome.reason,
      });
    }
    return reply.send({
      received: true,
      applied: outcome.status === "applied",
      status: outcome.status,
    });
  });
};

function requestHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (Array.isArray(value) && value[0]) {
      result[key] = value[0];
    }
  }
  return result;
}

function webhookError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
): unknown {
  const message = error instanceof Error ? error.message : "invalid webhook";
  const status =
    message.startsWith("BLOCKED-SECRET") ||
    message.startsWith("WAFFO_WEBHOOK_") ||
    message.includes("signature") ||
    message.includes("webhook") ||
    message.includes("Webhook") ||
    message.includes("required headers")
      ? 400
      : 500;
  return reply.status(status).send({ error: message });
}

function rawWebhookBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  return JSON.stringify(body ?? {});
}
