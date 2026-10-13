
import { appConfig } from "./config/app.config.js";
import {
  connectToDatabase,
  disconnectFromDatabase
} from "./config/database.js";
import { logger } from "./common/logging/logger.js";
import { APP_NAME } from "./constants/app.constants.js";
import { app } from "./app.js";

async function startServer(): Promise<void> {
  await connectToDatabase();

  const server = app.listen(appConfig.port, () => {
    logger.info(
      {
        service: APP_NAME,
        port: appConfig.port,
        environment: appConfig.environment
      },
      "Server started"
    );
  });

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    logger.info({ signal }, "Graceful shutdown started");

    server.close((error) => {
      void (async () => {
        try {
          await disconnectFromDatabase();
        } catch (disconnectError) {
          logger.error(
            { err: disconnectError },
            "Failed to disconnect from MongoDB"
          );
          process.exitCode = 1;
        }

        if (error) {
          logger.error({ err: error }, "HTTP server shutdown failed");
          process.exitCode = 1;
        } else {
          logger.info("HTTP server closed");
        }
      })();
    });
  };

  server.on("error", (error: Error) => {
    logger.fatal({ err: error }, "HTTP server error");
    process.exitCode = 1;
  });

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch(async (error: unknown) => {
  logger.fatal({ err: error }, "Application startup failed");

  try {
    await disconnectFromDatabase();
  } catch (disconnectError) {
    logger.error(
      { err: disconnectError },
      "Failed to clean up MongoDB connection after startup failure"
    );
  }

  process.exitCode = 1;
});
