import { Types } from "mongoose";

export const WORKING_DAYS = [0, 1, 2, 3, 4] as const;

export type WorkingDay = (typeof WORKING_DAYS)[number];

export interface CheckInRules {
  officeStartTime: string;
  onTimeUntil: string;
  yellowLateUntil: string;
  redLateFrom: string;
  lateReasonRequired: boolean;
}

export interface CheckOutRules {
  earlyCheckoutBefore: string;
  normalCheckoutUntil: string;
  noteRequiredAfter: string;
  latestCheckoutTime: string;
  autoCheckoutEnabled: boolean;
  autoCheckoutTime: string;
  flagAutoCheckoutForReview: boolean;
}

export interface AbsenceRules {
  autoMarkAbsent: boolean;
  markAbsentAfter: string;
}

export interface CompanySchedule {
  key: "company";
  timeZone: string;
  workingDays: WorkingDay[];
  checkIn: CheckInRules;
  checkOut: CheckOutRules;
  absence: AbsenceRules;
}

export interface CreateHolidayInput {
  date: string;
  name: string;
  description?: string;
}

export interface UpdateHolidayInput {
  name?: string;
  description?: string | null;
}

export interface CompanyHoliday {
  date: string;
  name: string;
  description?: string;
  createdBy?: Types.ObjectId;
}