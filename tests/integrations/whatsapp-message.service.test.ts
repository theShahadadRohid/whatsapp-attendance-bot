
import { beforeEach, describe, expect, it } from "vitest";

import { WhatsAppMessageModel } from "../../src/modules/integrations/whatsapp/whatsapp-message.model.js";

import {
  claimWhatsAppMessage,
  markWhatsAppMessageFailed,
  markWhatsAppMessageProcessed,
} from "../../src/modules/integrations/whatsapp/whatsapp-message.service.js";

const MESSAGE_ID = "wamid-test-message-001";
const EMPLOYEE_ID = "673a1b2c3d4e5f6789012345";

const BASE_TIME = new Date("2026-11-18T10:00:00.000Z");

describe("WhatsApp message processing", () => {
  beforeEach(async () => {
    await WhatsAppMessageModel.deleteMany({});
  });

  it("claims a message on its first delivery", async () => {
    const result = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      BASE_TIME,
    );

    expect(result.status).toBe("claimed");

    if (result.status !== "claimed") {
      throw new Error("Expected message to be claimed.");
    }

    expect(result.attemptCount).toBe(1);
    expect(result.leaseToken).toBeTruthy();

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message).not.toBeNull();
    expect(message?.status).toBe("processing");
    expect(message?.attemptCount).toBe(1);
    expect(message?.leaseToken).toBe(result.leaseToken);
    expect(message?.leaseUntil).toEqual(
      new Date(BASE_TIME.getTime() + 60 * 1000),
    );
  });

  it("does not claim a message that is already being processed", async () => {
    await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      BASE_TIME,
    );

    const result = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      new Date(BASE_TIME.getTime() + 10 * 1000),
    );

    expect(result).toEqual({
      status: "in_progress",
    });

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message?.attemptCount).toBe(1);
  });

  it("does not process the same message twice", async () => {
    const claim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      BASE_TIME,
    );

    if (claim.status !== "claimed") {
      throw new Error("Expected message to be claimed.");
    }

    const markedProcessed = await markWhatsAppMessageProcessed(
      MESSAGE_ID,
      claim.leaseToken,
      BASE_TIME,
    );

    expect(markedProcessed).toBe(true);

    const duplicate = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      new Date(BASE_TIME.getTime() + 2000),
    );

    expect(duplicate).toEqual({
      status: "duplicate",
    });

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message?.status).toBe("processed");
    expect(message?.attemptCount).toBe(1);
  });

  it("allows a failed message to be claimed again", async () => {
    const firstClaim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      BASE_TIME,
    );

    if (firstClaim.status !== "claimed") {
      throw new Error("Expected first claim to succeed.");
    }

    const markedFailed = await markWhatsAppMessageFailed(
      MESSAGE_ID,
      firstClaim.leaseToken,
      new Error("Attendance service temporarily unavailable."),
    );

    expect(markedFailed).toBe(true);

    const retryClaim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      new Date(BASE_TIME.getTime() + 10 * 1000),
    );

    expect(retryClaim.status).toBe("claimed");

    if (retryClaim.status !== "claimed") {
      throw new Error("Expected failed message to be reclaimed.");
    }

    expect(retryClaim.attemptCount).toBe(2);
    expect(retryClaim.leaseToken).not.toBe(firstClaim.leaseToken);

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message?.status).toBe("processing");
    expect(message?.attemptCount).toBe(2);
    expect(message?.lastError).toBeUndefined();
  });

  it("reclaims a message after its processing lease expires", async () => {
    const firstClaim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      BASE_TIME,
    );

    if (firstClaim.status !== "claimed") {
      throw new Error("Expected first claim to succeed.");
    }

    const afterLeaseExpiry = new Date(
      BASE_TIME.getTime() + 61 * 1000,
    );

    const retryClaim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      afterLeaseExpiry,
    );

    expect(retryClaim.status).toBe("claimed");

    if (retryClaim.status !== "claimed") {
      throw new Error("Expected expired lease to be reclaimed.");
    }

    expect(retryClaim.attemptCount).toBe(2);
    expect(retryClaim.leaseToken).not.toBe(firstClaim.leaseToken);

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message?.status).toBe("processing");
    expect(message?.attemptCount).toBe(2);
  });

  it("allows only one request to claim a message concurrently", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimWhatsAppMessage(
          {
            messageId: MESSAGE_ID,
            employeeId: EMPLOYEE_ID,
          },
          BASE_TIME,
        ),
      ),
    );

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message).not.toBeNull();
    expect(message?.status).toBe("processing");
    expect(message?.attemptCount).toBe(1);

    expect(
      results.filter((result) => result.status === "claimed"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "in_progress"),
    ).toHaveLength(9);
  });

  it("does not allow an old worker to update a reclaimed message", async () => {
    const firstClaim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      BASE_TIME,
    );

    if (firstClaim.status !== "claimed") {
      throw new Error("Expected first claim to succeed.");
    }

    const secondClaim = await claimWhatsAppMessage(
      {
        messageId: MESSAGE_ID,
        employeeId: EMPLOYEE_ID,
      },
      new Date(BASE_TIME.getTime() + 61 * 1000),
    );

    if (secondClaim.status !== "claimed") {
      throw new Error("Expected second claim to succeed.");
    }

    const oldWorkerResult = await markWhatsAppMessageProcessed(
      MESSAGE_ID,
      firstClaim.leaseToken,
      new Date(BASE_TIME.getTime() + 62 * 1000),
    );

    expect(oldWorkerResult).toBe(false);

    const message = await WhatsAppMessageModel.findOne({
      messageId: MESSAGE_ID,
    });

    expect(message?.status).toBe("processing");
    expect(message?.leaseToken).toBe(secondClaim.leaseToken);
  });
});
