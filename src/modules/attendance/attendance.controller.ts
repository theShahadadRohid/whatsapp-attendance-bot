import type { Request, RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";

import {
  checkInEmployee,
  checkOutEmployee,
  checkInEmployeeFromOffice,
  checkOutEmployeeFromOffice,
  correctAttendance,
  getAttendanceDashboard,
  getAttendanceReviewQueue,
  getEmployeeAttendanceHistory,
  getEmployeeTodayAttendance,
  listAttendanceRecords,
  processDailyAttendance,
  reviewAttendance,
} from "./attendance.service.js";

import type {
  CheckInPayload,
  CheckOutPayload,
  CorrectAttendancePayload,
} from "./attendance.schema.js";

// --------------------------------------------------
// AUTH HELPERS
// --------------------------------------------------

function getAdminId(req: Request): string {
  const auth = (req as AuthenticatedRequest).auth;

  if (!auth || auth.accountType !== "admin") {
    throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
  }

  return auth.adminId;
}

function getEmployeeId(req: Request): string {
  const auth = (req as AuthenticatedRequest).auth;

  if (!auth || auth.accountType !== "employee") {
    throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
  }

  return auth.employeeId;
}

// --------------------------------------------------
// ADMIN ATTENDANCE
// --------------------------------------------------

export const checkIn: RequestHandler = async (req, res, next) => {
  try {
    const attendance = await checkInEmployee(
      String(req.params.employeeId),
      req.body as CheckInPayload,
    );

    res.status(201).json({
      message: "Employee checked in successfully.",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const checkOut: RequestHandler = async (req, res, next) => {
  try {
    const attendance = await checkOutEmployee(
      String(req.params.employeeId),
      req.body as CheckOutPayload,
    );

    res.status(200).json({
      message: "Employee checked out successfully.",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const processDaily: RequestHandler = async (req, res, next) => {
  try {
    const result = await processDailyAttendance(String(req.params.date));

    res.status(200).json({
      message: "Daily attendance processing completed.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewAutoCheckout: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const adminId = getAdminId(req);

    const attendance = await reviewAttendance(
      String(req.params.id),
      adminId,
    );

    res.status(200).json({
      message: "Attendance record reviewed successfully.",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const getDashboard: RequestHandler = async (req, res, next) => {
  try {
    const date =
      typeof req.query.date === "string" ? req.query.date : undefined;

    const dashboard = await getAttendanceDashboard(date);

    res.status(200).json({
      message: "Attendance dashboard retrieved successfully.",
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceList: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const result = await listAttendanceRecords({
      ...(typeof req.query.date === "string" && { date: req.query.date }),
      ...(typeof req.query.status === "string" && {
        status: req.query.status,
      }),
      ...(typeof req.query.page === "string" && { page: req.query.page }),
      ...(typeof req.query.limit === "string" && { limit: req.query.limit }),
      ...(typeof req.query.search === "string" && {
        search: req.query.search,
      }),
    });

    res.status(200).json({
      message: "Attendance records retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeHistory: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const result = await getEmployeeAttendanceHistory(
      String(req.params.employeeId),
      {
        ...(typeof req.query.from === "string" && { from: req.query.from }),
        ...(typeof req.query.to === "string" && { to: req.query.to }),
        ...(typeof req.query.page === "string" && { page: req.query.page }),
        ...(typeof req.query.limit === "string" && {
          limit: req.query.limit,
        }),
      },
    );

    res.status(200).json({
      message: "Employee attendance history retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getReviewQueue: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const result = await getAttendanceReviewQueue({
      ...(typeof req.query.date === "string" && { date: req.query.date }),
      ...(typeof req.query.page === "string" && { page: req.query.page }),
      ...(typeof req.query.limit === "string" && { limit: req.query.limit }),
    });

    res.status(200).json({
      message: "Attendance review queue retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const correctAttendanceRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const adminId = getAdminId(req);

    const attendance = await correctAttendance(
      String(req.params.id),
      adminId,
      req.body as CorrectAttendancePayload,
    );

    res.status(200).json({
      message: "Attendance record corrected successfully.",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// EMPLOYEE SELF-SERVICE ATTENDANCE
// --------------------------------------------------

export const employeeCheckIn: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = getEmployeeId(req);

    const attendance = await checkInEmployeeFromOffice(
      employeeId,
      req.body as CheckInPayload,
    );

    res.status(201).json({
      message: "Check-in successful.",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const employeeCheckOut: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = getEmployeeId(req);

    const attendance = await checkOutEmployeeFromOffice(
      employeeId,
      req.body as CheckOutPayload,
    );

    res.status(200).json({
      message: "Check-out successful.",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyTodayAttendance: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = getEmployeeId(req);

    const result = await getEmployeeTodayAttendance(employeeId);

    res.status(200).json({
      message: "Today's attendance retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyAttendanceHistory: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = getEmployeeId(req);

    const result = await getEmployeeAttendanceHistory(employeeId, {
      ...(typeof req.query.from === "string" && { from: req.query.from }),
      ...(typeof req.query.to === "string" && { to: req.query.to }),
      ...(typeof req.query.page === "string" && { page: req.query.page }),
      ...(typeof req.query.limit === "string" && {
        limit: req.query.limit,
      }),
    });

    res.status(200).json({
      message: "Your attendance history retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
