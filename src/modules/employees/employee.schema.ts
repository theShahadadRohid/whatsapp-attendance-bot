
import { z } from "zod";
import { EMPLOYMENT_TYPES } from "./employee.types.js";

const phoneNumberSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use international phone format, e.g. +8801XXXXXXXXX",
  );

const officialEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid official email address.")
  .max(254)
  .transform((value) => value.toLowerCase());

export const createEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((value) => value.toUpperCase()),

  fullName: z.string().trim().min(2).max(100),

  designation: z.string().trim().min(2).max(100),

  officialEmail: officialEmailSchema,

  phoneNumber: phoneNumberSchema,

  employmentType: z.enum(EMPLOYMENT_TYPES),

  department: z.string().trim().min(2).max(80).optional(),

  password: z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password cannot exceed 128 characters."),
});

export const updateEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),

    designation: z.string().trim().min(2).max(100).optional(),

    officialEmail: officialEmailSchema.optional(),

    phoneNumber: phoneNumberSchema.optional(),

    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),

    department: z.string().trim().min(2).max(80).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export const employeeIdSchema = z.string().regex(/^[a-f\d]{24}$/i, {
  message: "Invalid employee ID.",
});


export const createEmployeeAccountSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password cannot exceed 128 characters."),
});

export type CreateEmployeeAccountInput = z.infer<
  typeof createEmployeeAccountSchema
>;
