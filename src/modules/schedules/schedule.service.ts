
import mongoose, { Types } from "mongoose";
import { AppError } from "../../common/errors/app-error";
import {
  CompanyHoliday,
  CompanySchedule,
} from "./schedule.model";
import type {
  CreateHolidayPayload,
  UpdateCompanySchedulePayload,
  UpdateHolidayPayload,
} from "./schedule.schema";

const COMPANY_SCHEDULE_KEY = "company";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function isValidObjectId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

/**
 * Returns the company-wide schedule.
 * Creates the default schedule if it does not exist.
 */
export async function getCompanySchedule() {
  const schedule = await CompanySchedule.findOneAndUpdate(
    { key: COMPANY_SCHEDULE_KEY },
    { $setOnInsert: { key: COMPANY_SCHEDULE_KEY } },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  return schedule;
}

/**
 * Updates the company-wide schedule.
 */
export async function updateCompanySchedule(
  input: UpdateCompanySchedulePayload,
) {
  const schedule = await getCompanySchedule();

  schedule.set(input);

  return schedule.save();
}

/**
 * Creates a company holiday.
 */
export async function createHoliday(
  input: CreateHolidayPayload,
  createdBy?: string,
) {
  try {
    const existingHoliday = await CompanyHoliday.findOne({
      date: input.date,
    });

    if (existingHoliday) {
      throw new AppError(
        "A holiday already exists for this date.",
        409,
        "HOLIDAY_ALREADY_EXISTS",
      );
    }

    const holidayData = {
      date: input.date,
      name: input.name,
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(createdBy && {
        createdBy: new Types.ObjectId(createdBy),
      }),
    };

    return await CompanyHoliday.create(holidayData);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "A holiday already exists for this date.",
        409,
        "HOLIDAY_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

/**
 * Returns all company holidays, ordered by date.
 */
export async function listHolidays() {
  return CompanyHoliday.find().sort({ date: 1 });
}

/**
 * Returns a single holiday by ID.
 */
export async function getHolidayById(id: string) {
  if (!isValidObjectId(id)) {
    throw new AppError("Invalid holiday ID.", 400, "INVALID_HOLIDAY_ID");
  }

  const holiday = await CompanyHoliday.findById(id);

  if (!holiday) {
    throw new AppError("Holiday not found.", 404, "HOLIDAY_NOT_FOUND");
  }

  return holiday;
}

/**
 * Updates a holiday.
 */
export async function updateHoliday(
  id: string,
  input: UpdateHolidayPayload,
) {
  const holiday = await getHolidayById(id);

  holiday.set(input);

  return holiday.save();
}

/**
 * Deletes a holiday.
 */
export async function deleteHoliday(id: string) {
  const holiday = await getHolidayById(id);

  await holiday.deleteOne();

  return holiday;
}
