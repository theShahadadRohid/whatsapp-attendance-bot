
import argon2 from "argon2";
import jwt from "jsonwebtoken";

import { AdminModel } from "./admin.model.js";
import type { LoginInput } from "./auth.schema.js";
import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { APP_NAME } from "../../constants/app.constants.js";

import { EmployeeModel } from "../employees/employee.model.js";
import type { EmployeeLoginInput } from "./auth.schema.js";

import { PasswordResetRequestModel } from "./password-reset-request.model.js";

import type {
  ChangeEmployeePasswordInput,
  ForgotEmployeePasswordInput,
} from "./auth.schema.js";

export async function loginAdmin(input: LoginInput) {
  const admin = await AdminModel.findOne({
    email: input.email
  }).select("+passwordHash");

  if (!admin || !admin.isActive) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const passwordMatches = await argon2.verify(
    admin.passwordHash,
    input.password
  );

  if (!passwordMatches) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const accessToken = jwt.sign(
    {
      accountType: "admin",
      role: admin.role
    },
    env.JWT_SECRET,
    {
      subject: admin.id,
      issuer: APP_NAME,
      audience: APP_NAME,
      expiresIn: "15m"
    }
  );

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn: 1800,
    admin: {
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role
    }
  };
}

export async function loginEmployee(input: EmployeeLoginInput) {
  const employee = await EmployeeModel.findOne({
    phoneNumber: input.phoneNumber,
  }).select("+passwordHash");

  if (!employee || !employee.isActive || !employee.passwordHash) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  const passwordMatches = await argon2.verify(
    employee.passwordHash,
    input.password,
  );

  if (!passwordMatches) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  const accessToken = jwt.sign(
  {
    accountType: "employee",
    role: "employee",
    tokenVersion: employee.tokenVersion ?? 0,
  },
  env.JWT_SECRET,
  {
    subject: employee.id,
    issuer: APP_NAME,
    audience: APP_NAME,
    expiresIn: "15m",
  },
);

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn: 1800,
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      designation: employee.designation,
      phoneNumber: employee.phoneNumber,
      officialEmail: employee.officialEmail,
      mustChangePassword: employee.mustChangePassword,
    },
  };
}

export async function changeEmployeePassword(
  employeeId: string,
  input: ChangeEmployeePasswordInput,
) {
  const employee = await EmployeeModel.findById(employeeId).select(
    "+passwordHash",
  );

  if (!employee || !employee.isActive || !employee.passwordHash) {
    throw new AppError(
      "Employee account not found or unavailable.",
      404,
      "EMPLOYEE_NOT_FOUND",
    );
  }

  const currentPasswordMatches = await argon2.verify(
    employee.passwordHash,
    input.currentPassword,
  );

  if (!currentPasswordMatches) {
    throw new AppError(
      "Current password is incorrect.",
      400,
      "INCORRECT_CURRENT_PASSWORD",
    );
  }

  if (
    await argon2.verify(employee.passwordHash, input.newPassword)
  ) {
    throw new AppError(
      "New password must be different from the current password.",
      400,
      "PASSWORD_UNCHANGED",
    );
  }

  const passwordHash = await argon2.hash(input.newPassword);

  const result = await EmployeeModel.updateOne(
    {
      _id: employeeId,
      passwordHash: employee.passwordHash,
    },
    {
      $set: {
        passwordHash,
        mustChangePassword: false,
      },
      $inc: {
        tokenVersion: 1,
      },
    },
  );

  if (result.modifiedCount !== 1) {
    throw new AppError(
      "Password could not be updated. Please try again.",
      409,
      "PASSWORD_UPDATE_CONFLICT",
    );
  }

  return {
    message: "Password changed successfully. Please log in again.",
  };
}

export async function requestEmployeePasswordReset(
  input: ForgotEmployeePasswordInput,
) {
  const genericResponse = {
    message:
      "If an employee account exists for this phone number, a password reset request has been submitted.",
  };

  const employee = await EmployeeModel.findOne({
    phoneNumber: input.phoneNumber,
    isActive: true,
  }).select("+passwordHash");

  if (!employee || !employee.passwordHash) {
    return genericResponse;
  }

  const existingRequest = await PasswordResetRequestModel.findOne({
    employeeId: employee._id,
  });

  if (
    existingRequest?.status === "pending" ||
    existingRequest?.status === "processing"
  ) {
    return genericResponse;
  }

  // Reuse an already resolved request.
  if (existingRequest?.status === "resolved") {
    await PasswordResetRequestModel.updateOne(
      {
        _id: existingRequest._id,
        status: "resolved",
      },
      {
        $set: {
          status: "pending",
          requestedAt: new Date(),
        },
        $unset: {
          resolvedAt: 1,
          resolvedBy: 1,
        },
      },
    );

    return genericResponse;
  }

  // Create a new request if none exists.
  try {
    await PasswordResetRequestModel.create({
      employeeId: employee._id,
    });
  } catch (error) {
    // A duplicate request may have been created simultaneously.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return genericResponse;
    }

    throw error;
  }

  return genericResponse;
}

export async function listPasswordResetRequests() {
  return PasswordResetRequestModel.find({
    status: "pending",
  })
    .populate(
      "employeeId",
      "employeeCode fullName designation officialEmail phoneNumber",
    )
    .sort({ requestedAt: 1 })
    .lean();
}


export async function adminResetEmployeePassword(
  requestId: string,
  adminId: string,
  temporaryPassword: string,
) {
  const request = await PasswordResetRequestModel.findOneAndUpdate(
    {
      _id: requestId,
      status: "pending",
    },
    {
      $set: {
        status: "processing",
      },
    },
    {
      new: true,
    },
  );

  if (!request) {
    throw new AppError(
      "Pending password reset request not found.",
      404,
      "RESET_REQUEST_NOT_FOUND",
    );
  }

  let employeePasswordUpdated = false;

  try {
    const passwordHash = await argon2.hash(temporaryPassword);

    const employee = await EmployeeModel.findOneAndUpdate(
      {
        _id: request.employeeId,
        isActive: true,
        passwordHash: { $exists: true },
      },
      {
        $set: {
          passwordHash,
          mustChangePassword: true,
        },
        $inc: {
          tokenVersion: 1,
        },
      },
      {
        new: true,
      },
    );

    if (!employee) {
      throw new AppError(
        "Employee account not found or inactive.",
        404,
        "EMPLOYEE_NOT_FOUND",
      );
    }

    employeePasswordUpdated = true;

    const resolvedRequest = await PasswordResetRequestModel.updateOne(
      {
        _id: request._id,
        status: "processing",
      },
      {
        $set: {
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: adminId,
        },
      },
    );

    if (resolvedRequest.modifiedCount !== 1) {
      throw new AppError(
        "Password was updated, but the reset request could not be finalized. Admin intervention is required.",
        500,
        "RESET_REQUEST_FINALIZATION_FAILED",
      );
    }

    return {
      message:
        "Temporary password created successfully. The employee must change it after logging in.",
    };
  } catch (error) {
    // Only return to pending if the employee's password
    // has NOT already been changed.
    if (!employeePasswordUpdated) {
      await PasswordResetRequestModel.updateOne(
        {
          _id: request._id,
          status: "processing",
        },
        {
          $set: {
            status: "pending",
          },
        },
      );
    }

    throw error;
  }
}
