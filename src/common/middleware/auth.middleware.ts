
import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { EmployeeModel } from "../../modules/employees/employee.model.js";
import { AppError } from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { APP_NAME } from "../../constants/app.constants.js";
import {
  ADMIN_ROLES,
  type AdminRole
} from "../../modules/auth/admin.model.js";
import type { AuthenticatedRequest } from "../../modules/auth/auth.types.js";

interface AdminAccessTokenPayload extends JwtPayload {
  sub: string;
  accountType: "admin";
  role: AdminRole;
}

interface EmployeeAccessTokenPayload extends JwtPayload {
  sub: string;
  accountType: "employee";
  role: "employee";
  tokenVersion: number;
}

// Admin authentication
export const requireAuth: RequestHandler = (req, _res, next) => {
  const authenticatedReq = req as AuthenticatedRequest;
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
      decoded.accountType !== "admin" ||
      typeof decoded.role !== "string" ||
      !ADMIN_ROLES.includes(decoded.role as AdminRole)
    ) {
      return next(
        new AppError("Invalid access token.", 401, "INVALID_ACCESS_TOKEN")
      );
    }

    const payload = decoded as AdminAccessTokenPayload;

    authenticatedReq.auth = {
      accountType: "admin",
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

export const requireEmployeeAuth: RequestHandler = async (
  req,
  _res,
  next,
) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHENTICATED"),
    );
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHENTICATED"),
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: APP_NAME,
      audience: APP_NAME,
    });

    if (
      typeof decoded === "string" ||
      !decoded.sub ||
      decoded.accountType !== "employee" ||
      decoded.role !== "employee" ||
      !Number.isInteger(decoded.tokenVersion)
    ) {
      return next(
        new AppError("Invalid access token.", 401, "INVALID_ACCESS_TOKEN"),
      );
    }

    const payload = decoded as EmployeeAccessTokenPayload;

    const employee = await EmployeeModel.findById(payload.sub)
      .select("isActive tokenVersion")
      .lean();

    if (!employee || !employee.isActive) {
      return next(
        new AppError(
          "Employee account is unavailable.",
          401,
          "EMPLOYEE_UNAVAILABLE",
        ),
      );
    }

    if ((employee.tokenVersion ?? 0) !== payload.tokenVersion) {
      return next(
        new AppError(
          "Your session has expired. Please log in again.",
          401,
          "SESSION_INVALIDATED",
        ),
      );
    }

    authenticatedReq.auth = {
      accountType: "employee",
      employeeId: payload.sub,
      role: "employee",
    };

    next();
  } catch {
    next(
      new AppError(
        "Invalid or expired access token.",
        401,
        "INVALID_ACCESS_TOKEN",
      ),
    );
  }
};

// Super Admin authorization
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const user = authenticatedReq.auth;

  if (!user) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHENTICATED")
    );
  }

  if (user.role !== "super_admin") {
    return next(
      new AppError("Insufficient permissions.", 403, "FORBIDDEN")
    );
  }

  next();
};
