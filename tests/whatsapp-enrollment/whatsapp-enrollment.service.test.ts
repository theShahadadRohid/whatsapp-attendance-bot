import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { EmployeeModel } from "../../src/modules/employees/employee.model.js";
import {
  WhatsAppEnrollmentModel,
} from "../../src/modules/whatsapp-enrollment/whatsapp-enrollment.model.js";
import {
  acceptWhatsAppEnrollmentConsent,
  createWhatsAppEnrollment,
  revokeWhatsAppEnrollment,
  verifyWhatsAppEnrollmentToken,
} from "../../src/modules/whatsapp-enrollment/whatsapp-enrollment.service.js";

const PHONE_NUMBER = "8801712345678";
const WRONG_PHONE_NUMBER = "8801812345678";
const BSUID = "test-business-scoped-user-id-001";
const DIFFERENT_BSUID = "different-business-scoped-user-id-002";

const BASE_TIME = new Date("2026-11-19T10:00:00.000Z");

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createEmployee(
  options: {
    phoneNumber?: string;
    whatsappBusinessScopedUserId?: string;
    isActive?: boolean;
  } = {},
) {
  return EmployeeModel.create({
    employeeCode: "EMP001",
    fullName: "Test Employee",
    phoneNumber: options.phoneNumber ?? PHONE_NUMBER,
    employmentType: "office",
    isActive: options.isActive ?? true,
    ...(options.whatsappBusinessScopedUserId
      ? {
          whatsappBusinessScopedUserId:
            options.whatsappBusinessScopedUserId,
        }
      : {}),
  });
}

async function createEnrollment(
  employeeId: Types.ObjectId,
  options: {
    status?: "pending" | "verified" | "enrolled" | "revoked" | "expired";
    verifiedBsuid?: string;
    verifiedPhoneNumber?: string;
    attemptCount?: number;
    expiresAt?: Date;
  } = {},
) {
  return WhatsAppEnrollmentModel.create({
    employeeId,
    tokenHash: `test-token-hash-${new Types.ObjectId().toString()}`,
    status: options.status ?? "enrolled",
    expiresAt:
      options.expiresAt ??
      new Date(BASE_TIME.getTime() + 15 * 60 * 1000),
    attemptCount: options.attemptCount ?? 0,
    ...(options.verifiedBsuid
      ? { verifiedBsuid: options.verifiedBsuid }
      : {}),
    ...(options.verifiedPhoneNumber
      ? { verifiedPhoneNumber: options.verifiedPhoneNumber }
      : {}),
  });
}

describe("WhatsApp enrollment creation", () => {
  it("creates a pending enrollment and returns a token", async () => {
    const employee = await createEmployee();

    const result = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    expect(result.token).toBeTruthy();
    expect(result.enrollment.status).toBe("pending");
    expect(result.enrollment.employeeId.toString()).toBe(
      employee._id.toString(),
    );
    expect(result.enrollment.attemptCount).toBe(0);

    expect(result.expiresAt).toEqual(
      new Date(BASE_TIME.getTime() + 15 * 60 * 1000),
    );
  });

  it("stores only the hashed token, not the raw token", async () => {
    const employee = await createEmployee();

    const result = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const storedEnrollment = await WhatsAppEnrollmentModel.findById(
      result.enrollment._id,
    );

    expect(storedEnrollment?.tokenHash).toBe(
      hashToken(result.token),
    );
    expect(storedEnrollment?.tokenHash).not.toBe(result.token);
  });

  it("reissues an existing pending enrollment with a new token", async () => {
    const employee = await createEmployee();

    const first = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const second = await createWhatsAppEnrollment(
      employee._id.toString(),
      new Date(BASE_TIME.getTime() + 60_000),
    );

    expect(second.token).not.toBe(first.token);
    expect(second.enrollment._id.toString()).toBe(
      first.enrollment._id.toString(),
    );
    expect(second.enrollment.status).toBe("pending");
    expect(second.enrollment.attemptCount).toBe(0);
    expect(second.enrollment.tokenHash).toBe(
      hashToken(second.token),
    );

    await expect(
      verifyWhatsAppEnrollmentToken(
        {
          token: first.token,
          senderPhoneNumber: PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow("Invalid or already used enrollment token.");
  });

  it("rejects an invalid employee ID", async () => {
    await expect(
      createWhatsAppEnrollment("invalid-id", BASE_TIME),
    ).rejects.toThrow("Invalid employee ID.");
  });

  it("rejects an inactive employee", async () => {
    const employee = await createEmployee({ isActive: false });

    await expect(
      createWhatsAppEnrollment(
        employee._id.toString(),
        BASE_TIME,
      ),
    ).rejects.toThrow("Active employee not found.");
  });
});

describe("WhatsApp enrollment token verification", () => {
  it("verifies a token when the sender phone matches the employee", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const result = await verifyWhatsAppEnrollmentToken(
      {
        token: invitation.token,
        senderPhoneNumber: PHONE_NUMBER,
      },
      new Date(BASE_TIME.getTime() + 1000),
    );

    expect(result.enrollment.status).toBe("verified");
    expect(result.enrollment.verifiedPhoneNumber).toBe(
      PHONE_NUMBER,
    );
    expect(result.enrollment.verifiedAt).toEqual(
      new Date(BASE_TIME.getTime() + 1000),
    );
    expect(result.employee._id.toString()).toBe(
      employee._id.toString(),
    );
  });

  it("accepts phone numbers with formatting differences", async () => {
    const employee = await createEmployee({
      phoneNumber: "+880 1712-345678",
    });

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const result = await verifyWhatsAppEnrollmentToken(
      {
        token: invitation.token,
        senderPhoneNumber: "8801712345678",
      },
      BASE_TIME,
    );

    expect(result.enrollment.status).toBe("verified");
  });

  it("stores the sender BSUID during verification when provided", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const result = await verifyWhatsAppEnrollmentToken(
      {
        token: invitation.token,
        senderPhoneNumber: PHONE_NUMBER,
        senderBsuid: BSUID,
      },
      BASE_TIME,
    );

    expect(result.enrollment.verifiedBsuid).toBe(BSUID);
  });

  it("rejects a token when the sender phone does not match", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    await expect(
      verifyWhatsAppEnrollmentToken(
        {
          token: invitation.token,
          senderPhoneNumber: WRONG_PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow(
      "WhatsApp number does not match employee record.",
    );

    const enrollment = await WhatsAppEnrollmentModel.findById(
      invitation.enrollment._id,
    );

    expect(enrollment?.status).toBe("pending");
    expect(enrollment?.attemptCount).toBe(1);
  });

  it("revokes an enrollment after five failed phone verification attempts", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(
        verifyWhatsAppEnrollmentToken(
          {
            token: invitation.token,
            senderPhoneNumber: WRONG_PHONE_NUMBER,
          },
          BASE_TIME,
        ),
      ).rejects.toThrow(
        "WhatsApp number does not match employee record.",
      );
    }

    await expect(
      verifyWhatsAppEnrollmentToken(
        {
          token: invitation.token,
          senderPhoneNumber: WRONG_PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow("Maximum verification attempts exceeded.");

    const enrollment = await WhatsAppEnrollmentModel.findById(
      invitation.enrollment._id,
    );

    expect(enrollment?.status).toBe("revoked");
    expect(enrollment?.attemptCount).toBe(5);
    expect(enrollment?.revokedAt).toEqual(BASE_TIME);
  });

  it("expires a token when its expiration time has passed", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const expiredTime = new Date(
      invitation.expiresAt.getTime() + 1000,
    );

    await expect(
      verifyWhatsAppEnrollmentToken(
        {
          token: invitation.token,
          senderPhoneNumber: PHONE_NUMBER,
        },
        expiredTime,
      ),
    ).rejects.toThrow("Enrollment token has expired.");

    const enrollment = await WhatsAppEnrollmentModel.findById(
      invitation.enrollment._id,
    );

    expect(enrollment?.status).toBe("expired");
  });

  it("rejects an already used token", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    await verifyWhatsAppEnrollmentToken(
      {
        token: invitation.token,
        senderPhoneNumber: PHONE_NUMBER,
      },
      BASE_TIME,
    );

    await expect(
      verifyWhatsAppEnrollmentToken(
        {
          token: invitation.token,
          senderPhoneNumber: PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow("Invalid or already used enrollment token.");
  });

  it("rejects verification for an inactive employee", async () => {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    await EmployeeModel.updateOne(
      { _id: employee._id },
      { $set: { isActive: false } },
    );

    await expect(
      verifyWhatsAppEnrollmentToken(
        {
          token: invitation.token,
          senderPhoneNumber: PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow("Active employee not found.");

    const enrollment = await WhatsAppEnrollmentModel.findById(
      invitation.enrollment._id,
    );

    expect(enrollment?.status).toBe("revoked");
  });
});

describe("WhatsApp enrollment consent", () => {
  async function createVerifiedEnrollment(
    options: { senderBsuid?: string } = {},
  ) {
    const employee = await createEmployee();

    const invitation = await createWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const verification = await verifyWhatsAppEnrollmentToken(
      {
        token: invitation.token,
        senderPhoneNumber: PHONE_NUMBER,
        ...(options.senderBsuid
          ? { senderBsuid: options.senderBsuid }
          : {}),
      },
      BASE_TIME,
    );

    return {
      employee,
      enrollment: verification.enrollment,
    };
  }

  it("accepts consent and enrolls the employee", async () => {
    const { employee, enrollment } =
      await createVerifiedEnrollment();

    const result = await acceptWhatsAppEnrollmentConsent(
      {
        enrollmentId: enrollment._id.toString(),
        senderPhoneNumber: PHONE_NUMBER,
      },
      BASE_TIME,
    );

    expect(result.status).toBe("enrolled");
    expect(result.consentedAt).toEqual(BASE_TIME);
    expect(result.consentVersion).toBe("1.0");

    const updatedEnrollment = await WhatsAppEnrollmentModel.findById(
      enrollment._id,
    );

    expect(updatedEnrollment?.status).toBe("enrolled");

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee).not.toBeNull();
  });

  it("links the verified BSUID only after consent", async () => {
    const { employee, enrollment } =
      await createVerifiedEnrollment({
        senderBsuid: BSUID,
      });

    const beforeConsent = await EmployeeModel.findById(employee._id);

    expect(
      beforeConsent?.whatsappBusinessScopedUserId,
    ).toBeUndefined();

    const result = await acceptWhatsAppEnrollmentConsent(
      {
        enrollmentId: enrollment._id.toString(),
        senderPhoneNumber: PHONE_NUMBER,
        senderBsuid: BSUID,
      },
      BASE_TIME,
    );

    expect(result.status).toBe("enrolled");

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBe(
      BSUID,
    );
  });

  it("rejects consent from a different phone number", async () => {
    const { employee, enrollment } =
      await createVerifiedEnrollment();

    await expect(
      acceptWhatsAppEnrollmentConsent(
        {
          enrollmentId: enrollment._id.toString(),
          senderPhoneNumber: WRONG_PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow(
      "The WhatsApp number does not match the verified enrollment.",
    );

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(
      updatedEmployee?.whatsappBusinessScopedUserId,
    ).toBeUndefined();
  });

  it("rejects a different BSUID from the verified identity", async () => {
    const { employee, enrollment } =
      await createVerifiedEnrollment({
        senderBsuid: BSUID,
      });

    await expect(
      acceptWhatsAppEnrollmentConsent(
        {
          enrollmentId: enrollment._id.toString(),
          senderPhoneNumber: PHONE_NUMBER,
          senderBsuid: DIFFERENT_BSUID,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow(
      "The WhatsApp identity does not match the verified enrollment.",
    );

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(
      updatedEmployee?.whatsappBusinessScopedUserId,
    ).toBeUndefined();
  });

  it("rejects consent when the employee already has a different BSUID", async () => {
    const { employee, enrollment } =
      await createVerifiedEnrollment({
        senderBsuid: BSUID,
      });

    await EmployeeModel.updateOne(
      { _id: employee._id },
      {
        $set: {
          whatsappBusinessScopedUserId: DIFFERENT_BSUID,
        },
      },
    );

    await expect(
      acceptWhatsAppEnrollmentConsent(
        {
          enrollmentId: enrollment._id.toString(),
          senderPhoneNumber: PHONE_NUMBER,
          senderBsuid: BSUID,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow(
      "This employee already has a different WhatsApp identity linked.",
    );

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBe(
      DIFFERENT_BSUID,
    );
  });

  it("rejects a BSUID already linked to another employee", async () => {
    await createEmployee({
      whatsappBusinessScopedUserId: BSUID,
    });

    const secondEmployee = await EmployeeModel.create({
      employeeCode: "EMP002",
      fullName: "Second Employee",
      phoneNumber: "8801912345678",
      employmentType: "office",
      isActive: true,
    });

    const invitation = await createWhatsAppEnrollment(
      secondEmployee._id.toString(),
      BASE_TIME,
    );

    const verification = await verifyWhatsAppEnrollmentToken(
      {
        token: invitation.token,
        senderPhoneNumber: "8801912345678",
        senderBsuid: BSUID,
      },
      BASE_TIME,
    );

    await expect(
      acceptWhatsAppEnrollmentConsent(
        {
          enrollmentId: verification.enrollment._id.toString(),
          senderPhoneNumber: "8801912345678",
          senderBsuid: BSUID,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow(
      "This WhatsApp identity is already linked to another employee.",
    );

    const updatedSecondEmployee = await EmployeeModel.findById(
      secondEmployee._id,
    );

    expect(
      updatedSecondEmployee?.whatsappBusinessScopedUserId,
    ).toBeUndefined();

    const enrollment = await WhatsAppEnrollmentModel.findById(
      verification.enrollment._id,
    );

    expect(enrollment?.status).toBe("verified");
  });

  it("does not allow consent to be accepted twice", async () => {
    const { enrollment } = await createVerifiedEnrollment();

    await acceptWhatsAppEnrollmentConsent(
      {
        enrollmentId: enrollment._id.toString(),
        senderPhoneNumber: PHONE_NUMBER,
      },
      BASE_TIME,
    );

    await expect(
      acceptWhatsAppEnrollmentConsent(
        {
          enrollmentId: enrollment._id.toString(),
          senderPhoneNumber: PHONE_NUMBER,
        },
        BASE_TIME,
      ),
    ).rejects.toThrow(
      "Enrollment must be verified before consent can be accepted.",
    );
  });
});

describe("WhatsApp enrollment revocation", () => {
  it("revokes an enrolled employee and unlinks the matching BSUID", async () => {
    const employee = await createEmployee({
      whatsappBusinessScopedUserId: BSUID,
    });

    const enrollment = await createEnrollment(employee._id, {
      status: "enrolled",
      verifiedBsuid: BSUID,
    });

    const result = await revokeWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    expect(result._id.toString()).toBe(enrollment._id.toString());
    expect(result.status).toBe("revoked");
    expect(result.revokedAt).toEqual(BASE_TIME);

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBeUndefined();
  });

  it("does not unlink a different BSUID from the employee", async () => {
    const employee = await createEmployee({
      whatsappBusinessScopedUserId: DIFFERENT_BSUID,
    });

    await createEnrollment(employee._id, {
      status: "enrolled",
      verifiedBsuid: BSUID,
    });

    const result = await revokeWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    expect(result.status).toBe("revoked");

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBe(
      DIFFERENT_BSUID,
    );
  });

  it("revokes a pending enrollment without changing the employee identity", async () => {
    const employee = await createEmployee({
      whatsappBusinessScopedUserId: DIFFERENT_BSUID,
    });

    await createEnrollment(employee._id, {
      status: "pending",
    });

    const result = await revokeWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    expect(result.status).toBe("revoked");
    expect(result.revokedAt).toEqual(BASE_TIME);

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBe(
      DIFFERENT_BSUID,
    );
  });

  it("revokes a verified enrollment and unlinks its matching recorded BSUID", async () => {
    const employee = await createEmployee({
      whatsappBusinessScopedUserId: BSUID,
    });

    await createEnrollment(employee._id, {
      status: "verified",
      verifiedBsuid: BSUID,
    });

    const result = await revokeWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    expect(result.status).toBe("revoked");

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBeUndefined();
  });

  it("retries BSUID cleanup when the enrollment was already revoked", async () => {
    const employee = await createEmployee({
      whatsappBusinessScopedUserId: BSUID,
    });

    await createEnrollment(employee._id, {
      status: "revoked",
      verifiedBsuid: BSUID,
    });

    const result = await revokeWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    expect(result.status).toBe("revoked");

    const updatedEmployee = await EmployeeModel.findById(employee._id);

    expect(updatedEmployee?.whatsappBusinessScopedUserId).toBeUndefined();
  });

  it("keeps the revoked enrollment's BSUID so cleanup can be retried", async () => {
    const employee = await createEmployee({
      whatsappBusinessScopedUserId: BSUID,
    });

    const enrollment = await createEnrollment(employee._id, {
      status: "enrolled",
      verifiedBsuid: BSUID,
    });

    await revokeWhatsAppEnrollment(
      employee._id.toString(),
      BASE_TIME,
    );

    const updatedEnrollment = await WhatsAppEnrollmentModel.findById(
      enrollment._id,
    );

    expect(updatedEnrollment?.status).toBe("revoked");
    expect(updatedEnrollment?.verifiedBsuid).toBe(BSUID);
  });

  it("rejects an invalid employee ID", async () => {
    await expect(
      revokeWhatsAppEnrollment("invalid-id", BASE_TIME),
    ).rejects.toThrow("Invalid employee ID.");
  });

  it("returns not found when the employee has no enrollment", async () => {
    const employee = await createEmployee();

    await expect(
      revokeWhatsAppEnrollment(employee._id.toString(), BASE_TIME),
    ).rejects.toThrow("Active enrollment not found.");
  });

  it("does not allow revoking an expired enrollment", async () => {
    const employee = await createEmployee();

    await createEnrollment(employee._id, {
      status: "expired",
    });

    await expect(
      revokeWhatsAppEnrollment(employee._id.toString(), BASE_TIME),
    ).rejects.toThrow("Active enrollment not found.");
  });
});
