import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../logging/logger.js";
import { appConfig } from "../../config/app.config.js";
import { AppError } from "./app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred.";
  let details: Array<{ path: string; message: string }> | undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed.";

    details = error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
  } else if (error instanceof SyntaxError && "body" in error) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "The request body contains invalid JSON.";
  }

  logger.error(
    {
      err: error,
      statusCode,
      code,
    },
    "Request failed",
  );

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    ...(appConfig.environment !== "production" && error instanceof Error
      ? { debugMessage: error.message }
      : {}),
  });
};
