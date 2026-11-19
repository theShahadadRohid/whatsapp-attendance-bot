
import { Schema, model, type InferSchemaType } from "mongoose";
import { EMPLOYMENT_TYPES } from "./employee.types.js";

const locationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false },
);

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

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    whatsappBusinessScopedUserId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
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

    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },

    pendingAttendanceAction: {
      type: String,
      enum: ["check_in", "check_out"],
    },

    pendingAttendanceAt: Date,

    pendingAttendanceLocation: {
      type: locationSchema,
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
