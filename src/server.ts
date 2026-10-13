import { appConfig } from "./config/app.config.js";
import { logger } from "./common/logging/logger.js";
import { APP_NAME } from "./constants/app.constants.js";
import { app } from "./app.js";

const server = app.listen(appConfig.port, () => {
  logger.info(
    {
      service: APP_NAME,
      port: appConfig.port,
      environment: appConfig.environment,
    },
    "Server started",
  );
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Server shutdown failed");
      process.exitCode = 1;
      return;
    }

    logger.info("HTTP server closed");
  });
}

server.on("error", (error: Error) => {
  logger.fatal({ err: error }, "HTTP server error");
  process.exitCode = 1;
});

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
