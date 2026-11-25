
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

  if ("officialEmail" in keyPattern || "officialEmail" in keyValue) {
    return new AppError(
      "An employee with this official email already exists.",
      409,
      "EMPLOYEE_EMAIL_EXISTS",
    );
  }

  return null;
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
        { officialEmail: input.officialEmail },
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

      if (existingEmployee.phoneNumber === input.phoneNumber) {
        throw new AppError(
          "An employee with this phone number already exists.",
          409,
          "EMPLOYEE_PHONE_EXISTS",
        );
      }

      throw new AppError(
        "An employee with this official email already exists.",
        409,
        "EMPLOYEE_EMAIL_EXISTS",
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
    const duplicateConditions = [];

    if (input.phoneNumber) {
      duplicateConditions.push({ phoneNumber: input.phoneNumber });
    }

    if (input.officialEmail) {
      duplicateConditions.push({ officialEmail: input.officialEmail });
    }

    if (duplicateConditions.length > 0) {
      const existingEmployee = await EmployeeModel.findOne({
        $or: duplicateConditions,
        _id: { $ne: id },
      }).lean();

      if (existingEmployee) {
        if (
          input.phoneNumber &&
          existingEmployee.phoneNumber === input.phoneNumber
        ) {
          throw new AppError(
            "An employee with this phone number already exists.",
            409,
            "EMPLOYEE_PHONE_EXISTS",
          );
        }

        throw new AppError(
          "An employee with this official email already exists.",
          409,
          "EMPLOYEE_EMAIL_EXISTS",
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
