
import { z } from "zod";

export const employeeIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid employee ID.");

export const createWhatsAppEnrollmentSchema = z.object({
  employeeId: employeeIdSchema,
});
