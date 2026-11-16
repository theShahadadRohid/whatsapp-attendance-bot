
import { Router, type RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  checkIn,
  checkOut,
  getDashboard,
  getAttendanceList,
  processDaily,
  reviewAutoCheckout,
  getEmployeeHistory,
} from "./attendance.controller.js";
import {
  checkInSchema,
  checkOutSchema,
} from "./attendance.schema.js";

export const attendanceRouter = Router();

const requireAttendanceManager: RequestHandler = (
  req,
  _res,
  next,
) => {
  const authenticatedRequest = req as AuthenticatedRequest;
  const role = authenticatedRequest.auth?.role;

  if (!role) {
    return next(
      new AppError("Authentication required.", 401, "UNAUTHORIZED"),
    );
  }

  if (role !== "manager" && role !== "super_admin") {
    return next(
      new AppError(
        "You do not have permission to manage attendance.",
        403,
        "FORBIDDEN",
      ),
    );
  }

  next();
};

attendanceRouter.use(requireAuth, requireAttendanceManager);

// Dashboard
attendanceRouter.get("/dashboard", getDashboard);

// Attendance records
attendanceRouter.get("/records", getAttendanceList);

// Employee check-in/check-out
attendanceRouter.post(
  "/employees/:employeeId/check-in",
  validateBody(checkInSchema),
  checkIn,
);

attendanceRouter.post(
  "/employees/:employeeId/check-out",
  validateBody(checkOutSchema),
  checkOut,
);

// Daily processing
attendanceRouter.post("/process/:date", processDaily);

// Auto-checkout review
attendanceRouter.patch("/:id/review", reviewAutoCheckout);

attendanceRouter.get(
  "/employees/:employeeId/history",
  getEmployeeHistory,
);