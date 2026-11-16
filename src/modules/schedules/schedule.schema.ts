import { z } from "zod"

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must use HH:mm format.");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Please provide a valid calendar date.");

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone,
    });

    return true;
  } catch {
    return false;
  }
}

const checkInRulesSchema = z.object({
  officeStartTime: timeSchema.optional(),
  onTimeUntil: timeSchema.optional(),
  yellowLateUntil: timeSchema.optional(),
  redLateFrom: timeSchema.optional(),
  lateReasonRequired: z.boolean().optional(),
});

const checkOutRulesSchema = z.object({
  earlyCheckoutBefore: timeSchema.optional(),
  normalCheckoutUntil: timeSchema.optional(),
  noteRequiredAfter: timeSchema.optional(),
  latestCheckoutTime: timeSchema.optional(),
  autoCheckoutEnabled: z.boolean().optional(),
  autoCheckoutTime: timeSchema.optional(),
  flagAutoCheckoutForReview: z.boolean().optional(),
});

const absenceRulesSchema = z.object({
  autoMarkAbsent: z.boolean().optional(),
  markAbsentAfter: timeSchema.optional(),
});

export const updateCompanyScheduleSchema = z
  .object({
    timeZone: z
  .string()
  .trim()
  .min(1, "Timezone is required.")
  .max(100, "Timezone must not exceed 100 characters.")
  .refine(
    isValidTimeZone,
    "Please provide a valid IANA timezone (e.g. Asia/Dhaka).",
  )
  .optional(),

    workingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine(
        (days) => new Set(days).size === days.length,
        "Working days must not contain duplicates.",
      )
      .optional(),

    checkIn: checkInRulesSchema.optional(),
    checkOut: checkOutRulesSchema.optional(),
    absence: absenceRulesSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one schedule field must be provided.",
  });

export const createHolidaySchema = z.object({
  date: dateSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateHolidaySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one holiday field must be provided.",
  });

export const holidayIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid holiday ID."),
});

export const holidayDateSchema = z.object({
  date: dateSchema,
});

export type UpdateCompanySchedulePayload = z.infer<
  typeof updateCompanyScheduleSchema
>;

export type CreateHolidayPayload = z.infer<typeof createHolidaySchema>;

export type UpdateHolidayPayload = z.infer<typeof updateHolidaySchema>;
