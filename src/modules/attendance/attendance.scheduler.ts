import { DateTime } from "luxon";
import { logger } from "../../common/logging/logger.js";
import { APP_TIME_ZONE } from "../../constants/app.constants.js";
import { processDailyAttendance } from "./attendance.service.js";

export async function startAttendanceScheduler(): Promise<() => void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isStopped = false;
  let isRunning = false;

  const processPreviousDay = async (
    reason: "startup_catch_up" | "scheduled",
  ): Promise<void> => {
    if (isRunning) {
      logger.warn(
        { reason },
        "Attendance processing is already running. Skipping this execution.",
      );
      return;
    }

    isRunning = true;

    const targetDate = DateTime.now()
      .setZone(APP_TIME_ZONE)
      .minus({ days: 1 })
      .toFormat("yyyy-MM-dd");

    try {
      const result = await processDailyAttendance(targetDate, new Date());

      logger.info(
        { targetDate, reason, result },
        "Daily attendance processing completed.",
      );
    } catch (error) {
      logger.error(
        { err: error, targetDate, reason },
        "Daily attendance processing failed.",
      );
    } finally {
      isRunning = false;
    }
  };

  const scheduleNextRun = (): void => {
    if (isStopped) {
      return;
    }

    const now = DateTime.now().setZone(APP_TIME_ZONE);
    const nextRun = now.plus({ days: 1 }).startOf("day");
    const delay = Math.max(0, nextRun.toMillis() - now.toMillis());

    logger.info(
      { nextRun: nextRun.toISO(), timeZone: APP_TIME_ZONE },
      "Next attendance processing scheduled.",
    );

    timer = setTimeout(() => {
      void (async () => {
        await processPreviousDay("scheduled");
        scheduleNextRun();
      })();
    }, delay);
  };

  // Recover yesterday's attendance if the server was offline at midnight.
  await processPreviousDay("startup_catch_up");

  scheduleNextRun();

  logger.info(
    { timeZone: APP_TIME_ZONE },
    "Attendance scheduler started.",
  );

  return () => {
    isStopped = true;

    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    logger.info("Attendance scheduler stopped.");
  };
}
