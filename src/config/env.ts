
import "dotenv/config";
import { z } from "zod";
import { DEFAULT_PORT } from "../constants/app.constants.js";

const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? undefined
        : value,
    z.coerce.number().min(min).max(max).optional(),
  );

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    CORS_ORIGINS: z.string().default("http://localhost:5173"),

    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),

    JWT_SECRET: z.string().min(32),

    ALLOW_DATABASE_DISCONNECTED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    MONGODB_URI: optionalString,

    WHATSAPP_VERIFY_TOKEN: optionalString,
    WHATSAPP_ACCESS_TOKEN: optionalString,
    WHATSAPP_PHONE_NUMBER_ID: optionalString,
    WHATSAPP_APP_SECRET: optionalString,

    OFFICE_LATITUDE: optionalCoordinate(-90, 90),
    OFFICE_LONGITUDE: optionalCoordinate(-180, 180),
    OFFICE_LOCATION_RADIUS_METERS: z.coerce
      .number()
      .int()
      .positive()
      .max(10000)
      .default(100),
  })
  .superRefine((data, context) => {
    if (
      (data.OFFICE_LATITUDE === undefined) !==
      (data.OFFICE_LONGITUDE === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "OFFICE_LATITUDE and OFFICE_LONGITUDE must be provided together.",
        path: ["OFFICE_LATITUDE"],
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = result.data;
