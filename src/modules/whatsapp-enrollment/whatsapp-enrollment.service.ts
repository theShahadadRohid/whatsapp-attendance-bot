
import { createHash, randomBytes } from "node:crypto";

import { AppError } from "../../common/errors/app-error.js";
import { EmployeeModel } from "../employees/employee.model.js";
import { WhatsAppEnrollmentModel } from "./whatsapp-enrollment.model.js";

const ENROLLMENT_TOKEN_EXPIRY_MINUTES = 15;
const MAX_VERIFICATION_ATTEMPTS = 5;
const CONSENT_VERSION = "1.0";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "");
}

export async function createWhatsAppEnrollment(
  employeeId: string,
  now = new Date(),
) {
  const employee = await EmployeeModel.findById(employeeId);

  if (!employee || !employee.isActive) {
    throw new AppError("Active employee not found.", 404);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    now.getTime() + ENROLLMENT_TOKEN_EXPIRY_MINUTES * 60 * 1000,
  );

  const enrollment = await WhatsAppEnrollmentModel.findOneAndUpdate(
    { employeeId: employee._id },
    {
      $set: {
        tokenHash,
        status: "pending",
        expiresAt,
        attemptCount: 0,
      },
      $unset: {
        verifiedAt: 1,
        consentedAt: 1,
        consentVersion: 1,
        revokedAt: 1,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    },
  );

  return {
    enrollment,
    token,
    expiresAt,
  };
}

export async function verifyWhatsAppEnrollmentToken(
  input: {
    token: string;
    senderPhoneNumber: string;
  },
  now = new Date(),
) {
  const tokenHash = hashToken(input.token.trim());

  const enrollment = await WhatsAppEnrollmentModel.findOne({
    tokenHash,
    status: "pending",
  });

  if (!enrollment) {
    throw new AppError("Invalid or already used enrollment token.", 400);
  }

  if (enrollment.expiresAt <= now) {
    enrollment.status = "expired";
    await enrollment.save();

    throw new AppError("Enrollment token has expired.", 400);
  }

  if (enrollment.attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
    enrollment.status = "revoked";
    enrollment.revokedAt = now;
    await enrollment.save();

    throw new AppError("Maximum verification attempts exceeded.", 429);
  }

  const employee = await EmployeeModel.findById(enrollment.employeeId);

  if (!employee || !employee.isActive) {
    throw new AppError("Active employee not found.", 404);
  }

  const registeredPhone = normalizePhoneNumber(employee.phoneNumber);
  const senderPhone = normalizePhoneNumber(input.senderPhoneNumber);

  if (!registeredPhone || registeredPhone !== senderPhone) {
    enrollment.attemptCount += 1;

    if (enrollment.attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
      enrollment.status = "revoked";
      enrollment.revokedAt = now;
    }

    await enrollment.save();

    throw new AppError("WhatsApp number does not match employee record.", 403);
  }

  enrollment.status = "verified";
  enrollment.verifiedAt = now;

  await enrollment.save();

  return {
    enrollment,
    employee,
  };
}

export async function acceptWhatsAppEnrollmentConsent(
  enrollmentId: string,
  now = new Date(),
) {
  const enrollment = await WhatsAppEnrollmentModel.findOneAndUpdate(
    {
      _id: enrollmentId,
      status: "verified",
    },
    {
      $set: {
        status: "enrolled",
        consentedAt: now,
        consentVersion: CONSENT_VERSION,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!enrollment) {
    throw new AppError(
      "Enrollment must be verified before consent can be accepted.",
      400,
    );
  }

  return enrollment;
}

export async function revokeWhatsAppEnrollment(
  employeeId: string,
  now = new Date(),
) {
  const enrollment = await WhatsAppEnrollmentModel.findOneAndUpdate(
    {
      employeeId,
      status: { $in: ["pending", "verified", "enrolled"] },
    },
    {
      $set: {
        status: "revoked",
        revokedAt: now,
      },
    },
    {
      new: true,
    },
  );

  if (!enrollment) {
    throw new AppError("Active enrollment not found.", 404);
  }

  return enrollment;
}
