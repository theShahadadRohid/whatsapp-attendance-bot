
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


// Employee changes their own password
export const changeEmployeePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),

    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128),

    confirmPassword: z.string().min(1).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ChangeEmployeePasswordInput = z.infer<
  typeof changeEmployeePasswordSchema
>;

// Employee requests a password reset
export const forgotEmployeePasswordSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Enter a valid international phone number.",
    ),
});

export type ForgotEmployeePasswordInput = z.infer<
  typeof forgotEmployeePasswordSchema
>;

// Admin sets a temporary password
export const adminResetEmployeePasswordSchema = z.object({
  temporaryPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters.")
    .max(128),
});

export type AdminResetEmployeePasswordInput = z.infer<
  typeof adminResetEmployeePasswordSchema
>;