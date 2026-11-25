
export const EMPLOYMENT_TYPES = ["office", "remote"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export interface CreateEmployeeInput {
  employeeCode: string;
  fullName: string;
  designation: string;
  officialEmail: string;
  phoneNumber: string;
  employmentType: EmploymentType;
  department?: string;
}

export interface UpdateEmployeeInput {
  fullName?: string;
  designation?: string;
  officialEmail?: string;
  phoneNumber?: string;
  employmentType?: EmploymentType;
  department?: string | null;
}
