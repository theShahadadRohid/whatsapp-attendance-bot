
import { EmployeeModel } from "./employee.model.js";
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "./employee.types.js";
import { AppError } from "../../common/errors/app-error.js";

function getDuplicateEmployeeError(error: unknown): AppError | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== 11000
  ) {
    return null;
  }

  const keyPattern =
    "keyPattern" in error &&
    typeof error.keyPattern === "object" &&
    error.keyPattern !== null
      ? error.keyPattern
      : {};

  const keyValue =
    "keyValue" in error &&
    typeof error.keyValue === "object" &&
    error.keyValue !== null
      ? error.keyValue
      : {};

  if ("employeeCode" in keyPattern || "employeeCode" in keyValue) {
    return new AppError(
      "An employee with this employee code already exists.",
      409,
      "EMPLOYEE_CODE_EXISTS",
    );
  }

  if ("phoneNumber" in keyPattern || "phoneNumber" in keyValue) {
    return new AppError(
      "An employee with this phone number already exists.",
      409,
      "EMPLOYEE_PHONE_EXISTS",
    );
  }

  if (
    "whatsappBusinessScopedUserId" in keyPattern ||
    "whatsappBusinessScopedUserId" in keyValue
  ) {
    return new AppError(
      "This WhatsApp identity is already linked to another employee.",
      409,
      "EMPLOYEE_WHATSAPP_ID_EXISTS",
    );
  }

  return null;
}

function isDuplicateWhatsAppIdentityError(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== 11000
  ) {
    return false;
  }

  const keyPattern =
    "keyPattern" in error &&
    typeof error.keyPattern === "object" &&
    error.keyPattern !== null
      ? error.keyPattern
      : {};

  const keyValue =
    "keyValue" in error &&
    typeof error.keyValue === "object" &&
    error.keyValue !== null
      ? error.keyValue
      : {};

  return (
    "whatsappBusinessScopedUserId" in keyPattern ||
    "whatsappBusinessScopedUserId" in keyValue
  );
}

function handleDuplicateEmployeeError(error: unknown): never {
  const duplicateError = getDuplicateEmployeeError(error);

  if (duplicateError) {
    throw duplicateError;
  }

  throw error;
}

export async function createEmployee(input: CreateEmployeeInput) {
  try {
    const existingEmployee = await EmployeeModel.findOne({
      $or: [
        { employeeCode: input.employeeCode },
        { phoneNumber: input.phoneNumber },
      ],
    }).lean();

    if (existingEmployee) {
      if (existingEmployee.employeeCode === input.employeeCode) {
        throw new AppError(
          "An employee with this employee code already exists.",
          409,
          "EMPLOYEE_CODE_EXISTS",
        );
      }

      throw new AppError(
        "An employee with this phone number already exists.",
        409,
        "EMPLOYEE_PHONE_EXISTS",
      );
    }

    return await EmployeeModel.create(input);
  } catch (error) {
    handleDuplicateEmployeeError(error);
  }
}

export async function getEmployeeById(id: string) {
  const employee = await EmployeeModel.findById(id).lean();

  if (!employee) {
    throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

export async function listEmployees(options?: {
  includeInactive?: boolean;
  limit?: number;
  skip?: number;
}) {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const skip = Math.max(options?.skip ?? 0, 0);

  const filter = options?.includeInactive ? {} : { isActive: true };

  const [employees, total] = await Promise.all([
    EmployeeModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    EmployeeModel.countDocuments(filter),
  ]);

  return {
    employees,
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + employees.length < total,
    },
  };
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
) {
  try {
    if (input.phoneNumber) {
      const existingEmployee = await EmployeeModel.findOne({
        phoneNumber: input.phoneNumber,
        _id: { $ne: id },
      }).lean();

      if (existingEmployee) {
        throw new AppError(
          "An employee with this phone number already exists.",
          409,
          "EMPLOYEE_PHONE_EXISTS",
        );
      }
    }

    const employee = await EmployeeModel.findByIdAndUpdate(
      id,
      { $set: input },
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    if (!employee) {
      throw new AppError(
        "Employee not found.",
        404,
        "EMPLOYEE_NOT_FOUND",
      );
    }

    return employee;
  } catch (error) {
    handleDuplicateEmployeeError(error);
  }
}

export async function deactivateEmployee(id: string) {
  const employee = await EmployeeModel.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true, runValidators: true },
  ).lean();

  if (!employee) {
    throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

function getPhoneNumberCandidates(phoneNumber: string): string[] {
  let digits = phoneNumber.replace(/\D/g, "");

  // Convert international dialing prefix to country-code format.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (!digits) {
    return [];
  }

  const candidates = new Set<string>([
    digits,
    `+${digits}`,
  ]);

  // Bangladesh: 8801712345678 -> 01712345678
  if (digits.startsWith("880")) {
    const localNumber = `0${digits.slice(3)}`;
    candidates.add(localNumber);
  }

  // Bangladesh: 01712345678 -> 8801712345678
  if (digits.startsWith("0")) {
    const internationalNumber = `880${digits.slice(1)}`;

    candidates.add(internationalNumber);
    candidates.add(`+${internationalNumber}`);
  }

  return [...candidates];
}

export async function findEmployeeByWhatsAppNumber(
  phoneNumber: string,
) {
  const candidates = getPhoneNumberCandidates(phoneNumber);

  if (candidates.length === 0) {
    return { status: "not_found" as const };
  }

  const employee = await EmployeeModel.findOne({
    phoneNumber: { $in: candidates },
  }).lean();

  if (!employee) {
    return { status: "not_found" as const };
  }

  if (!employee.isActive) {
    return { status: "inactive" as const };
  }

  return {
    status: "active" as const,
    employee,
  };
}

function isPhoneNumberMatch(
  incomingPhoneNumber: string,
  employeePhoneNumber: string,
): boolean {
  const incomingCandidates = getPhoneNumberCandidates(incomingPhoneNumber);
  const employeeCandidates = getPhoneNumberCandidates(employeePhoneNumber);

  return employeeCandidates.some((candidate) =>
    incomingCandidates.includes(candidate),
  );
}

export async function findEmployeeByWhatsAppIdentity(input: {
  phoneNumber?: string;
  bsuid?: string;
}) {
  const phoneNumber = input.phoneNumber?.trim();
  const bsuid = input.bsuid?.trim();

  // Case 1: A BSUID is already linked.
  if (bsuid) {
    const linkedEmployee = await EmployeeModel.findOne({
      whatsappBusinessScopedUserId: bsuid,
    }).lean();

    if (linkedEmployee) {
      if (
        phoneNumber &&
        !isPhoneNumberMatch(phoneNumber, linkedEmployee.phoneNumber)
      ) {
        return { status: "identity_mismatch" as const };
      }

      if (!linkedEmployee.isActive) {
        return {
          status: "inactive" as const,
          employee: linkedEmployee,
        };
      }

      return {
        status: "active" as const,
        employee: linkedEmployee,
      };
    }
  }

  // Case 2: An unknown BSUID without a phone number
  // cannot safely identify an employee.
  if (!phoneNumber) {
    return { status: "not_found" as const };
  }

  const phoneCandidates = getPhoneNumberCandidates(phoneNumber);

  if (phoneCandidates.length === 0) {
    return { status: "not_found" as const };
  }

  // Find the employee using their registered phone number.
  const employee = await EmployeeModel.findOne({
    phoneNumber: { $in: phoneCandidates },
  }).lean();

  if (!employee) {
    return { status: "not_found" as const };
  }

  if (!employee.isActive) {
    return {
      status: "inactive" as const,
      employee,
    };
  }

  // Phone-only identification: there is no BSUID to link.
  if (!bsuid) {
    return {
      status: "active" as const,
      employee,
    };
  }

  // Never overwrite an employee's existing BSUID.
  if (employee.whatsappBusinessScopedUserId) {
    return { status: "identity_mismatch" as const };
  }

  // Atomically link the BSUID only if the employee is still active
  // and does not already have a BSUID.
  try {
    const linkedEmployee = await EmployeeModel.findOneAndUpdate(
      {
        _id: employee._id,
        isActive: true,
        whatsappBusinessScopedUserId: { $exists: false },
      },
      {
        $set: {
          whatsappBusinessScopedUserId: bsuid,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    if (linkedEmployee) {
      return {
        status: "active" as const,
        employee: linkedEmployee,
      };
    }

    // Another request may have linked or deactivated this employee.
    const currentEmployee = await EmployeeModel.findById(
      employee._id,
    ).lean();

    if (
      currentEmployee?.whatsappBusinessScopedUserId === bsuid
    ) {
      if (!currentEmployee.isActive) {
        return {
          status: "inactive" as const,
          employee: currentEmployee,
        };
      }

      return {
        status: "active" as const,
        employee: currentEmployee,
      };
    }

    return { status: "identity_mismatch" as const };
  } catch (error) {
    // The unique BSUID index prevents the same BSUID from being
    // assigned to multiple employees.
    if (isDuplicateWhatsAppIdentityError(error)) {
      return { status: "identity_mismatch" as const };
    }

    handleDuplicateEmployeeError(error);
  }
}
