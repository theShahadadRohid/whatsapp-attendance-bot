
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
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

/**
 * Finds a verified enrollment belonging to the sender.
 *
 * The sender's phone number is the primary verification identity.
 * If a BSUID was recorded during token verification, a different
 * BSUID is rejected.
 */
export async function findVerifiedWhatsAppEnrollmentForSender(
  input: {
    senderPhoneNumber?: string;
    senderBsuid?: string;
  },
) {
  const senderPhone = input.senderPhoneNumber
    ? normalizePhoneNumber(input.senderPhoneNumber)
    : "";

  const senderBsuid = input.senderBsuid?.trim();

  if (!senderPhone && !senderBsuid) {
    return null;
  }

  const enrollments = await WhatsAppEnrollmentModel.find({
    status: "verified",
  });

  for (const enrollment of enrollments) {
    const verifiedPhone = enrollment.verifiedPhoneNumber
      ? normalizePhoneNumber(enrollment.verifiedPhoneNumber)
      : "";

    const phoneMatches =
      Boolean(senderPhone) &&
      Boolean(verifiedPhone) &&
      senderPhone === verifiedPhone;

    const bsuidMatches =
      Boolean(senderBsuid) &&
      Boolean(enrollment.verifiedBsuid) &&
      senderBsuid === enrollment.verifiedBsuid;

    if (!phoneMatches && !bsuidMatches) {
      continue;
    }

    if (
      senderBsuid &&
      enrollment.verifiedBsuid &&
      senderBsuid !== enrollment.verifiedBsuid
    ) {
      continue;
    }

    const employee = await EmployeeModel.findOne({
      _id: enrollment.employeeId,
      isActive: true,
    });

    if (!employee) {
      continue;
    }

    return {
      enrollment,
      employee,
    };
  }

  return null;
}

/**
 * Accepts explicit consent and links the WhatsApp BSUID only
 * after the sender has been verified and consent has been given.
 */
export async function acceptWhatsAppEnrollmentConsent(
  input: {
    enrollmentId: string;
    senderPhoneNumber: string;
    senderBsuid?: string;
  },
  now = new Date(),
) {
  const enrollment = await WhatsAppEnrollmentModel.findOne({
    _id: input.enrollmentId,
    status: "verified",
  });

  if (!enrollment) {
    throw new AppError(
      "Enrollment must be verified before consent can be accepted.",
      400,
    );
  }

  const verifiedPhone = enrollment.verifiedPhoneNumber
    ? normalizePhoneNumber(enrollment.verifiedPhoneNumber)
    : "";

  const senderPhone = normalizePhoneNumber(
    input.senderPhoneNumber,
  );

  if (!verifiedPhone || !senderPhone || verifiedPhone !== senderPhone) {
    throw new AppError(
      "The WhatsApp number does not match the verified enrollment.",
      403,
    );
  }

  const incomingBsuid = input.senderBsuid?.trim();

  if (
    incomingBsuid &&
    enrollment.verifiedBsuid &&
    incomingBsuid !== enrollment.verifiedBsuid
  ) {
    throw new AppError(
      "The WhatsApp identity does not match the verified enrollment.",
      403,
    );
  }

  const employee = await EmployeeModel.findOne({
    _id: enrollment.employeeId,
    isActive: true,
  });

  if (!employee) {
    throw new AppError("Active employee not found.", 404);
  }

  // Prefer the BSUID captured during verification. If Meta did not
  // provide one then, use the identity from the consent message.
  const bsuidToLink =
    enrollment.verifiedBsuid || incomingBsuid;

  let newlyLinkedBsuid = false;

  if (bsuidToLink) {
    const existingBsuid = employee.whatsappBusinessScopedUserId;

    if (existingBsuid && existingBsuid !== bsuidToLink) {
      throw new AppError(
        "This employee already has a different WhatsApp identity linked. Contact your manager.",
        409,
      );
    }

    if (!existingBsuid) {
      try {
        const updatedEmployee =
          await EmployeeModel.findOneAndUpdate(
            {
              _id: employee._id,
              isActive: true,
              $or: [
                { whatsappBusinessScopedUserId: { $exists: false } },
                { whatsappBusinessScopedUserId: null },
              ],
            },
            {
              $set: {
                whatsappBusinessScopedUserId: bsuidToLink,
              },
            },
            {
              returnDocument: "after",
              runValidators: true,
            },
          );

        if (!updatedEmployee) {
          throw new AppError(
            "The employee's WhatsApp identity was changed by another request. Please try again.",
            409,
          );
        }

        newlyLinkedBsuid = true;
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        if (isDuplicateKeyError(error)) {
          throw new AppError(
            "This WhatsApp identity is already linked to another employee.",
            409,
          );
        }

        throw error;
      }
    }
  }

  const updatedEnrollment =
    await WhatsAppEnrollmentModel.findOneAndUpdate(
      {
        _id: enrollment._id,
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
    // If this request linked a new BSUID but lost the enrollment
    // state transition, undo only the link created by this request.
    if (newlyLinkedBsuid && bsuidToLink) {
      await EmployeeModel.updateOne(
        {
          _id: employee._id,
          whatsappBusinessScopedUserId: bsuidToLink,
        },
        {
          $unset: {
            whatsappBusinessScopedUserId: 1,
          },
        },
      );
    }

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
