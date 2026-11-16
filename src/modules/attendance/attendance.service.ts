
import mongoose, { Types } from "mongoose";
import { AppError } from "../../common/errors/app-error";
import { APP_TIME_ZONE } from "../../constants/app.constants";
import { EmployeeModel } from "../employees/employee.model";
import {
  CompanyHoliday,
  CompanySchedule,
} from "../schedules/schedule.model";
import { Attendance } from "./attendance.model";
import type { CheckInPayload, CheckOutPayload } from "./attendance.schema";

function getLocalDateTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

/**
 * Converts a local date/time in a timezone into a UTC Date.
 * Uses Intl rather than requiring an additional timezone package.
 */
function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));

  const targetUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
  );

  let result = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getLocalDateTime(new Date(result), timeZone);

    const localYear = Number(local.date.slice(0, 4));
    const localMonth = Number(local.date.slice(5, 7));
    const localDay = Number(local.date.slice(8, 10));
    const localHour = Number(local.time.slice(0, 2));
    const localMinute = Number(local.time.slice(3, 5));

    const representedUtc = Date.UTC(
      localYear,
      localMonth - 1,
      localDay,
      localHour,
      localMinute,
      0,
    );

    result += targetUtc - representedUtc;
  }

  return new Date(result);
}

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

async function getActiveEmployee(employeeId: string) {
  if (!isValidObjectId(employeeId)) {
    throw new AppError(
      "Invalid employee ID.",
      400,
      "INVALID_EMPLOYEE_ID",
    );
  }

  const employee = await EmployeeModel.findOne({
    _id: employeeId,
    isActive: true,
  });

  if (!employee) {
    throw new AppError(
      "Active employee not found.",
      404,
      "EMPLOYEE_NOT_FOUND",
    );
  }

  return employee;
}

async function getCompanyRules() {
  const schedule = await CompanySchedule.findOne({ key: "company" });

  if (!schedule) {
    throw new AppError(
      "Company schedule has not been configured.",
      500,
      "COMPANY_SCHEDULE_NOT_FOUND",
    );
  }

  return schedule;
}

async function ensureWorkingDay(
  date: string,
  dayOfWeek: number,
  workingDays: number[],
) {
  if (!workingDays.includes(dayOfWeek)) {
    throw new AppError(
      "Attendance is not available on a weekly day off.",
      400,
      "NON_WORKING_DAY",
    );
  }

  const holiday = await CompanyHoliday.findOne({ date });

  if (holiday) {
    throw new AppError(
      "Attendance is not available on a company holiday.",
      400,
      "COMPANY_HOLIDAY",
    );
  }
}

/**
 * Employee check-in.
 */
export async function checkInEmployee(
  employeeId: string,
  input: CheckInPayload = {},
  now = new Date(),
) {
  const employee = await getActiveEmployee(employeeId);
  const schedule = await getCompanyRules();

  const timeZone = schedule.timeZone || APP_TIME_ZONE;
  const local = getLocalDateTime(now, timeZone);

  const weekday = new Date(`${local.date}T00:00:00.000Z`).getUTCDay();

  await ensureWorkingDay(
    local.date,
    weekday,
    schedule.workingDays,
  );

  const existingAttendance = await Attendance.findOne({
    employee: employee._id,
    date: local.date,
  });

  if (existingAttendance) {
    throw new AppError(
      "Attendance has already been recorded for today.",
      409,
      "ATTENDANCE_ALREADY_EXISTS",
    );
  }

  const checkInRules = schedule.checkIn;

  let checkInStatus: "on_time" | "late_yellow" | "late_red" =
    "on_time";

  let attendanceStatus: "present" | "late" = "present";

  if (local.time > checkInRules.onTimeUntil) {
    attendanceStatus = "late";

    checkInStatus =
      local.time <= checkInRules.yellowLateUntil
        ? "late_yellow"
        : "late_red";

    if (checkInRules.lateReasonRequired && !input.reason?.trim()) {
      throw new AppError(
        "A reason is required for late check-in.",
        400,
        "LATE_REASON_REQUIRED",
      );
    }
  }

  const attendanceData = {
    employee: employee._id,
    date: local.date,
    timeZone,
    status: attendanceStatus,
    checkInAt: now,
    checkInStatus,
    ...(input.reason?.trim() && {
      checkInReason: input.reason.trim(),
    }),
    isAutoCheckout: false,
    needsReview: false,
  };

  try {
    return await Attendance.create(attendanceData);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "Attendance has already been recorded for today.",
        409,
        "ATTENDANCE_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

/**
 * Employee checkout.
 */
export async function checkOutEmployee(
  employeeId: string,
  input: CheckOutPayload = {},
  now = new Date(),
) {
  const employee = await getActiveEmployee(employeeId);
  const schedule = await getCompanyRules();

  const timeZone = schedule.timeZone || APP_TIME_ZONE;
  const local = getLocalDateTime(now, timeZone);

  const attendance = await Attendance.findOne({
    employee: employee._id,
    date: local.date,
  });

  if (!attendance || !attendance.checkInAt) {
    throw new AppError(
      "No check-in record found for today.",
      404,
      "CHECK_IN_NOT_FOUND",
    );
  }

  if (attendance.checkOutAt) {
    throw new AppError(
      "You have already checked out.",
      409,
      "ALREADY_CHECKED_OUT",
    );
  }

  if (now.getTime() <= attendance.checkInAt.getTime()) {
    throw new AppError(
      "Checkout must be after check-in.",
      400,
      "INVALID_CHECKOUT_TIME",
    );
  }

  const rules = schedule.checkOut;

  if (local.time > rules.latestCheckoutTime) {
    throw new AppError(
      "The allowed checkout time has passed.",
      400,
      "CHECKOUT_WINDOW_CLOSED",
    );
  }

  if (local.time > rules.noteRequiredAfter && !input.note?.trim()) {
    throw new AppError(
      "A note is required for checkout after 7:00 PM.",
      400,
      "CHECKOUT_NOTE_REQUIRED",
    );
  }

  attendance.checkOutAt = now;

  attendance.checkOutStatus =
    local.time < rules.earlyCheckoutBefore ? "early" : "normal";

  if (input.note?.trim()) {
    attendance.checkOutNote = input.note.trim();
  }

  attendance.isAutoCheckout = false;

  return attendance.save();
}

/**
 * Processes attendance for one company-local calendar date.
 *
 * Call this after the configured absence cutoff.
 * Existing check-ins are automatically checked out first.
 * Employees without check-ins are marked absent.
 */
export async function processDailyAttendance(
  targetDate: string,
  processedAt = new Date(),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
    new Date(`${targetDate}T00:00:00.000Z`)
      .toISOString()
      .slice(0, 10) !== targetDate
  ) {
    throw new AppError(
      "Invalid attendance date.",
      400,
      "INVALID_ATTENDANCE_DATE",
    );
  }

  const schedule = await getCompanyRules();
  const timeZone = schedule.timeZone || APP_TIME_ZONE;

  const processedLocal = getLocalDateTime(processedAt, timeZone);

  if (
    `${processedLocal.date} ${processedLocal.time}` <=
    `${targetDate} ${schedule.absence.markAbsentAfter}`
  ) {
    throw new AppError(
      "Daily attendance cannot be processed before the absence cutoff.",
      400,
      "ATTENDANCE_CUTOFF_NOT_REACHED",
    );
  }

  const weekday = new Date(`${targetDate}T00:00:00.000Z`).getUTCDay();

  const workingDays: readonly number[] = schedule.workingDays;

if (!workingDays.includes(weekday)) {
    return {
      date: targetDate,
      skipped: true,
      reason: "NON_WORKING_DAY",
      autoCheckedOut: 0,
      markedAbsent: 0,
    };
  }

  const holiday = await CompanyHoliday.findOne({ date: targetDate });

  if (holiday) {
    return {
      date: targetDate,
      skipped: true,
      reason: "COMPANY_HOLIDAY",
      autoCheckedOut: 0,
      markedAbsent: 0,
    };
  }

  const employees = await EmployeeModel.find({ isActive: true }).select("_id");

  let autoCheckedOut = 0;
  let markedAbsent = 0;

  const autoCheckoutAt = localDateTimeToUtc(
    targetDate,
    schedule.checkOut.autoCheckoutTime,
    timeZone,
  );

  for (const employee of employees) {
    const existing = await Attendance.findOne({
      employee: employee._id,
      date: targetDate,
    });

    if (existing?.checkInAt && !existing.checkOutAt) {
      if (schedule.checkOut.autoCheckoutEnabled) {
        existing.checkOutAt = autoCheckoutAt;
        existing.checkOutStatus = "normal";
        existing.isAutoCheckout = true;
        existing.needsReview =
          schedule.checkOut.flagAutoCheckoutForReview;
        existing.reviewReason = "Automatically checked out at end of day.";

        await existing.save();
        autoCheckedOut += 1;
      }

      continue;
    }

    if (!existing && schedule.absence.autoMarkAbsent) {
      try {
        await Attendance.create({
          employee: employee._id,
          date: targetDate,
          timeZone,
          status: "absent",
          isAutoCheckout: false,
          needsReview: false,
        });

        markedAbsent += 1;
      } catch (error) {
        // Another process may have created the daily record concurrently.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }
  }

  return {
    date: targetDate,
    skipped: false,
    autoCheckedOut,
    markedAbsent,
  };
}

/**
 * Marks an automatically checked-out record as reviewed.
 */
export async function reviewAttendance(
  attendanceId: string,
  adminId: string,
) {
  if (!isValidObjectId(attendanceId) || !isValidObjectId(adminId)) {
    throw new AppError(
      "Invalid attendance or admin ID.",
      400,
      "INVALID_ID",
    );
  }

  const attendance = await Attendance.findById(attendanceId);

  if (!attendance) {
    throw new AppError(
      "Attendance record not found.",
      404,
      "ATTENDANCE_NOT_FOUND",
    );
  }

  if (!attendance.needsReview) {
    throw new AppError(
      "This attendance record does not require review.",
      400,
      "REVIEW_NOT_REQUIRED",
    );
  }

  attendance.needsReview = false;
  attendance.reviewedAt = new Date();
  attendance.reviewedBy = new Types.ObjectId(adminId);

  return attendance.save();
}
