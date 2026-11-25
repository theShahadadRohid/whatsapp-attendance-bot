
import { Schema, model, type InferSchemaType } from "mongoose";
import { EMPLOYMENT_TYPES } from "./employee.types.js";

const employeeSchema = new Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    designation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    officialEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      select: false,
      default: undefined
    },

    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      required: true,
    },

    department: {
      type: String,
      trim: true,
      maxlength: 80,
      default: undefined,
    },

    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "employees",
  },
);

employeeSchema.index({ isActive: 1, fullName: 1 });

export type Employee = InferSchemaType<typeof employeeSchema>;

export const EmployeeModel = model("Employee", employeeSchema);
