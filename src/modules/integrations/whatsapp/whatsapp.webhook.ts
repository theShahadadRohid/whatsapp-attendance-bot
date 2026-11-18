
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";

import { AppError } from "../../../common/errors/app-error.js";
import { logger } from "../../../common/logging/logger.js";
import { env } from "../../../config/env.js";
import {
  checkInEmployee,
  checkOutEmployee,
} from "../../attendance/attendance.service.js";
import { findEmployeeByWhatsAppIdentity } from "../../employees/employee.service.js";
import { trackUnknownContact } from "../../unknown-contacts/unknown-contact.service.js";
import { sendWhatsAppTextMessage } from "./whatsapp.client.js";
import {
  markWhatsAppMessageFailed,
  markWhatsAppMessageProcessed,
  claimWhatsAppMessage,
} from "./whatsapp-message.service.js";
import { parseWhatsAppCommand } from "./whatsapp.command.js";
import { parseWhatsAppMessages } from "./whatsapp.payload.js";

export const whatsappWebhookRouter = Router();

const HELP_MESSAGE = [
  "Welcome to the attendance system.",
  "",
  "Available commands:",
  "IN - Check in",
  "IN reason: Traffic jam - Check in with a reason",
  "OUT - Check out",
  "OUT note: Personal work - Check out with a note",
  "HELP - Show these instructions",
].join("\n");

const INVALID_COMMAND_MESSAGE =
  "Invalid command. Send HELP to see the available attendance commands.";

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

function formatAttendanceTime(
  date: Date,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

async function sendReply(
  message: {
    messageId: string;
    from?: string;
    fromUserId?: string;
  },
  body: string,
): Promise<void> {
  const phoneNumber = message.from?.trim();
  const bsuid = message.fromUserId?.trim();

  if (!phoneNumber && !bsuid) {
    logger.warn(
      { messageId: message.messageId },
      "Cannot reply because the sender has no usable recipient identifier.",
    );
    return;
  }

  try {
if (phoneNumber) {
  await sendWhatsAppTextMessage({
    to: phoneNumber,
    body,
  });
} else if (bsuid) {
  await sendWhatsAppTextMessage({
    recipient: bsuid,
    body,
  });
}
  } catch (error) {
    // The attendance operation is already marked processed.
    // A failed reply must not cause the attendance action to run again.
    logger.error(
      {
        err: error,
        messageId: message.messageId,
      },
      "Failed to send WhatsApp reply.",
    );
  }
}

async function handleRegisteredEmployeeMessage(
  message: Awaited<
    ReturnType<typeof parseWhatsAppMessages>
  >[number],
  employee: {
    _id: { toString(): string };
    employeeCode: string;
    isActive: boolean;
  },
): Promise<void> {
  const employeeId = employee._id.toString();

  const claim = await claimWhatsAppMessage({
    messageId: message.messageId,
    employeeId,
  });

  if (claim.status !== "claimed") {
    logger.info(
      {
        messageId: message.messageId,
        status: claim.status,
        employeeCode: employee.employeeCode,
      },
      "Duplicate or currently processing WhatsApp message ignored.",
    );

    return;
  }

  let replyMessage: string;

  try {
    if (!employee.isActive) {
      replyMessage =
        "Your employee account is currently inactive. Please contact your manager.";
    } else if (message.type !== "text" || !message.text) {
      replyMessage =
        "I can only process text attendance commands. Send HELP for instructions.";
    } else {
      const command = parseWhatsAppCommand(message.text);

      switch (command.type) {
        case "help": {
          replyMessage = HELP_MESSAGE;
          break;
        }

        case "invalid": {
          replyMessage = INVALID_COMMAND_MESSAGE;
          break;
        }

        case "check_in": {
          const attendance = await checkInEmployee(
            employeeId,
            command.reason
              ? { reason: command.reason }
              : {},
          );

          const timeZone = attendance.timeZone;
          if (!attendance.checkInAt) {
  throw new Error(
    "Check-in was created without a check-in timestamp.",
  );
}

const checkInTime = formatAttendanceTime(
  attendance.checkInAt,
  timeZone,
);

          replyMessage =
            `Check-in recorded successfully at ${checkInTime}.` +
            (attendance.status === "late"
              ? " Your attendance has been marked late."
              : " You are marked present.");

          break;
        }

        case "check_out": {
          const attendance = await checkOutEmployee(
            employeeId,
            command.note
              ? { note: command.note }
              : {},
          );

          const timeZone = attendance.timeZone;
          const checkOutTime = formatAttendanceTime(
            attendance.checkOutAt!,
            timeZone,
          );

          replyMessage =
            `Check-out recorded successfully at ${checkOutTime}.` +
            (attendance.checkOutStatus === "early"
              ? " Your checkout has been marked early."
              : "");

          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      // Expected attendance validation errors are final results.
      // Do not retry the same command.
      replyMessage = error.message;
    } else {
      // Unexpected failures can be retried after the lease expires.
      await markWhatsAppMessageFailed(
        message.messageId,
        claim.leaseToken,
        error,
      );

      throw error;
    }
  }

  const markedProcessed = await markWhatsAppMessageProcessed(
    message.messageId,
    claim.leaseToken,
  );

  if (!markedProcessed) {
    logger.warn(
      { messageId: message.messageId },
      "WhatsApp message processing lease was lost before completion.",
    );

    return;
  }

  await sendReply(message, replyMessage);

  logger.info(
    {
      employeeId,
      employeeCode: employee.employeeCode,
      messageId: message.messageId,
    },
    "WhatsApp employee message processed.",
  );
}

/**
 * Meta calls this endpoint when registering the webhook.
 */
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!env.WHATSAPP_VERIFY_TOKEN) {
    res.status(503).send(
      "WhatsApp webhook verification is not configured.",
    );
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
 * Receives and processes WhatsApp webhook notifications.
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

        const result = await findEmployeeByWhatsAppIdentity({
          ...(message.from
            ? { phoneNumber: message.from }
            : {}),
          ...(message.fromUserId
            ? { bsuid: message.fromUserId }
            : {}),
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

        if (
          result.status === "active" ||
          result.status === "inactive"
        ) {
          await handleRegisteredEmployeeMessage(
            message,
            result.employee,
          );

          continue;
        }

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
        "Failed to process WhatsApp webhook messages.",
      );

      res.sendStatus(500);
      return;
    }

    res.sendStatus(200);
  },
);
