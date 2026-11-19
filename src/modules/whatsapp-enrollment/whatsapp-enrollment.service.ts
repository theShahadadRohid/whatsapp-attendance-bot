
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
        verifiedPhoneNumber: 1,
        verifiedBsuid: 1,
        consentedAt: 1,
        consentVersion: 1,
        revokedAt: 1,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
      setDefaultsOnInsert: true,
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
    senderBsuid?: string;
  },
  now = new Date(),
) {
  const tokenHash = hashToken(input.token.trim());

  const enrollment = await WhatsAppEnrollmentModel.findOne({
    tokenHash,
    status: "pending",
  });

  if (!enrollment) {
    throw new AppError(
      "Invalid or already used enrollment token.",
      400,
    );
  }

  if (enrollment.expiresAt <= now) {
    await WhatsAppEnrollmentModel.updateOne(
      {
        _id: enrollment._id,
        status: "pending",
      },
      {
        $set: { status: "expired" },
      },
    );

    throw new AppError("Enrollment token has expired.", 400);
  }

  if (enrollment.attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
    await WhatsAppEnrollmentModel.updateOne(
      {
        _id: enrollment._id,
        status: "pending",
      },
      {
        $set: {
          status: "revoked",
          revokedAt: now,
        },
      },
    );

    throw new AppError(
      "Maximum verification attempts exceeded.",
      429,
    );
  }

  const employee = await EmployeeModel.findById(
    enrollment.employeeId,
  );

  if (!employee || !employee.isActive) {
    await WhatsAppEnrollmentModel.updateOne(
      {
        _id: enrollment._id,
        status: "pending",
      },
      {
        $set: {
          status: "revoked",
          revokedAt: now,
        },
      },
    );

    throw new AppError("Active employee not found.", 404);
  }

  const registeredPhone = normalizePhoneNumber(
    employee.phoneNumber,
  );

  const senderPhone = normalizePhoneNumber(
    input.senderPhoneNumber,
  );

  if (!registeredPhone || registeredPhone !== senderPhone) {
    const updatedEnrollment =
      await WhatsAppEnrollmentModel.findOneAndUpdate(
        {
          _id: enrollment._id,
          status: "pending",
          expiresAt: { $gt: now },
          attemptCount: { $lt: MAX_VERIFICATION_ATTEMPTS },
        },
        {
          $inc: { attemptCount: 1 },
        },
        {
          returnDocument: "after",
        },
      );

    if (
      updatedEnrollment &&
      updatedEnrollment.attemptCount >= MAX_VERIFICATION_ATTEMPTS
    ) {
      await WhatsAppEnrollmentModel.updateOne(
        {
          _id: enrollment._id,
          status: "pending",
          attemptCount: { $gte: MAX_VERIFICATION_ATTEMPTS },
        },
        {
          $set: {
            status: "revoked",
            revokedAt: now,
          },
        },
      );

      throw new AppError(
        "Maximum verification attempts exceeded. Request a new enrollment token.",
        429,
      );
    }

    if (!updatedEnrollment) {
      throw new AppError(
        "Invalid, expired, or already used enrollment token.",
        400,
      );
    }

    throw new AppError(
      "WhatsApp number does not match employee record.",
      403,
    );
  }

  // Only one concurrent request can successfully move pending to verified.
  const verifiedEnrollment =
    await WhatsAppEnrollmentModel.findOneAndUpdate(
      {
        _id: enrollment._id,
        status: "pending",
        expiresAt: { $gt: now },
        attemptCount: { $lt: MAX_VERIFICATION_ATTEMPTS },
      },
      {
        $set: {
          status: "verified",
          verifiedAt: now,
          verifiedPhoneNumber: input.senderPhoneNumber,
          ...(input.senderBsuid
            ? { verifiedBsuid: input.senderBsuid }
            : {}),
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

  if (!verifiedEnrollment) {
    throw new AppError(
      "Enrollment token is expired or has already been used.",
      400,
    );
  }

  return {
    enrollment: verifiedEnrollment,
    employee,
  };
}

export async function acceptWhatsAppEnrollmentConsent(
  enrollmentId: string,
  now = new Date(),
) {
  const enrollment = await WhatsAppEnrollmentModel.findOne({
    _id: enrollmentId,
    status: "verified",
  });

  if (!enrollment) {
    throw new AppError(
      "Enrollment must be verified before consent can be accepted.",
      400,
    );
  }

  const employee = await EmployeeModel.findOne({
    _id: enrollment.employeeId,
    isActive: true,
  });

  if (!employee) {
    throw new AppError("Active employee not found.", 404);
  }

  const updatedEnrollment =
    await WhatsAppEnrollmentModel.findOneAndUpdate(
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
        returnDocument: "after",
        runValidators: true,
      },
    );

  if (!updatedEnrollment) {
    throw new AppError(
      "Enrollment consent has already been processed.",
      409,
    );
  }

  return updatedEnrollment;
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
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!enrollment) {
    throw new AppError("Active enrollment not found.", 404);
  }

  return enrollment;
}
