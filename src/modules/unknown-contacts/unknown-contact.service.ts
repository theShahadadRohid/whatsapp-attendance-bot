
import { UnknownContactModel } from "./unknown-contact.model.js";

const MAX_ATTEMPTS = 3;
const RESTRICTION_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGE_IDS = 100;
const MAX_UPDATE_RETRIES = 20;

export type UnknownContactResult =
  | { status: "tracked"; attemptCount: number }
  | { status: "restricted"; restrictedUntil: Date }
  | { status: "duplicate" };

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function trackUnknownContact(
  phoneNumber: string,
  messageId: string,
  now = new Date(),
): Promise<UnknownContactResult> {
  for (let retry = 0; retry < MAX_UPDATE_RETRIES; retry += 1) {
    const contact = await UnknownContactModel.findOne({
      phoneNumber,
    });

    // First message from this unknown contact.
    if (!contact) {
      try {
        await UnknownContactModel.create({
          phoneNumber,
          attemptCount: 1,
          lastMessageAt: now,
          processedMessageIds: [messageId],
          revision: 0,
        });

        return {
          status: "tracked",
          attemptCount: 1,
        };
      } catch (error) {
        // Another request may have created this contact first.
        if (isDuplicateKeyError(error)) {
          continue;
        }

        throw error;
      }
    }

    const processedMessageIds = contact.processedMessageIds ?? [];

    // Ignore duplicate webhook deliveries.
    if (processedMessageIds.includes(messageId)) {
      return { status: "duplicate" };
    }

    // Do not count messages during an active restriction.
    if (
      contact.restrictedUntil &&
      contact.restrictedUntil.getTime() > now.getTime()
    ) {
      return {
        status: "restricted",
        restrictedUntil: contact.restrictedUntil,
      };
    }

    // Start a fresh cycle if the restriction has expired.
    const restrictionExpired =
      contact.restrictedUntil !== null &&
      contact.restrictedUntil !== undefined &&
      contact.restrictedUntil.getTime() <= now.getTime();

    const currentAttemptCount = restrictionExpired
      ? 0
      : contact.attemptCount;

    const currentMessageIds = restrictionExpired
      ? []
      : processedMessageIds;

    const nextAttemptCount = currentAttemptCount + 1;

    const nextMessageIds = [
      ...currentMessageIds,
      messageId,
    ].slice(-MAX_STORED_MESSAGE_IDS);

    const restrictedUntil =
      nextAttemptCount >= MAX_ATTEMPTS
        ? new Date(now.getTime() + RESTRICTION_DURATION_MS)
        : null;

    // Compare-and-set: update only if nobody changed this record
    // since we read it.
    const revision = contact.revision ?? 0;

    const updatedContact = await UnknownContactModel.findOneAndUpdate(
      {
        _id: contact._id,
        $or: [
          { revision },
          { revision: { $exists: false } },
        ],
      },
      {
        $set: {
          attemptCount: nextAttemptCount,
          processedMessageIds: nextMessageIds,
          lastMessageAt: now,
          restrictedUntil,
        },
        $inc: {
          revision: 1,
        },
      },
      {
  returnDocument: "after",
  runValidators: true,
},
    );

    // Someone else updated the record. Read the latest state and retry.
    if (!updatedContact) {
      continue;
    }

    if (restrictedUntil) {
      return {
        status: "restricted",
        restrictedUntil,
      };
    }

    return {
      status: "tracked",
      attemptCount: nextAttemptCount,
    };
  }

  throw new Error(
    `Could not update unknown contact ${phoneNumber} after repeated concurrent changes.`,
  );
}
