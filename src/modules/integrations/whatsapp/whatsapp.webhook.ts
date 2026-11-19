
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
import {
  acceptWhatsAppEnrollmentConsent,
  findVerifiedWhatsAppEnrollmentForSender,
  revokeWhatsAppEnrollment,
  verifyWhatsAppEnrollmentToken,
} from "../../whatsapp-enrollment/whatsapp-enrollment.service.js";
import { WhatsAppEnrollmentModel } from "../../whatsapp-enrollment/whatsapp-enrollment.model.js";
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
  "WhatsApp enrollment:",
  "ENROLL <token> - Verify your employee account",
  "YES - Accept WhatsApp attendance messaging after verification",
  "STOP - Withdraw consent and stop attendance messaging",
  "",
  "Attendance commands (after enrollment):",
  "IN - Check in",
  "IN reason: Traffic jam - Check in with a reason",
  "OUT - Check out",
  "OUT note: Personal work - Check out with a note",
  "HELP - Show these instructions",
].join("\n");

const ENROLLMENT_REQUIRED_MESSAGE = [
  "Your WhatsApp account is not enrolled for attendance.",
  "",
  "Please contact your manager for an enrollment token.",
  "Then send: ENROLL <token>",
].join("\n");

const UNKNOWN_CONTACT_MESSAGE = [
  "Welcome to our WhatsApp attendance service.",
  "",
  "We could not identify this WhatsApp account as an enrolled employee.",
  "",
  "If you are an employee:",
  "1. Contact your manager to receive an enrollment token.",
  "2. Send ENROLL <token> using your registered phone number.",
  "3. After verification, reply YES to give consent.",
  "",
  "If you need assistance, please contact your manager.",
].join("\n");

const INVALID_COMMAND_MESSAGE = [
  "Sorry, I couldn't understand that command.",
  "",
  "Send HELP to see the available commands.",
].join("\n");

const INACTIVE_EMPLOYEE_MESSAGE =
  "Your employee account is currently inactive. Please contact your manager.";

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
    // The operation is already marked processed. A failed reply must
    // not cause attendance or enrollment processing to run again.
    logger.error(
      {
        err: error,
        messageId: message.messageId,
      },
      "Failed to send WhatsApp reply.",
    );
  }
}

async function claimMessage(
  messageId: string,
  employeeId: string,
) {
  const claim = await claimWhatsAppMessage({
    messageId,
    employeeId,
  });

  if (claim.status !== "claimed") {
    logger.info(
      {
        messageId,
        status: claim.status,
      },
      "Duplicate or currently processing WhatsApp message ignored.",
    );

    return null;
  }

  return claim;
}

async function finishMessage(
  message: {
    messageId: string;
    from?: string;
    fromUserId?: string;
  },
  leaseToken: string,
  replyMessage: string,
): Promise<void> {
  const markedProcessed = await markWhatsAppMessageProcessed(
    message.messageId,
    leaseToken,
  );

  if (!markedProcessed) {
    logger.warn(
      { messageId: message.messageId },
      "WhatsApp message processing lease was lost before completion.",
    );

    return;
  }

  await sendReply(message, replyMessage);
}

/**
 * Processes an enrollment token before unknown-contact tracking.
 *
 * The enrollment service verifies that the sender's phone number
 * matches the employee's registered phone number.
 */
async function handleEnrollmentTokenMessage(
  message: Awaited<
    ReturnType<typeof parseWhatsAppMessages>
  >[number],
  token: string,
): Promise<boolean> {
  if (!message.from) {
    await sendReply(
      message,
      "Your WhatsApp phone number could not be verified. Please send the enrollment token from your registered phone number.",
    );

    return true;
  }

  try {
    const result = await verifyWhatsAppEnrollmentToken({
      token,
      senderPhoneNumber: message.from,
      ...(message.fromUserId
        ? { senderBsuid: message.fromUserId }
        : {}),
    });

    const employeeId = result.employee._id.toString();

    const claim = await claimMessage(
      message.messageId,
      employeeId,
    );

    if (!claim) {
      return true;
    }

    await finishMessage(
      message,
      claim.leaseToken,
      [
        `Your employee account has been verified, ${result.employee.fullName}.`,
        "",
        "To explicitly consent to WhatsApp attendance messaging, reply:",
        "YES",
        "",
        "Reply STOP if you do not want to enroll.",
      ].join("\n"),
    );

    logger.info(
      {
        employeeId,
        employeeCode: result.employee.employeeCode,
        messageId: message.messageId,
        hasBsuid: Boolean(message.fromUserId),
      },
      "WhatsApp enrollment token verified.",
    );

    return true;
  } catch (error) {
    if (error instanceof AppError) {
      await sendReply(message, error.message);
      return true;
    }

    throw error;
  }
}

/**
 * Processes explicit employee consent.
 *
 * The enrollment must already be verified, and the sender must
 * match the identity recorded during verification.
 */
async function handleConsentMessage(
  message: Awaited<
    ReturnType<typeof parseWhatsAppMessages>
  >[number],
  employee: {
    _id: { toString(): string };
    employeeCode: string;
    fullName: string;
    isActive: boolean;
  },
  enrollmentId?: string,
): Promise<void> {
  const employeeId = employee._id.toString();

  const claim = await claimMessage(
    message.messageId,
    employeeId,
  );

  if (!claim) {
    return;
  }

  try {
    if (!employee.isActive) {
      await finishMessage(
        message,
        claim.leaseToken,
        INACTIVE_EMPLOYEE_MESSAGE,
      );
      return;
    }

    if (!enrollmentId) {
      await finishMessage(
        message,
        claim.leaseToken,
        "No verified enrollment is waiting for consent. Send your enrollment token first, or contact your manager.",
      );
      return;
    }

    if (!message.from) {
      await finishMessage(
        message,
        claim.leaseToken,
        "Your WhatsApp phone number could not be verified. Please send YES from your registered phone number.",
      );
      return;
    }

    await acceptWhatsAppEnrollmentConsent({
      enrollmentId,
      senderPhoneNumber: message.from,
      ...(message.fromUserId
        ? { senderBsuid: message.fromUserId }
        : {}),
    });

    await finishMessage(
      message,
      claim.leaseToken,
      [
        `Congratulations, ${employee.fullName}!`,
        "",
        "Your WhatsApp attendance enrollment is complete.",
        "",
        "You can now use these commands:",
        "",
        "IN - Check in",
        "IN reason: Traffic jam - Check in with a reason",
        "OUT - Check out",
        "OUT note: Personal work - Check out with a note",
        "HELP - Show instructions",
        "",
        "Send STOP anytime to withdraw your consent.",
      ].join("\n"),
    );

    logger.info(
      {
        employeeId,
        employeeCode: employee.employeeCode,
        messageId: message.messageId,
        hasBsuid: Boolean(message.fromUserId),
      },
      "Employee accepted WhatsApp attendance consent.",
    );
  } catch (error) {
    if (error instanceof AppError) {
      await finishMessage(
        message,
        claim.leaseToken,
        error.message,
      );
      return;
    }

    await markWhatsAppMessageFailed(
      message.messageId,
      claim.leaseToken,
      error,
    );

    throw error;
  }
}

/**
 * Handles a STOP command from an identified employee.
 */
async function handleStopMessage(
  message: Awaited<
    ReturnType<typeof parseWhatsAppMessages>
  >[number],
  employee: {
    _id: { toString(): string };
    employeeCode: string;
  },
): Promise<void> {
  const employeeId = employee._id.toString();

  const claim = await claimMessage(
    message.messageId,
    employeeId,
  );

  if (!claim) {
    return;
  }

  try {
    let replyMessage: string;

    try {
      await revokeWhatsAppEnrollment(employeeId);

      replyMessage = [
        "Your WhatsApp attendance consent has been withdrawn.",
        "",
        "You will no longer be able to use WhatsApp attendance commands.",
        "Contact your manager if you want to enroll again.",
      ].join("\n");
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        replyMessage =
          "You do not currently have an active WhatsApp enrollment.";
      } else {
        throw error;
      }
    }

    await finishMessage(
      message,
      claim.leaseToken,
      replyMessage,
    );

    logger.info(
      {
        employeeId,
        employeeCode: employee.employeeCode,
        messageId: message.messageId,
      },
      "WhatsApp STOP command processed.",
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

  const claim = await claimMessage(
    message.messageId,
    employeeId,
  );

  if (!claim) {
    return;
  }

  let replyMessage: string;

  try {
    if (!employee.isActive) {
      replyMessage = INACTIVE_EMPLOYEE_MESSAGE;
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

        case "stop": {
          try {
            await revokeWhatsAppEnrollment(employeeId);

            replyMessage = [
              "Your WhatsApp attendance consent has been withdrawn.",
              "",
              "You will no longer be able to use WhatsApp attendance commands.",
              "Contact your manager if you want to enroll again.",
            ].join("\n");
          } catch (error) {
            if (error instanceof AppError && error.statusCode === 404) {
              replyMessage =
                "You do not currently have an active WhatsApp enrollment.";
            } else {
              throw error;
            }
          }
          break;
        }

        case "consent": {
          replyMessage =
            "Your enrollment consent could not be processed. Please contact your manager.";
          break;
        }

        case "enroll": {
          replyMessage =
            "Please send ENROLL <token> as a separate message.";
          break;
        }

        case "invalid": {
          replyMessage = INVALID_COMMAND_MESSAGE;
          break;
        }

        case "check_in":
        case "check_out": {
          const enrollment = await WhatsAppEnrollmentModel.findOne({
            employeeId,
            status: "enrolled",
          });

          if (!enrollment) {
            replyMessage = ENROLLMENT_REQUIRED_MESSAGE;
            break;
          }

          if (command.type === "check_in") {
            const attendance = await checkInEmployee(
              employeeId,
              command.reason
                ? { reason: command.reason }
                : {},
            );

            if (!attendance.checkInAt) {
              throw new Error(
                "Check-in was created without a check-in timestamp.",
              );
            }

            const checkInTime = formatAttendanceTime(
              attendance.checkInAt,
              attendance.timeZone,
            );

            replyMessage =
              `Check-in recorded successfully at ${checkInTime}.` +
              (attendance.status === "late"
                ? " Your attendance has been marked late."
                : " You are marked present.");
          } else {
            const attendance = await checkOutEmployee(
              employeeId,
              command.note
                ? { note: command.note }
                : {},
            );

            if (!attendance.checkOutAt) {
              throw new Error(
                "Check-out was created without a check-out timestamp.",
              );
            }

            const checkOutTime = formatAttendanceTime(
              attendance.checkOutAt,
              attendance.timeZone,
            );

            replyMessage =
              `Check-out recorded successfully at ${checkOutTime}.` +
              (attendance.checkOutStatus === "early"
                ? " Your checkout has been marked early."
                : "");
          }

          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      // Expected attendance validation errors are final results.
      replyMessage = error.message;
    } else {
      await markWhatsAppMessageFailed(
        message.messageId,
        claim.leaseToken,
        error,
      );

      throw error;
    }
  }

  await finishMessage(
    message,
    claim.leaseToken,
    replyMessage,
  );

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

        let command:
          | ReturnType<typeof parseWhatsAppCommand>
          | undefined;

        if (message.type === "text" && message.text) {
          command = parseWhatsAppCommand(message.text);
        }

        // Enrollment token verification must happen before unknown-contact
        // tracking because an employee may not have a linked BSUID yet.
        if (command?.type === "enroll") {
          await handleEnrollmentTokenMessage(
            message,
            command.token,
          );
          continue;
        }

        // A verified sender may not have a linked BSUID yet. Resolve
        // verified consent before the normal employee identity lookup.
        if (command?.type === "consent") {
          const verifiedEnrollment =
            await findVerifiedWhatsAppEnrollmentForSender({
              ...(message.from
                ? { senderPhoneNumber: message.from }
                : {}),
              ...(message.fromUserId
                ? { senderBsuid: message.fromUserId }
                : {}),
            });

          if (verifiedEnrollment) {
            await handleConsentMessage(
              message,
              verifiedEnrollment.employee,
              verifiedEnrollment.enrollment._id.toString(),
            );
            continue;
          }
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
          if (command?.type === "consent") {
            await handleConsentMessage(
              message,
              result.employee,
            );
            continue;
          }

          if (command?.type === "stop") {
            await handleStopMessage(message, result.employee);
            continue;
          }

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

          // The contact has just messaged us, so send an onboarding
          // explanation. trackUnknownContact prevents duplicate replies
          // for repeated webhook deliveries of the same message.
          await sendReply(message, UNKNOWN_CONTACT_MESSAGE);
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
