
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";

import { AppError } from "../../../common/errors/app-error.js";
import { logger } from "../../../common/logging/logger.js";
import { env } from "../../../config/env.js";
import {
  checkInEmployee,
  checkOutEmployee,
} from "../../attendance/attendance.service.js";
import { EmployeeModel } from "../../employees/employee.model.js";
import { findEmployeeByWhatsAppNumber } from "../../employees/employee.service.js";
import { validateOfficeLocation } from "../../locations/location.service.js";
import { sendWhatsAppTextMessage } from "./whatsapp.client.js";
import {
  claimWhatsAppMessage,
  markWhatsAppMessageFailed,
  markWhatsAppMessageProcessed,
} from "./whatsapp-message.service.js";
import { parseWhatsAppCommand } from "./whatsapp.command.js";
import { parseWhatsAppMessages } from "./whatsapp.payload.js";

export const whatsappWebhookRouter = Router();

const HELP_MESSAGE = [
  "Welcome to the attendance system.",
  "",
  "Send IN to check in.",
  "Send OUT to check out.",
  "You will then be asked to share your current WhatsApp location.",
  "",
  "If you are late, you will be asked for a reason.",
  "Send HELP to see these instructions.",
].join("\n");

const UNKNOWN_EMPLOYEE_MESSAGE =
  "This WhatsApp number is not registered. Please contact your admin.";

const INACTIVE_EMPLOYEE_MESSAGE =
  "Your employee account is inactive. Please contact your admin.";

const LOCATION_REQUIRED_MESSAGE =
  "Please share your current WhatsApp location to continue.";

const INVALID_COMMAND_MESSAGE =
  "I couldn't understand that message. Send IN, OUT, or HELP.";

type IncomingMessage = ReturnType<typeof parseWhatsAppMessages>[number];

type AttendanceAction = "check_in" | "check_out";

interface EmployeeData {
  _id: { toString(): string };
  fullName: string;
  employeeCode: string;
  isActive: boolean;
  pendingAttendanceAction?: AttendanceAction;
  pendingAttendanceLocation?: {
    latitude: number;
    longitude: number;
  };
}

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

function formatAttendanceTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

async function sendReply(
  message: IncomingMessage,
  body: string,
): Promise<void> {
  try {
    if (message.from) {
      await sendWhatsAppTextMessage({
        to: message.from,
        body,
      });
    } else if (message.fromUserId) {
      await sendWhatsAppTextMessage({
        recipient: message.fromUserId,
        body,
      });
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        messageId: message.messageId,
      },
      "Failed to send WhatsApp reply.",
    );
  }
}

async function claimMessage(messageId: string, employeeId: string) {
  const claim = await claimWhatsAppMessage({
    messageId,
    employeeId,
  });

  if (claim.status !== "claimed") {
    return null;
  }

  return claim;
}

async function finishMessage(
  message: IncomingMessage,
  leaseToken: string,
  reply: string,
): Promise<void> {
  const processed = await markWhatsAppMessageProcessed(
    message.messageId,
    leaseToken,
  );

  if (!processed) {
    logger.warn(
      { messageId: message.messageId },
      "WhatsApp message processing lease was lost.",
    );
    return;
  }

  await sendReply(message, reply);
}

async function clearPendingAttendance(employeeId: string) {
  await EmployeeModel.updateOne(
    { _id: employeeId },
    {
      $unset: {
        pendingAttendanceAction: 1,
        pendingAttendanceAt: 1,
        pendingAttendanceLocation: 1,
      },
    },
  );
}

async function setPendingAttendance(
  employeeId: string,
  action: AttendanceAction,
) {
  await EmployeeModel.updateOne(
    { _id: employeeId },
    {
      $set: {
        pendingAttendanceAction: action,
        pendingAttendanceAt: new Date(),
      },
      $unset: {
        pendingAttendanceLocation: 1,
      },
    },
  );
}

async function savePendingLocation(
  employeeId: string,
  location: {
    latitude: number;
    longitude: number;
  },
) {
  await EmployeeModel.updateOne(
    { _id: employeeId },
    {
      $set: {
        pendingAttendanceLocation: location,
      },
    },
  );
}

async function completeAttendance(
  employeeId: string,
  action: AttendanceAction,
  location: {
    latitude: number;
    longitude: number;
  },
  reason?: string,
): Promise<string> {
  if (action === "check_in") {
    const attendance = await checkInEmployee(
      employeeId,
      {
        location,
        ...(reason ? { reason } : {}),
      },
    );

    if (!attendance.checkInAt) {
      throw new Error("Check-in was created without a timestamp.");
    }

    await clearPendingAttendance(employeeId);

    const time = formatAttendanceTime(
      attendance.checkInAt,
      attendance.timeZone,
    );

    return `Check-in recorded successfully at ${time}. ${
      attendance.status === "late"
        ? "Your attendance has been marked late."
        : "You are marked present."
    }`;
  }

  const attendance = await checkOutEmployee(
    employeeId,
    {
      location,
      ...(reason ? { note: reason } : {}),
    },
  );

  if (!attendance.checkOutAt) {
    throw new Error("Check-out was completed without a timestamp.");
  }

  await clearPendingAttendance(employeeId);

  const time = formatAttendanceTime(
    attendance.checkOutAt,
    attendance.timeZone,
  );

  return `Check-out recorded successfully at ${time}.`;
}

function isReasonRequiredError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === "LATE_REASON_REQUIRED" ||
      error.code === "CHECKOUT_NOTE_REQUIRED")
  );
}

async function handleEmployeeMessage(
  message: IncomingMessage,
  employee: EmployeeData,
): Promise<void> {
  const employeeId = employee._id.toString();

  const claim = await claimMessage(message.messageId, employeeId);

  if (!claim) {
    return;
  }

  try {
    let reply: string;

    if (!employee.isActive) {
      reply = INACTIVE_EMPLOYEE_MESSAGE;
    } else if (message.type === "location" && message.location) {
      const action = employee.pendingAttendanceAction;

      if (!action) {
        reply = "First send IN or OUT, then share your location.";
      } else {
        try {
          validateOfficeLocation({
            latitude: message.location.latitude,
            longitude: message.location.longitude,
          });

          reply = await completeAttendance(
            employeeId,
            action,
            {
              latitude: message.location.latitude,
              longitude: message.location.longitude,
            },
          );
        } catch (error) {
          if (isReasonRequiredError(error)) {
            await savePendingLocation(employeeId, {
              latitude: message.location.latitude,
              longitude: message.location.longitude,
            });

            reply =
              action === "check_in"
                ? "Your location is verified. Please send your reason for being late."
                : "Your location is verified. Please send a note for your late checkout.";
          } else if (error instanceof AppError) {
            reply = error.message;
          } else {
            throw error;
          }
        }
      }
    } else if (message.type === "text" && message.text) {
      const text = message.text.trim();
      const command = parseWhatsAppCommand(text);

      if (command.type === "help") {
        reply = HELP_MESSAGE;
      } else if (
        command.type === "check_in" ||
        command.type === "check_out"
      ) {
        const action: AttendanceAction =
          command.type === "check_in" ? "check_in" : "check_out";

        await setPendingAttendance(employeeId, action);

        reply =
          action === "check_in"
            ? "Check-in started. Please share your current WhatsApp location."
            : "Check-out started. Please share your current WhatsApp location.";
      } else if (
        employee.pendingAttendanceAction &&
        employee.pendingAttendanceLocation
      ) {
        if (text.length > 500) {
          reply = "Your reason or note must be 500 characters or fewer.";
        } else {
          try {
            reply = await completeAttendance(
              employeeId,
              employee.pendingAttendanceAction,
              employee.pendingAttendanceLocation,
              text,
            );
          } catch (error) {
            if (error instanceof AppError) {
              if (isReasonRequiredError(error)) {
                reply = error.message;
              } else {
                await clearPendingAttendance(employeeId);
                reply = error.message;
              }
            } else {
              throw error;
            }
          }
        }
      } else if (employee.pendingAttendanceAction) {
        reply = LOCATION_REQUIRED_MESSAGE;
      } else {
        reply = INVALID_COMMAND_MESSAGE;
      }
    } else {
      reply = employee.pendingAttendanceAction
        ? LOCATION_REQUIRED_MESSAGE
        : INVALID_COMMAND_MESSAGE;
    }

    await finishMessage(message, claim.leaseToken, reply);

    logger.info(
      {
        employeeId,
        employeeCode: employee.employeeCode,
        messageId: message.messageId,
      },
      "WhatsApp attendance message processed.",
    );
  } catch (error) {
    await markWhatsAppMessageFailed(
      message.messageId,
      claim.leaseToken,
      error,
    );

    throw error;
  }
}

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

    if (!isValidSignature(
      req.body,
      req.get("X-Hub-Signature-256"),
    )) {
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

    try {
      for (const message of messages) {
        if (!message.from) {
          await sendReply(
            message,
            "Your WhatsApp phone number could not be identified.",
          );
          continue;
        }

        const result = await findEmployeeByWhatsAppNumber(
          message.from,
        );

        if (result.status === "not_found") {
          await sendReply(message, UNKNOWN_EMPLOYEE_MESSAGE);
          continue;
        }

        if (result.status === "inactive") {
          await sendReply(message, INACTIVE_EMPLOYEE_MESSAGE);
          continue;
        }

        await handleEmployeeMessage(
          message,
          result.employee as EmployeeData,
        );
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
