
import { Router, type RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  checkIn,
  checkOut,
  processDaily,
  reviewAutoCheckout,
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

attendanceRouter.post("/process/:date", processDaily);

attendanceRouter.patch("/:id/review", reviewAutoCheckout);
