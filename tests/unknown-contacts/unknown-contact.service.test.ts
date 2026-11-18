
import { beforeEach, describe, expect, it } from "vitest";

import { UnknownContactModel } from "../../src/modules/unknown-contacts/unknown-contact.model.js";
import { trackUnknownContact } from "../../src/modules/unknown-contacts/unknown-contact.service.js";

const PHONE_NUMBER = "8801712345678";
const BSUID = "test-business-scoped-user-id-001";

const BASE_TIME = new Date("2026-11-16T10:00:00.000Z");

describe("Unknown contact tracking", () => {
  beforeEach(async () => {
    await UnknownContactModel.deleteMany({});
  });

  it("creates a record on the first message", async () => {
    const result = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-001",
      BASE_TIME,
    );

    expect(result).toEqual({
      status: "tracked",
      attemptCount: 1,
    });

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact).not.toBeNull();
    expect(contact?.attemptCount).toBe(1);
    expect(contact?.processedMessageIds).toEqual(["wamid-001"]);
  });

  it("increments the attempt count for subsequent messages", async () => {
    await trackUnknownContact(PHONE_NUMBER, "wamid-001", BASE_TIME);

    const result = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-002",
      new Date(BASE_TIME.getTime() + 1000),
    );

    expect(result).toEqual({
      status: "tracked",
      attemptCount: 2,
    });
  });

  it("restricts the contact after the third attempt for 24 hours", async () => {
    await trackUnknownContact(PHONE_NUMBER, "wamid-001", BASE_TIME);

    await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-002",
      new Date(BASE_TIME.getTime() + 1000),
    );

    const thirdMessageTime = new Date(
      BASE_TIME.getTime() + 2000,
    );

    const result = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-003",
      thirdMessageTime,
    );

    const expectedRestrictedUntil = new Date(
      thirdMessageTime.getTime() + 24 * 60 * 60 * 1000,
    );

    expect(result).toEqual({
      status: "restricted",
      restrictedUntil: expectedRestrictedUntil,
    });

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact?.attemptCount).toBe(3);
    expect(contact?.restrictedUntil).toEqual(
      expectedRestrictedUntil,
    );
  });

  it("does not increment attempts while the contact is restricted", async () => {
    await trackUnknownContact(PHONE_NUMBER, "wamid-001", BASE_TIME);

    await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-002",
      new Date(BASE_TIME.getTime() + 1000),
    );

    const thirdMessageTime = new Date(
      BASE_TIME.getTime() + 2000,
    );

    await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-003",
      thirdMessageTime,
    );

    const fourthMessageTime = new Date(
      thirdMessageTime.getTime() + 60 * 60 * 1000,
    );

    const result = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-004",
      fourthMessageTime,
    );

    expect(result.status).toBe("restricted");

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact?.attemptCount).toBe(3);
    expect(contact?.processedMessageIds).toHaveLength(3);
  });

  it("starts a new attempt cycle after the restriction expires", async () => {
    await trackUnknownContact(PHONE_NUMBER, "wamid-001", BASE_TIME);

    await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-002",
      new Date(BASE_TIME.getTime() + 1000),
    );

    const thirdMessageTime = new Date(
      BASE_TIME.getTime() + 2000,
    );

    const thirdResult = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-003",
      thirdMessageTime,
    );

    if (thirdResult.status !== "restricted") {
      throw new Error("Expected contact to be restricted.");
    }

    const afterExpiry = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-004",
      thirdResult.restrictedUntil,
    );

    expect(afterExpiry).toEqual({
      status: "tracked",
      attemptCount: 1,
    });

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact?.attemptCount).toBe(1);
    expect(contact?.restrictedUntil).toBeNull();
    expect(contact?.processedMessageIds).toEqual(["wamid-004"]);
  });

  it("does not count the same WhatsApp message twice", async () => {
    const firstResult = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-001",
      BASE_TIME,
    );

    const duplicateResult = await trackUnknownContact(
      PHONE_NUMBER,
      "wamid-001",
      new Date(BASE_TIME.getTime() + 1000),
    );

    expect(firstResult).toEqual({
      status: "tracked",
      attemptCount: 1,
    });

    expect(duplicateResult).toEqual({
      status: "duplicate",
    });

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact?.attemptCount).toBe(1);
    expect(contact?.processedMessageIds).toEqual(["wamid-001"]);
  });

  it("never exceeds three attempts when different messages arrive concurrently", async () => {
    const messageIds = Array.from(
      { length: 10 },
      (_, index) => `wamid-concurrent-${index}`,
    );

    const results = await Promise.all(
      messageIds.map((messageId) =>
        trackUnknownContact(PHONE_NUMBER, messageId, BASE_TIME),
      ),
    );

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact).not.toBeNull();
    expect(contact?.attemptCount).toBe(3);
    expect(contact?.restrictedUntil).toEqual(
      new Date(BASE_TIME.getTime() + 24 * 60 * 60 * 1000),
    );
    expect(contact?.processedMessageIds).toHaveLength(3);

    expect(
      results.filter((result) => result.status === "tracked"),
    ).toHaveLength(2);

    expect(
      results.filter((result) => result.status === "restricted"),
    ).toHaveLength(8);
  });

  it("counts a message only once when duplicate deliveries arrive concurrently", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        trackUnknownContact(
          PHONE_NUMBER,
          "wamid-same-concurrent-message",
          BASE_TIME,
        ),
      ),
    );

    const contact = await UnknownContactModel.findOne({
      phoneNumber: PHONE_NUMBER,
    });

    expect(contact).not.toBeNull();
    expect(contact?.attemptCount).toBe(1);
    expect(contact?.processedMessageIds).toEqual([
      "wamid-same-concurrent-message",
    ]);

    expect(
      results.filter((result) => result.status === "tracked"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "duplicate"),
    ).toHaveLength(9);
  });

  // BSUID tests

  it("creates a record using BSUID only", async () => {
    const result = await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-001",
      BASE_TIME,
    );

    expect(result).toEqual({
      status: "tracked",
      attemptCount: 1,
    });

    const contact = await UnknownContactModel.findOne({
      whatsappBusinessScopedUserId: BSUID,
    });

    expect(contact).not.toBeNull();
    expect(contact?.phoneNumber).toBeUndefined();
    expect(contact?.whatsappBusinessScopedUserId).toBe(BSUID);
    expect(contact?.attemptCount).toBe(1);
    expect(contact?.processedMessageIds).toEqual([
      "wamid-bsuid-001",
    ]);
  });

  it("increments attempts for subsequent BSUID messages", async () => {
    await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-001",
      BASE_TIME,
    );

    const result = await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-002",
      new Date(BASE_TIME.getTime() + 1000),
    );

    expect(result).toEqual({
      status: "tracked",
      attemptCount: 2,
    });
  });

  it("restricts a BSUID contact after the third attempt", async () => {
    await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-001",
      BASE_TIME,
    );

    await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-002",
      new Date(BASE_TIME.getTime() + 1000),
    );

    const thirdMessageTime = new Date(
      BASE_TIME.getTime() + 2000,
    );

    const result = await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-003",
      thirdMessageTime,
    );

    const expectedRestrictedUntil = new Date(
      thirdMessageTime.getTime() + 24 * 60 * 60 * 1000,
    );

    expect(result).toEqual({
      status: "restricted",
      restrictedUntil: expectedRestrictedUntil,
    });

    const contact = await UnknownContactModel.findOne({
      whatsappBusinessScopedUserId: BSUID,
    });

    expect(contact?.attemptCount).toBe(3);
    expect(contact?.restrictedUntil).toEqual(
      expectedRestrictedUntil,
    );
  });

  it("does not count duplicate BSUID message deliveries twice", async () => {
    const firstResult = await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-duplicate",
      BASE_TIME,
    );

    const duplicateResult = await trackUnknownContact(
      { bsuid: BSUID },
      "wamid-bsuid-duplicate",
      new Date(BASE_TIME.getTime() + 1000),
    );

    expect(firstResult).toEqual({
      status: "tracked",
      attemptCount: 1,
    });

    expect(duplicateResult).toEqual({
      status: "duplicate",
    });

    const contact = await UnknownContactModel.findOne({
      whatsappBusinessScopedUserId: BSUID,
    });

    expect(contact?.attemptCount).toBe(1);
    expect(contact?.processedMessageIds).toEqual([
      "wamid-bsuid-duplicate",
    ]);
  });

  it("never exceeds three attempts when BSUID messages arrive concurrently", async () => {
    const messageIds = Array.from(
      { length: 10 },
      (_, index) => `wamid-bsuid-concurrent-${index}`,
    );

    const results = await Promise.all(
      messageIds.map((messageId) =>
        trackUnknownContact(
          { bsuid: BSUID },
          messageId,
          BASE_TIME,
        ),
      ),
    );

    const contact = await UnknownContactModel.findOne({
      whatsappBusinessScopedUserId: BSUID,
    });

    expect(contact).not.toBeNull();
    expect(contact?.attemptCount).toBe(3);
    expect(contact?.restrictedUntil).toEqual(
      new Date(BASE_TIME.getTime() + 24 * 60 * 60 * 1000),
    );
    expect(contact?.processedMessageIds).toHaveLength(3);

    expect(
      results.filter((result) => result.status === "tracked"),
    ).toHaveLength(2);

    expect(
      results.filter((result) => result.status === "restricted"),
    ).toHaveLength(8);
  });
});
