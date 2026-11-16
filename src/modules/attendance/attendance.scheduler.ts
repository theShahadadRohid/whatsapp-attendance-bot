
import { DateTime } from "luxon";
import { logger } from "../../common/logging/logger.js";
import { APP_TIME_ZONE } from "../../constants/app.constants.js";
import { CompanySchedule } from "../schedules/schedule.model.js";
import { processDailyAttendance } from "./attendance.service.js";

const RETRY_DELAY_MS = 5 * 60 * 1000;

type ProcessingReason = "startup_catch_up" | "scheduled" | "retry";

export async function startAttendanceScheduler(): Promise<
  () => Promise<void>
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isStopped = false;
  let isRunning = false;
  let activeProcessing: Promise<boolean> | undefined;

  /**
   * Processes every unprocessed date up to yesterday.
   *
   * The first run initializes the progress marker by processing
   * yesterday only. Later runs recover all missed dates.
   */
  const processPendingDates = async (): Promise<void> => {
    const schedule = await CompanySchedule.findOne({ key: "company" });

    if (!schedule) {
      throw new Error("Company schedule has not been configured.");
    }

    const timeZone = schedule.timeZone || APP_TIME_ZONE;
    const now = DateTime.now().setZone(timeZone);

    if (!now.isValid) {
      throw new Error(`Invalid scheduler timezone: ${timeZone}`);
    }

    const yesterday = now.minus({ days: 1 }).startOf("day");

    let nextDate: DateTime;

    if (!schedule.lastAttendanceProcessedDate) {
      // First deployment: avoid processing the entire historical database.
      nextDate = yesterday;
    } else {
      const lastProcessed = DateTime.fromISO(
        schedule.lastAttendanceProcessedDate,
        { zone: timeZone },
      );

      if (
        !lastProcessed.isValid ||
        lastProcessed.toFormat("yyyy-MM-dd") !==
          schedule.lastAttendanceProcessedDate
      ) {
        throw new Error(
          `Invalid last processed attendance date: ${schedule.lastAttendanceProcessedDate}`,
        );
      }

      nextDate = lastProcessed.plus({ days: 1 }).startOf("day");
    }

    while (
      !isStopped &&
      nextDate.toMillis() <= yesterday.toMillis()
    ) {
      const targetDate = nextDate.toFormat("yyyy-MM-dd");

      // The service treats holidays and weekly days off as successful skips.
      const result = await processDailyAttendance(targetDate, new Date());

      // Persist progress only after processing the date succeeds.
      const updateResult = await CompanySchedule.updateOne(
        { _id: schedule._id },
        { $set: { lastAttendanceProcessedDate: targetDate } },
      );

      if (updateResult.matchedCount !== 1) {
        throw new Error(
          "Could not save the last processed attendance date.",
        );
      }

      logger.info(
        { targetDate, timeZone, result },
        "Attendance date processed successfully.",
      );

      nextDate = nextDate.plus({ days: 1 });
    }
  };

  /**
   * Runs the recovery process with single-instance protection.
   */
const runProcessing = (
  reason: ProcessingReason,
): Promise<boolean> => {
  if (isStopped) {
    return Promise.resolve(false);
  }

  if (activeProcessing) {
    logger.warn(
      { reason },
      "Attendance processing is already running.",
    );
    return Promise.resolve(false);
  }

  const currentRun = (async (): Promise<boolean> => {
    try {
      await processPendingDates();

      logger.info(
        { reason },
        "Attendance recovery process completed.",
      );

      return true;
    } catch (error) {
      logger.error(
        { err: error, reason },
        "Attendance processing failed.",
      );

      return false;
    }
  })();

  activeProcessing = currentRun;

  void currentRun.finally(() => {
    if (activeProcessing === currentRun) {
      activeProcessing = undefined;
    }
  });

  return currentRun;
};

  /**
   * Retries failed processing after a controlled delay.
   */
  const scheduleRetry = (): void => {
    if (isStopped) {
      return;
    }

    logger.warn(
      { retryAfterMs: RETRY_DELAY_MS },
      "Attendance processing will be retried.",
    );

    timer = setTimeout(() => {
      void (async () => {
        const succeeded = await runProcessing("retry");

        if (succeeded) {
          await scheduleNextRun();
        } else {
          scheduleRetry();
        }
      })();
    }, RETRY_DELAY_MS);
  };

  /**
   * Schedules the next run at midnight in the company's timezone.
   */
  const scheduleNextRun = async (): Promise<void> => {
    if (isStopped) {
      return;
    }

    try {
      const schedule = await CompanySchedule.findOne({ key: "company" });
      const timeZone = schedule?.timeZone || APP_TIME_ZONE;

      const now = DateTime.now().setZone(timeZone);

      if (!now.isValid) {
        throw new Error(`Invalid scheduler timezone: ${timeZone}`);
      }

      const nextRun = now.plus({ days: 1 }).startOf("day");
      const delay = Math.max(0, nextRun.toMillis() - now.toMillis());

      logger.info(
        { nextRun: nextRun.toISO(), timeZone },
        "Next attendance processing scheduled.",
      );

      timer = setTimeout(() => {
        void (async () => {
          const succeeded = await runProcessing("scheduled");

          if (succeeded) {
            await scheduleNextRun();
          } else {
            scheduleRetry();
          }
        })();
      }, delay);
    } catch (error) {
      logger.error(
        { err: error },
        "Could not schedule the next attendance processing run.",
      );

      scheduleRetry();
    }
  };

  // Recover missed dates when the server starts.
  const succeeded = await runProcessing("startup_catch_up");

  if (succeeded) {
    await scheduleNextRun();
  } else {
    scheduleRetry();
  }

  logger.info("Attendance scheduler started.");

return async () => {
  isStopped = true;

  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }

  // Allow the currently processing date to finish and save progress.
  if (activeProcessing) {
    await activeProcessing;
  }

  logger.info("Attendance scheduler stopped.");
};
}
