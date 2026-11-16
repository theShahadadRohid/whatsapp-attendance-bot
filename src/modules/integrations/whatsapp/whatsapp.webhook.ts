
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";

import { env } from "../../../config/env.js";
import { logger } from "../../../common/logging/logger.js";

export const whatsappWebhookRouter = Router();

/**
 * Meta calls this endpoint when registering the webhook.
 * We must return the challenge only when the verify token matches.
 */
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!env.WHATSAPP_VERIFY_TOKEN) {
    res.status(503).send("WhatsApp webhook verification is not configured.");
    return;
  }

  if (
    mode !== "subscribe" ||
    token !== env.WHATSAPP_VERIFY_TOKEN ||
    typeof challenge !== "string"
  ) {
    res.status(403).send("Webhook verification failed.");
    return;
  }

  res.status(200).type("text/plain").send(challenge);
});

/**
 * Verifies Meta's HMAC-SHA256 signature using the original request body.
 */
function isValidSignature(
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!env.WHATSAPP_APP_SECRET || !signature) {
    return false;
  }

  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const receivedSignature = Buffer.from(signature.slice(7), "hex");

  const expectedSignature = createHmac(
    "sha256",
    env.WHATSAPP_APP_SECRET,
  )
    .update(rawBody)
    .digest();

  return (
    receivedSignature.length === expectedSignature.length &&
    timingSafeEqual(receivedSignature, expectedSignature)
  );
}

/**
 * Receives WhatsApp webhook notifications.
 * The raw body is required for signature verification.
 */
whatsappWebhookRouter.post(
  "/",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  (req, res) => {
    if (!env.WHATSAPP_APP_SECRET) {
      res.status(503).send("WhatsApp webhook signature verification is not configured.");
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).send("Invalid webhook request body.");
      return;
    }

    const signature = req.get("X-Hub-Signature-256");

    if (!isValidSignature(req.body, signature)) {
      res.status(401).send("Invalid webhook signature.");
      return;
    }

    try {
      const payload: unknown = JSON.parse(req.body.toString("utf8"));

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("object" in payload) ||
        payload.object !== "whatsapp_business_account"
      ) {
        res.status(400).send("Invalid WhatsApp webhook payload.");
        return;
      }
    } catch {
      res.status(400).send("Invalid JSON payload.");
      return;
    }

    logger.info("Verified WhatsApp webhook received.");

    // Message processing will be added in the next step.
    res.sendStatus(200);
  },
);
