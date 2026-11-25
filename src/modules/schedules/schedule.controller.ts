
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../modules/auth/auth.types.js";
import { AppError } from "../../common/errors/app-error.js";

import {
  getCompanySchedule,
  updateCompanySchedule,
  createHoliday,
  listHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
} from "./schedule.service.js";

// --------------------------------------------------
// COMPANY SCHEDULE
// --------------------------------------------------

export async function getScheduleHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schedule = await getCompanySchedule();

    res.status(200).json({
      message: "Company schedule retrieved successfully.",
      data: { schedule },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateScheduleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schedule = await updateCompanySchedule(req.body);

    res.status(200).json({
      message: "Company schedule updated successfully.",
      data: { schedule },
    });
  } catch (error) {
    next(error);
  }
}

// --------------------------------------------------
// COMPANY HOLIDAYS
// --------------------------------------------------

export async function createHolidayHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authenticatedRequest = req as AuthenticatedRequest;
    const auth = authenticatedRequest.auth;

    if (!auth || auth.accountType !== "admin") {
      throw new AppError(
        "Authentication required.",
        401,
        "UNAUTHORIZED",
      );
    }

    const adminId = auth.adminId;

    const holiday = await createHoliday(req.body, adminId);

    res.status(201).json({
      message: "Company holiday created successfully.",
      data: { holiday },
    });
  } catch (error) {
    next(error);
  }
}

export async function listHolidaysHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const holidays = await listHolidays();

    res.status(200).json({
      message: "Company holidays retrieved successfully.",
      data: { holidays },
    });
  } catch (error) {
    next(error);
  }
}

export async function getHolidayHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const holiday = await getHolidayById(String(req.params.id));

    res.status(200).json({
      message: "Company holiday retrieved successfully.",
      data: { holiday },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateHolidayHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const holiday = await updateHoliday(
      String(req.params.id),
      req.body,
    );

    res.status(200).json({
      message: "Company holiday updated successfully.",
      data: { holiday },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteHolidayHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteHoliday(String(req.params.id));

    res.status(200).json({
      message: "Company holiday deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}
