import pino from "pino";
import { APP_NAME } from "../../constants/app.constants.js";
import { appConfig } from "../../config/app.config.js";

export const logger = pino({
  name: APP_NAME,
  level: appConfig.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "*.password",
      "accessToken",
      "refreshToken",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_APP_SECRET",
    ],
    censor: "[REDACTED]",
  },
});
