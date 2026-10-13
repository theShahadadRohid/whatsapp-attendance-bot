import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";

import { appConfig } from "./config/app.config.js";
import { isDatabaseConnected } from "./config/database.js";
import { APP_NAME, REQUEST_ID_HEADER } from "./constants/app.constants.js";
import {
  API_PREFIX,
  HEALTH_PATH,
  READINESS_PATH,
} from "./constants/api.constants.js";
import { AppError } from "./common/errors/app-error.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { logger } from "./common/logging/logger.js";
import { notFoundMiddleware } from "./common/middleware/not-found.middleware.js";

export const app = express();

app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incomingId = req.headers[REQUEST_ID_HEADER];

      const requestId =
        typeof incomingId === "string" && incomingId.length <= 128
          ? incomingId
          : randomUUID();

      res.setHeader(REQUEST_ID_HEADER, requestId);

      return requestId;
    },
  }),
);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || appConfig.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError(
          "Origin is not allowed by CORS.",
          403,
          "CORS_ORIGIN_NOT_ALLOWED",
        ),
      );
    },
  }),
);

app.use(express.json({ limit: "1mb" }));

const apiRateLimiter = rateLimit({
  windowMs: appConfig.apiRateLimit.windowMs,
  limit: appConfig.apiRateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(API_PREFIX, apiRateLimiter);

app.get(HEALTH_PATH, (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: APP_NAME,
  });
});

app.get(READINESS_PATH, (_req, res) => {
  const databaseConnected = isDatabaseConnected();

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ready" : "not_ready",
    service: APP_NAME,
    dependencies: {
      database: databaseConnected ? "connected" : "disconnected",
    },
  });
});

app.use(notFoundMiddleware);
app.use(errorHandler);
