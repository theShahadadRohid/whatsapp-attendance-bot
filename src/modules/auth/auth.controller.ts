
import type { RequestHandler } from "express";

import { loginAdmin, loginEmployee } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";
import {
  changeEmployeePassword,
  requestEmployeePasswordReset,
  listPasswordResetRequests,
  adminResetEmployeePassword,
} from "./auth.service.js";
import { AppError } from "../../common/errors/app-error.js";
import { getEmployeeById } from "../employees/employee.service.js";

export const login: RequestHandler = async (req, res) => {
  const result = await loginAdmin(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const employeeLogin: RequestHandler = async (req, res) => {
  const result = await loginEmployee(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getCurrentAdmin: RequestHandler = (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const user = authenticatedReq.auth;

  if (!user) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      id: user.accountType === "admin" ? user.adminId : undefined,
      role: user.role,
    },
  });
};

// Current authenticated employee
export const getCurrentEmployee: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.auth;

    if (!user || user.accountType !== "employee") {
      throw new AppError(
        "Employee authentication required.",
        401,
        "UNAUTHENTICATED",
      );
    }

    const employee = await getEmployeeById(user.employeeId);

    if (!employee.isActive) {
      throw new AppError(
        "Your employee account is inactive.",
        403,
        "EMPLOYEE_INACTIVE",
      );
    }

    res.status(200).json({
      success: true,
      data: {
        id: employee._id.toString(),
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        designation: employee.designation,
        officialEmail: employee.officialEmail,
        phoneNumber: employee.phoneNumber,
        employmentType: employee.employmentType,
        department: employee.department,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Employee changes their password
export const changeEmployeePasswordController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.auth;

    if (!user || user.accountType !== "employee") {
      throw new AppError(
        "Employee authentication required.",
        401,
        "UNAUTHENTICATED",
      );
    }

    const result = await changeEmployeePassword(
      user.employeeId,
      req.body,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Employee submits a forgotten-password request
export const forgotEmployeePasswordController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const result = await requestEmployeePasswordReset(req.body);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Admin views pending reset requests
export const listPasswordResetRequestsController: RequestHandler = async (
  _req,
  res,
  next,
) => {
  try {
    const requests = await listPasswordResetRequests();

    res.status(200).json({
      success: true,
      data: {
        requests,
        total: requests.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin resets an employee password
export const adminResetEmployeePasswordController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.auth;

    if (!user || user.accountType !== "admin") {
      throw new AppError(
        "Admin authentication required.",
        401,
        "UNAUTHENTICATED",
      );
    }

    const result = await adminResetEmployeePassword(
      req.params.requestId as string,
      user.adminId,
      req.body.temporaryPassword,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};