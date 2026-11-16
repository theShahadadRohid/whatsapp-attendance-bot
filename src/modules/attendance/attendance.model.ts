
import mongoose, { Schema } from "mongoose";
import type { AttendanceRecord } from "./attendance.types";
import {
  ATTENDANCE_STATUSES,
  CHECK_IN_STATUSES,
  CHECK_OUT_STATUSES,
} from "./attendance.types";

const attendanceSchema = new Schema<AttendanceRecord>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    // Bangladesh-local calendar date, formatted as YYYY-MM-DD.
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    timeZone: {
      type: String,
      required: true,
      default: "Asia/Dhaka",
    },

    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true,
    },

    checkInAt: {
      type: Date,
    },

    checkInStatus: {
      type: String,
      enum: CHECK_IN_STATUSES,
    },

    checkInReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    checkOutAt: {
      type: Date,
    },

    checkOutStatus: {
      type: String,
      enum: CHECK_OUT_STATUSES,
    },

    checkOutNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    isAutoCheckout: {
      type: Boolean,
      required: true,
      default: false,
    },

    needsReview: {
      type: Boolean,
      required: true,
      default: false,
    },

    reviewReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    reviewedAt: {
      type: Date,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "attendance_records",
  },
);

// One attendance record per employee per local calendar day.
attendanceSchema.index(
  { employee: 1, date: 1 },
  { unique: true },
);

// Useful for manager dashboard date/status filters.
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ needsReview: 1, date: 1 });

export const Attendance =
  (mongoose.models.Attendance as
    | mongoose.Model<AttendanceRecord>
    | undefined) ||
  mongoose.model<AttendanceRecord>("Attendance", attendanceSchema);
