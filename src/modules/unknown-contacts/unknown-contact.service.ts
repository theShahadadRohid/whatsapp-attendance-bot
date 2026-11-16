
import { UnknownContactModel } from "./unknown-contact.model.js";

const MAX_ATTEMPTS = 3;
const RESTRICTION_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGE_IDS = 100;

export type UnknownContactResult =
  | { status: "tracked"; attemptCount: number }
  | { status: "restricted"; restrictedUntil: Date }
  | { status: "duplicate" };

export async function trackUnknownContact(
  phoneNumber: string,
  messageId: string,
  now = new Date(),
): Promise<UnknownContactResult> {
  const contact = await UnknownContactModel.findOne({
    phoneNumber,
  });

  if (!contact) {
    try {
      await UnknownContactModel.create({
        phoneNumber,
        attemptCount: 1,
        lastMessageAt: now,
        processedMessageIds: [messageId],
      });

      return {
        status: "tracked",
        attemptCount: 1,
      };
    } catch (error) {
      // Another webhook may have created this contact concurrently.
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === 11000
      ) {
        return trackUnknownContact(phoneNumber, messageId, now);
      }

      throw error;
    }
  }

  if (contact.processedMessageIds.includes(messageId)) {
    return { status: "duplicate" };
  }

  if (
    contact.restrictedUntil &&
    contact.restrictedUntil.getTime() > now.getTime()
  ) {
    return {
      status: "restricted",
      restrictedUntil: contact.restrictedUntil,
    };
  }

  // Restriction expired: start a new attempt cycle.
  if (
    contact.restrictedUntil &&
    contact.restrictedUntil.getTime() <= now.getTime()
  ) {
    contact.attemptCount = 0;
    contact.restrictedUntil = undefined;
    contact.processedMessageIds = [];
  }

  contact.processedMessageIds.push(messageId);

  contact.processedMessageIds = contact.processedMessageIds.slice(
    -MAX_STORED_MESSAGE_IDS,
  );

  contact.lastMessageAt = now;
  contact.attemptCount += 1;

  if (contact.attemptCount >= MAX_ATTEMPTS) {
    const restrictedUntil = new Date(
      now.getTime() + RESTRICTION_DURATION_MS,
    );

    contact.restrictedUntil = restrictedUntil;

    await contact.save();

    return {
      status: "restricted",
      restrictedUntil,
    };
  }

  await contact.save();

  return {
    status: "tracked",
    attemptCount: contact.attemptCount,
  };
}
