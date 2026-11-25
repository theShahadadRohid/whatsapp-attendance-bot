
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) =>
    value.toLowerCase()
  ),
  password: z.string().min(1).max(128)
});

export type LoginInput = z.infer<typeof loginSchema>;

// Employee login
export const employeeLoginSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Enter a valid international phone number."
    ),
  password: z.string().min(1).max(128)
});

export type EmployeeLoginInput = z.infer<typeof employeeLoginSchema>;
