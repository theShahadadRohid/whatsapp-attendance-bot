
import { Types } from "mongoose";

import { AppError } from "../../common/errors/app-error.js";
import { EmployeeModel } from "../employees/employee.model.js";
import { UnknownContactModel } from "./unknown-contact.model.js";

const MAX_ATTEMPTS = 3;
const RESTRICTION_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGE_IDS = 100;
const MAX_UPDATE_RETRIES = 20;

export type UnknownContactIdentity =
  | { phoneNumber: string; bsuid?: never }
  | { bsuid: string; phoneNumber?: never };

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

function validateObjectId(id: string, field: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(
      `Invalid ${field}.`,
      400,
      "INVALID_ID",
    );
  }
}

// Backward-compatible phone-number overload.
export function trackUnknownContact(
  phoneNumber: string,
  messageId: string,
  now?: Date,
): Promise<UnknownContactResult>;

// BSUID or phone-number identity overload.
export function trackUnknownContact(
  identity: UnknownContactIdentity,
  messageId: string,
  now?: Date,
): Promise<UnknownContactResult>;

export async function trackUnknownContact(
  identityOrPhone: string | UnknownContactIdentity,
  messageId: string,
  now = new Date(),
): Promise<UnknownContactResult> {
  let identityValue: string;

  let identityFilter:
    | { phoneNumber: string }
    | { whatsappBusinessScopedUserId: string };

  let identityData:
    | { phoneNumber: string }
    | { whatsappBusinessScopedUserId: string };

  if (typeof identityOrPhone === "string") {
    identityValue = identityOrPhone.trim();

    if (!identityValue) {
      throw new Error("Unknown contact identity cannot be empty.");
    }

    identityFilter = { phoneNumber: identityValue };
    identityData = { phoneNumber: identityValue };
  } else if (typeof identityOrPhone.bsuid === "string") {
    identityValue = identityOrPhone.bsuid.trim();

    if (!identityValue) {
      throw new Error("Unknown contact identity cannot be empty.");
    }

    identityFilter = {
      whatsappBusinessScopedUserId: identityValue,
    };

    identityData = {
      whatsappBusinessScopedUserId: identityValue,
    };
  } else {
    identityValue = identityOrPhone.phoneNumber.trim();

    if (!identityValue) {
      throw new Error("Unknown contact identity cannot be empty.");
    }

    identityFilter = { phoneNumber: identityValue };
    identityData = { phoneNumber: identityValue };
  }

  for (let retry = 0; retry < MAX_UPDATE_RETRIES; retry += 1) {
    const contact = await UnknownContactModel.findOne(identityFilter);

    if (!contact) {
      try {
        await UnknownContactModel.create({
          ...identityData,
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
        if (isDuplicateKeyError(error)) {
          continue;
        }

        throw error;
      }
    }

    const processedMessageIds = contact.processedMessageIds ?? [];

    if (processedMessageIds.includes(messageId)) {
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
    `Could not update unknown contact ${identityValue} after repeated concurrent changes.`,
  );
}

export async function linkUnknownContactToEmployee(
  contactId: string,
  employeeId: string,
) {
  validateObjectId(contactId, "contact ID");
  validateObjectId(employeeId, "employee ID");

  const contact = await UnknownContactModel.findById(contactId);

  if (!contact) {
    throw new AppError(
      "Unknown contact not found.",
      404,
      "UNKNOWN_CONTACT_NOT_FOUND",
    );
  }

  if (!contact.phoneNumber) {
    throw new AppError(
      "This contact has no phone number to verify against the employee record.",
      409,
      "CONTACT_PHONE_REQUIRED",
    );
  }

  const employee = await EmployeeModel.findById(employeeId);

  if (!employee) {
    throw new AppError(
      "Employee not found.",
      404,
      "EMPLOYEE_NOT_FOUND",
    );
  }

  if (employee.phoneNumber !== contact.phoneNumber) {
    throw new AppError(
      "The contact phone number does not match the employee's registered phone number.",
      409,
      "PHONE_NUMBER_MISMATCH",
    );
  }

  const bsuid = contact.whatsappBusinessScopedUserId;

  if (
    bsuid &&
    employee.whatsappBusinessScopedUserId &&
    employee.whatsappBusinessScopedUserId !== bsuid
  ) {
    throw new AppError(
      "This employee is already linked to another WhatsApp identity.",
      409,
      "EMPLOYEE_WHATSAPP_ALREADY_LINKED",
    );
  }

  try {
    if (bsuid) {
      const updatedEmployee = await EmployeeModel.findOneAndUpdate(
        {
          _id: employee._id,
          phoneNumber: contact.phoneNumber,
          $or: [
            { whatsappBusinessScopedUserId: bsuid },
            { whatsappBusinessScopedUserId: { $exists: false } },
            { whatsappBusinessScopedUserId: null },
          ],
        },
        {
          $set: {
            whatsappBusinessScopedUserId: bsuid,
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        },
      );

      if (!updatedEmployee) {
        throw new AppError(
          "The employee's WhatsApp identity changed. Refresh and try again.",
          409,
          "WHATSAPP_LINK_CONFLICT",
        );
      }
    }

    await UnknownContactModel.deleteOne({
      _id: contact._id,
    });

    return {
      employeeId: employee._id.toString(),
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      phoneNumber: employee.phoneNumber,
      whatsappBusinessScopedUserId:
        bsuid ?? employee.whatsappBusinessScopedUserId,
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "This WhatsApp identity is already linked to another employee.",
        409,
        "WHATSAPP_IDENTITY_ALREADY_LINKED",
      );
    }

    throw error;
  }
}

export async function restrictUnknownContact(contactId: string) {
  validateObjectId(contactId, "contact ID");

  const now = new Date();
  const restrictedUntil = new Date(
    now.getTime() + RESTRICTION_DURATION_MS,
  );

  const contact = await UnknownContactModel.findByIdAndUpdate(
    contactId,
    {
      $set: {
        attemptCount: MAX_ATTEMPTS,
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

  if (!contact) {
    throw new AppError(
      "Unknown contact not found.",
      404,
      "UNKNOWN_CONTACT_NOT_FOUND",
    );
  }

  return contact;
}

export async function releaseUnknownContactRestriction(
  contactId: string,
) {
  validateObjectId(contactId, "contact ID");

  const contact = await UnknownContactModel.findByIdAndUpdate(
    contactId,
    {
      $set: {
        attemptCount: 0,
      },
      $unset: {
        restrictedUntil: 1,
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

  if (!contact) {
    throw new AppError(
      "Unknown contact not found.",
      404,
      "UNKNOWN_CONTACT_NOT_FOUND",
    );
  }

  return contact;
}
