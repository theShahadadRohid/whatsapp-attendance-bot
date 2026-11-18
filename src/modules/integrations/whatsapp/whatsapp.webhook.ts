
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";

import { env } from "../../../config/env.js";
import { logger } from "../../../common/logging/logger.js";
import { findEmployeeByWhatsAppIdentity } from "../../employees/employee.service.js";
import { trackUnknownContact } from "../../unknown-contacts/unknown-contact.service.js";
import { parseWhatsAppMessages } from "./whatsapp.payload.js";

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
  async (req, res) => {
    if (!env.WHATSAPP_APP_SECRET) {
      res.status(503).send(
        "WhatsApp webhook signature verification is not configured.",
      );
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

    let payload: unknown;

    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      res.status(400).send("Invalid JSON payload.");
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("object" in payload) ||
      payload.object !== "whatsapp_business_account"
    ) {
      res.status(400).send("Invalid WhatsApp webhook payload.");
      return;
    }

    const messages = parseWhatsAppMessages(payload);

    logger.info(
      { messageCount: messages.length },
      "Verified WhatsApp webhook received.",
    );

    try {
      for (const message of messages) {
        if (!message.from && !message.fromUserId) {
          logger.warn(
            { messageId: message.messageId },
            "WhatsApp message has no usable sender identity.",
          );

          continue;
        }

        // Resolve the employee using the available WhatsApp identities.
        const result = await findEmployeeByWhatsAppIdentity({
  ...(message.from ? { phoneNumber: message.from } : {}),
  ...(message.fromUserId ? { bsuid: message.fromUserId } : {}),
});

        if (result.status === "identity_mismatch") {
          logger.warn(
            {
              messageId: message.messageId,
              hasPhoneNumber: Boolean(message.from),
              hasBsuid: Boolean(message.fromUserId),
            },
            "WhatsApp phone number and BSUID do not match the same employee.",
          );

          continue;
        }

        if (result.status === "active") {
          logger.info(
            {
              employeeId: result.employee._id.toString(),
              employeeCode: result.employee.employeeCode,
              messageType: message.type,
            },
            "WhatsApp message received from registered employee.",
          );

          continue;
        }

        if (result.status === "inactive") {
          logger.info(
            {
              employeeId: result.employee._id.toString(),
              employeeCode: result.employee.employeeCode,
            },
            "WhatsApp message received from inactive employee.",
          );

          continue;
        }

        // Prefer BSUID when available; otherwise use the phone number.
        const trackingResult = message.fromUserId
          ? await trackUnknownContact(
              { bsuid: message.fromUserId },
              message.messageId,
            )
          : await trackUnknownContact(
              message.from!,
              message.messageId,
            );

        const identityLog = {
          hasPhoneNumber: Boolean(message.from),
          hasBsuid: Boolean(message.fromUserId),
        };

        if (trackingResult.status === "tracked") {
          logger.info(
            {
              ...identityLog,
              attemptCount: trackingResult.attemptCount,
            },
            "Unknown WhatsApp contact tracked.",
          );
        } else if (trackingResult.status === "restricted") {
          logger.info(
            {
              ...identityLog,
              restrictedUntil: trackingResult.restrictedUntil,
            },
            "Unknown WhatsApp contact is temporarily restricted.",
          );
        } else {
          logger.info(
            {
              ...identityLog,
              messageId: message.messageId,
            },
            "Duplicate WhatsApp message from unknown contact ignored.",
          );
        }
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to identify WhatsApp message sender.",
      );

      res.sendStatus(500);
      return;
    }

    res.sendStatus(200);
  },
);
