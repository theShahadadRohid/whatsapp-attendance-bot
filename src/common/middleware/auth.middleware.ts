import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { APP_NAME } from "../../constants/app.constants.js";
import { ADMIN_ROLES, AdminRole } from "../../modules/auth/admin.model.js";

interface AccessTokenPayload extends JwtPayload {
  sub: string;
  role: AdminRole;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHENTICATED")
    );
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHENTICATED")
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: APP_NAME,
      audience: APP_NAME
    });

    if (
      typeof decoded === "string" ||
      !decoded.sub ||
      typeof decoded.role !== "string" ||
      !ADMIN_ROLES.includes(decoded.role as AdminRole)
    ) {
      return next(
        new AppError("Invalid access token.", 401, "INVALID_ACCESS_TOKEN")
      );
    }

    const payload = decoded as AccessTokenPayload;

    req.auth = {
      adminId: payload.sub,
      role: payload.role
    };

    next();
  } catch {
    next(
      new AppError(
        "Invalid or expired access token.",
        401,
        "INVALID_ACCESS_TOKEN"
      )
    );
  }
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHENTICATED")
    );
  }

  if (req.auth.role !== "super_admin") {
    return next(
      new AppError("Insufficient permissions.", 403, "FORBIDDEN")
    );
  }

  next();
};