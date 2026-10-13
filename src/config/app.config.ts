import { env } from "./env.js";

export const appConfig = Object.freeze({
  environment: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,

  corsOrigins: Object.freeze(
    env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),

  apiRateLimit: Object.freeze({
    maxRequests: env.API_RATE_LIMIT_MAX,
    windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  }),
});
