
import argon2 from "argon2";
import jwt from "jsonwebtoken";

import { AdminModel } from "./admin.model.js";
import type { LoginInput } from "./auth.schema.js";
import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { APP_NAME } from "../../constants/app.constants.js";

import { EmployeeModel } from "../employees/employee.model.js";
import type { EmployeeLoginInput } from "./auth.schema.js";

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
    expiresIn: 900,
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
    expiresIn: 900,
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      designation: employee.designation,
      phoneNumber: employee.phoneNumber,
      officialEmail: employee.officialEmail,
    },
  };
}
