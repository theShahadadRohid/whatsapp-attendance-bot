
import { z } from "zod";

export const checkInSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const checkOutSchema = z.object({
  note: z.string().trim().min(1).max(500).optional(),
});

export const attendanceIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid attendance ID."),
});

export const employeeAttendanceIdSchema = z.object({
  employeeId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid employee ID."),
});

export type CheckInPayload = z.infer<typeof checkInSchema>;
export type CheckOutPayload = z.infer<typeof checkOutSchema>;


export const correctAttendanceSchema = z
  .object({
    checkInAt: z.string().datetime({ offset: true }).optional(),
    checkOutAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (data) =>
      data.checkInAt !== undefined ||
      data.checkOutAt !== undefined,
    {
      message: "At least one attendance time must be provided.",
    },
  )
  .refine(
    (data) =>
      !data.checkInAt ||
      !data.checkOutAt ||
      new Date(data.checkOutAt).getTime() >
        new Date(data.checkInAt).getTime(),
    {
      message: "Checkout must be after check-in.",
      path: ["checkOutAt"],
    },
  );

export type CorrectAttendancePayload = z.infer<
  typeof correctAttendanceSchema
>;
