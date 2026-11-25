
import { DateTime } from "luxon";
import { logger } from "../../common/logging/logger.js";
import { APP_TIME_ZONE } from "../../constants/app.constants.js";
import { CompanySchedule } from "../schedules/schedule.model.js";
import { processPendingAttendanceDates } from "./attendance.processor.js";

const RETRY_DELAY_MS = 5 * 60 * 1000;

type ProcessingReason = "startup_catch_up" | "scheduled" | "retry";

export async function startAttendanceScheduler(): Promise<
  () => Promise<void>
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isStopped = false;
  let activeProcessing: Promise<boolean> | undefined;

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
        await processPendingAttendanceDates(() => isStopped);

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

    if (activeProcessing) {
      await activeProcessing;
    }

    logger.info("Attendance scheduler stopped.");
  };
}
