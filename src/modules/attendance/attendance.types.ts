
import type { Types } from "mongoose";

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const CHECK_IN_STATUSES = [
  "on_time",
  "late_yellow",
  "late_red",
] as const;

export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number];

export const CHECK_OUT_STATUSES = [
  "early",
  "normal",
] as const;

export type CheckOutStatus = (typeof CHECK_OUT_STATUSES)[number];

export interface AttendanceRecord {
  employee: Types.ObjectId;
  date: string;
  timeZone: string;

  status: AttendanceStatus;

  checkInAt?: Date;
  checkInStatus?: CheckInStatus;
  checkInReason?: string;

  checkOutAt?: Date;
  checkOutStatus?: CheckOutStatus;
  checkOutNote?: string;

  isAutoCheckout: boolean;
  needsReview: boolean;
  reviewReason?: string;

  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
}
