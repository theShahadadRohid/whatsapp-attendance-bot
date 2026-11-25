import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { logger } from "../../common/logging/logger.js";
import { APP_TIME_ZONE } from "../../constants/app.constants.js";
import { CompanySchedule } from "../schedules/schedule.model.js";
import { processDailyAttendance } from "./attendance.service.js";

const LOCK_DURATION_MS = 10 * 60 * 1000;

export async function processPendingAttendanceDates(
  shouldStop: () => boolean = () => false,
): Promise<void> {
  const now = new Date();
  const lockToken = randomUUID();

  // Atomically acquire the processing lock.
  const lockedSchedule = await CompanySchedule.findOneAndUpdate(
    {
      key: "company",
      $or: [
        { attendanceProcessingLockExpiresAt: { $exists: false } },
        { attendanceProcessingLockExpiresAt: null },
        { attendanceProcessingLockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        attendanceProcessingLockToken: lockToken,
        attendanceProcessingLockExpiresAt: new Date(
          now.getTime() + LOCK_DURATION_MS,
        ),
      },
    },
    { new: true },
  );

  if (!lockedSchedule) {
    const scheduleExists = await CompanySchedule.exists({
      key: "company",
    });

    if (!scheduleExists) {
      throw new Error("Company schedule has not been configured.");
    }

    logger.warn(
      "Attendance processing is already running. Skipping this execution.",
    );
    return;
  }

  try {
    const timeZone = lockedSchedule.timeZone || APP_TIME_ZONE;
    const currentDate = DateTime.now().setZone(timeZone);

    if (!currentDate.isValid) {
      throw new Error(`Invalid scheduler timezone: ${timeZone}`);
    }

    const yesterday = currentDate.minus({ days: 1 }).startOf("day");

    let nextDate: DateTime;

    if (!lockedSchedule.lastAttendanceProcessedDate) {
      // First deployment: process yesterday only.
      nextDate = yesterday;
    } else {
      const lastProcessed = DateTime.fromISO(
        lockedSchedule.lastAttendanceProcessedDate,
        { zone: timeZone },
      );

      if (
        !lastProcessed.isValid ||
        lastProcessed.toFormat("yyyy-MM-dd") !==
          lockedSchedule.lastAttendanceProcessedDate
      ) {
        throw new Error(
          `Invalid last processed attendance date: ${lockedSchedule.lastAttendanceProcessedDate}`,
        );
      }

      nextDate = lastProcessed.plus({ days: 1 }).startOf("day");
    }

    while (
      !shouldStop() &&
      nextDate.toMillis() <= yesterday.toMillis()
    ) {
      // Extend the lock before processing each date.
      const lockUpdate = await CompanySchedule.updateOne(
        {
          _id: lockedSchedule._id,
          attendanceProcessingLockToken: lockToken,
        },
        {
          $set: {
            attendanceProcessingLockExpiresAt: new Date(
              Date.now() + LOCK_DURATION_MS,
            ),
          },
        },
      );

      if (lockUpdate.matchedCount !== 1) {
        throw new Error("Lost attendance processing lock.");
      }

      const targetDate = nextDate.toFormat("yyyy-MM-dd");

      const result = await processDailyAttendance(targetDate, new Date());

      // Save progress only after successful processing and while owning the lock.
      const updateResult = await CompanySchedule.updateOne(
        {
          _id: lockedSchedule._id,
          attendanceProcessingLockToken: lockToken,
        },
        {
          $set: { lastAttendanceProcessedDate: targetDate },
        },
      );

      if (updateResult.matchedCount !== 1) {
        throw new Error(
          "Lost attendance processing lock while saving progress.",
        );
      }

      logger.info(
        { targetDate, timeZone, result },
        "Attendance date processed successfully.",
      );

      nextDate = nextDate.plus({ days: 1 });
    }
  } finally {
    // Release only the lock acquired by this execution.
    try {
      await CompanySchedule.updateOne(
        {
          _id: lockedSchedule._id,
          attendanceProcessingLockToken: lockToken,
        },
        {
          $unset: {
            attendanceProcessingLockToken: 1,
            attendanceProcessingLockExpiresAt: 1,
          },
        },
      );
    } catch (error) {
      logger.error(
        { err: error },
        "Could not release attendance processing lock. It will expire automatically.",
      );
    }
  }
}