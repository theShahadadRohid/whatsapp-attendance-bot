import argon2 from "argon2";
import jwt from "jsonwebtoken";

import { AdminModel } from "./admin.model.js";
import type { LoginInput } from "./auth.schema.js";
import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { APP_NAME } from "../../constants/app.constants.js";

export async function loginAdmin(input: LoginInput) {
  const admin = await AdminModel.findOne({
    email: input.email
  }).select("+passwordHash");

  // Use the same response for an unknown email and a wrong password.
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