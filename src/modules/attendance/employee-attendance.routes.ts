import { Router } from "express";
import { requireEmployeeAuth } from "../../common/middleware/auth.middleware.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";
import {
  employeeCheckIn,
  employeeCheckOut,
  getMyAttendanceHistory,
} from "./attendance.controller.js";
import {
  checkInSchema,
  checkOutSchema,
} from "./attendance.schema.js";

export const employeeAttendanceRouter = Router();

employeeAttendanceRouter.use(requireEmployeeAuth);

employeeAttendanceRouter.post(
  "/check-in",
  validateBody(checkInSchema),
  employeeCheckIn,
);

employeeAttendanceRouter.post(
  "/check-out",
  validateBody(checkOutSchema),
  employeeCheckOut,
);

employeeAttendanceRouter.get(
  "/history",
  getMyAttendanceHistory,
);