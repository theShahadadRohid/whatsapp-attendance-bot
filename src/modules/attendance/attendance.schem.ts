
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
