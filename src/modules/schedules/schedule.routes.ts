
import { Router, type RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error";
import { requireAuth } from "../../common/middleware/auth.middleware";
import type { AuthenticatedRequest } from "../../modules/auth/auth.types.js";
import { validateBody } from "../../common/middleware/validate.middleware";
import {
  createHolidaySchema,
  updateCompanyScheduleSchema,
  updateHolidaySchema,
} from "./schedule.schema";
import {
  getScheduleHandler,
  updateScheduleHandler,
  createHolidayHandler,
  listHolidaysHandler,
  getHolidayHandler,
  updateHolidayHandler,
  deleteHolidayHandler,
} from "./schedule.controller";

export const scheduleRouter = Router();

/**
 * Only authenticated managers and super admins
 * can manage company schedules and holidays.
 */
const requireScheduleManager: RequestHandler = (req, _res, next) => {
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
        "You do not have permission to manage schedules.",
        403,
        "FORBIDDEN",
      ),
    );
  }

  next();
};

scheduleRouter.use(requireAuth, requireScheduleManager);

// Company schedule
scheduleRouter.get("/", getScheduleHandler);

scheduleRouter.patch(
  "/",
  validateBody(updateCompanyScheduleSchema),
  updateScheduleHandler,
);

// Company holidays
scheduleRouter.get("/holidays", listHolidaysHandler);

scheduleRouter.post(
  "/holidays",
  validateBody(createHolidaySchema),
  createHolidayHandler,
);

scheduleRouter.get("/holidays/:id", getHolidayHandler);

scheduleRouter.patch(
  "/holidays/:id",
  validateBody(updateHolidaySchema),
  updateHolidayHandler,
);

scheduleRouter.delete("/holidays/:id", deleteHolidayHandler);
