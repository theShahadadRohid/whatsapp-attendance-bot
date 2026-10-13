
import { z } from "zod";
import { EMPLOYMENT_TYPES } from "./employee.types.js";

const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Use international phone format, e.g. +8801XXXXXXXXX");

export const createEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((value) => value.toUpperCase()),

  fullName: z.string().trim().min(2).max(100),

  phoneNumber: phoneNumberSchema,

  employmentType: z.enum(EMPLOYMENT_TYPES),

  department: z.string().trim().min(2).max(80).optional()
});

export const updateEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    phoneNumber: phoneNumberSchema.optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    department: z.string().trim().min(2).max(80).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update."
  });

export const employeeIdSchema = z.string().regex(/^[a-f\d]{24}$/i, {
  message: "Invalid employee ID."
});
