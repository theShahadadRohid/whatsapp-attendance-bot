
import mongoose, { Schema } from "mongoose";
import type {
  CompanySchedule as CompanyScheduleType,
} from "./schedule.types";

const checkInRulesSchema = new Schema(
  {
    officeStartTime: {
      type: String,
      required: true,
      default: "09:30",
    },
    onTimeUntil: {
      type: String,
      required: true,
      default: "10:00",
    },
    yellowLateUntil: {
      type: String,
      required: true,
      default: "10:30",
    },
    redLateFrom: {
      type: String,
      required: true,
      default: "10:31",
    },
    lateReasonRequired: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: false },
);

const checkOutRulesSchema = new Schema(
  {
    earlyCheckoutBefore: {
      type: String,
      required: true,
      default: "18:30",
    },
    normalCheckoutUntil: {
      type: String,
      required: true,
      default: "19:00",
    },
    noteRequiredAfter: {
      type: String,
      required: true,
      default: "19:00",
    },
    latestCheckoutTime: {
      type: String,
      required: true,
      default: "23:59",
    },
    autoCheckoutEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    autoCheckoutTime: {
      type: String,
      required: true,
      default: "23:59",
    },
    flagAutoCheckoutForReview: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: false },
);

const absenceRulesSchema = new Schema(
  {
    autoMarkAbsent: {
      type: Boolean,
      required: true,
      default: true,
    },
    markAbsentAfter: {
      type: String,
      required: true,
      default: "23:59",
    },
  },
  { _id: false },
);

const companyScheduleSchema = new Schema<CompanyScheduleType>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "company",
      immutable: true,
    },
    timeZone: {
      type: String,
      required: true,
      default: "Asia/Dhaka",
    },
    workingDays: {
      type: [Number],
      required: true,
      default: [0, 1, 2, 3, 4],
      validate: {
        validator: (days: number[]) =>
          days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
          new Set(days).size === days.length,
        message: "Working days must be unique weekday numbers from 0 to 6.",
      },
    },
    checkIn: {
      type: checkInRulesSchema,
      required: true,
      default: () => ({}),
    },
    checkOut: {
      type: checkOutRulesSchema,
      required: true,
      default: () => ({}),
    },
    absence: {
      type: absenceRulesSchema,
      required: true,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "company_schedules",
  },
);

const companyHolidaySchema = new Schema(
  {
    date: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format."],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "company_holidays",
  },
);

export const CompanySchedule =
  (mongoose.models.CompanySchedule as mongoose.Model<CompanyScheduleType>) ||
  mongoose.model<CompanyScheduleType>("CompanySchedule", companyScheduleSchema);

export const CompanyHoliday =
  mongoose.models.CompanyHoliday ||
  mongoose.model("CompanyHoliday", companyHolidaySchema);
