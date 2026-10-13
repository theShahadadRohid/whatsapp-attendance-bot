
import { EmployeeModel } from "./employee.model.js";
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput
} from "./employee.types.js";
import { AppError } from "../../common/errors/app-error.js";

export async function createEmployee(input: CreateEmployeeInput) {
  const existingEmployee = await EmployeeModel.findOne({
    $or: [
      { employeeCode: input.employeeCode },
      { phoneNumber: input.phoneNumber }
    ]
  }).lean();

  if (existingEmployee) {
    if (existingEmployee.employeeCode === input.employeeCode) {
      throw new AppError(
        "An employee with this employee code already exists.",
        409,
        "EMPLOYEE_CODE_EXISTS"
      );
    }

    throw new AppError(
      "An employee with this phone number already exists.",
      409,
      "EMPLOYEE_PHONE_EXISTS"
    );
  }

  return EmployeeModel.create(input);
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

    EmployeeModel.countDocuments(filter)
  ]);

  return {
    employees,
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + employees.length < total
    }
  };
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput
) {
  const employee = await EmployeeModel.findByIdAndUpdate(
    id,
    { $set: input },
    {
      new: true,
      runValidators: true
    }
  ).lean();

  if (!employee) {
    throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

export async function deactivateEmployee(id: string) {
  const employee = await EmployeeModel.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true, runValidators: true }
  ).lean();

  if (!employee) {
    throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  }

  return employee;
}
