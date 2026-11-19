
import mongoose, { Schema } from "mongoose";
import type { AttendanceRecord } from "./attendance.types";
import {
  ATTENDANCE_STATUSES,
  CHECK_IN_STATUSES,
  CHECK_OUT_STATUSES,
} from "./attendance.types";

const locationSchema = new Schema(
  {
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const attendanceSchema = new Schema<AttendanceRecord>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

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

    checkInAt: Date,

    checkInStatus: {
      type: String,
      enum: CHECK_IN_STATUSES,
    },

    checkInReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    checkInLocation: {
      type: locationSchema,
    },

    checkOutAt: Date,

    checkOutStatus: {
      type: String,
      enum: CHECK_OUT_STATUSES,
    },

    checkOutNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    checkOutLocation: {
      type: locationSchema,
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

    reviewedAt: Date,

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    correctionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    correctedAt: Date,

    correctedBy: {
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

attendanceSchema.index(
  { employee: 1, date: 1 },
  { unique: true },
);

attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ needsReview: 1, date: 1 });

export const Attendance =
  (mongoose.models.Attendance as
    | mongoose.Model<AttendanceRecord>
    | undefined) ||
  mongoose.model<AttendanceRecord>("Attendance", attendanceSchema);
