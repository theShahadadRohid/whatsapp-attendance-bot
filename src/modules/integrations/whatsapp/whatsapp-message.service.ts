
import { randomUUID } from "node:crypto";

import { WhatsAppMessageModel } from "./whatsapp-message.model.js";

const PROCESSING_LEASE_DURATION_MS = 60 * 1000;
const MAX_ERROR_LENGTH = 1000;

export type ClaimWhatsAppMessageResult =
  | {
      status: "claimed";
      leaseToken: string;
      attemptCount: number;
    }
  | {
      status: "duplicate";
    }
  | {
      status: "in_progress";
    };

export interface ClaimWhatsAppMessageInput {
  messageId: string;
  employeeId: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function getErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return message.slice(0, MAX_ERROR_LENGTH);
}

export async function claimWhatsAppMessage(
  input: ClaimWhatsAppMessageInput,
  now = new Date(),
): Promise<ClaimWhatsAppMessageResult> {
  const messageId = input.messageId.trim();
  const employeeId = input.employeeId.trim();

  if (!messageId || !employeeId) {
    throw new Error(
      "WhatsApp message ID and employee ID are required.",
    );
  }

  const leaseToken = randomUUID();

  const leaseUntil = new Date(
    now.getTime() + PROCESSING_LEASE_DURATION_MS,
  );

  // First delivery: create the processing record.
  try {
    await WhatsAppMessageModel.create({
      messageId,
      employeeId,
      status: "processing",
      attemptCount: 1,
      leaseToken,
      leaseUntil,
    });

    return {
      status: "claimed",
      leaseToken,
      attemptCount: 1,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  // Existing delivery: reclaim only failed or expired messages.
  // The atomic update ensures only one concurrent request wins.
  const reclaimedMessage =
    await WhatsAppMessageModel.findOneAndUpdate(
      {
        messageId,
        $or: [
          { status: "failed" },
          {
            status: "processing",
            leaseUntil: { $lte: now },
          },
        ],
      },
      {
        $set: {
          employeeId,
          status: "processing",
          leaseToken,
          leaseUntil,
        },
        $inc: {
          attemptCount: 1,
        },
        $unset: {
          lastError: 1,
          processedAt: 1,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

  if (reclaimedMessage) {
    return {
      status: "claimed",
      leaseToken,
      attemptCount: reclaimedMessage.attemptCount,
    };
  }

  // Another request either owns the active lease or finished processing.
  const existingMessage = await WhatsAppMessageModel.findOne({
    messageId,
  }).select("status");

  if (!existingMessage) {
    throw new Error(
      `WhatsApp message ${messageId} disappeared during processing.`,
    );
  }

  if (existingMessage.status === "processed") {
    return { status: "duplicate" };
  }

  return { status: "in_progress" };
}

export async function markWhatsAppMessageProcessed(
  messageId: string,
  leaseToken: string,
  now = new Date(),
): Promise<boolean> {
  const result = await WhatsAppMessageModel.updateOne(
    {
      messageId,
      status: "processing",
      leaseToken,
    },
    {
      $set: {
        status: "processed",
        processedAt: now,
      },
      $unset: {
        leaseToken: 1,
        leaseUntil: 1,
        lastError: 1,
      },
    },
  );

  return result.modifiedCount === 1;
}

export async function markWhatsAppMessageFailed(
  messageId: string,
  leaseToken: string,
  error: unknown,
): Promise<boolean> {
  const result = await WhatsAppMessageModel.updateOne(
    {
      messageId,
      status: "processing",
      leaseToken,
    },
    {
      $set: {
        status: "failed",
        lastError: getErrorMessage(error),
      },
      $unset: {
        leaseToken: 1,
        leaseUntil: 1,
      },
    },
  );

  return result.modifiedCount === 1;
}
