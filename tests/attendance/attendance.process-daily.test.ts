
import { beforeEach, describe, expect, it } from "vitest";
import { EmployeeModel } from "../../src/modules/employees/employee.model";
import { Attendance } from "../../src/modules/attendance/attendance.model";
import { CompanyHoliday, CompanySchedule } from "../../src/modules/schedules/schedule.model";
import {
  checkInEmployee,
  checkOutEmployee,
  processDailyAttendance,
} from "../../src/modules/attendance/attendance.service";

const TARGET_DATE = "2026-11-16";
const AFTER_CUTOFF = new Date("2026-11-16T18:01:00.000Z");

async function createEmployee(employeeCode: string) {
  return EmployeeModel.create({
    employeeCode,
    fullName: `Employee ${employeeCode}`,
    phoneNumber: `+880170000${employeeCode.slice(-4)}`,
    employmentType: "office",
  });
}

describe("Daily attendance processing", () => {
  beforeEach(async () => {
    await CompanySchedule.create({});
  });

  it("automatically checks out employees who checked in but did not check out", async () => {
    const employee = await createEmployee("EMP1001");

    await checkInEmployee(
  employee.id,
  {},
  new Date("2026-11-16T04:00:00.000Z"),
);

    const result = await processDailyAttendance(TARGET_DATE, AFTER_CUTOFF);

    const record = await Attendance.findOne({
      employee: employee._id,
      date: TARGET_DATE,
    });

    expect(result.autoCheckedOut).toBe(1);
    expect(record).not.toBeNull();
    expect(record?.checkOutAt?.toISOString()).toBe(
      "2026-11-16T17:59:00.000Z",
    );
    expect(record?.checkOutStatus).toBe("normal");
    expect(record?.isAutoCheckout).toBe(true);
    expect(record?.needsReview).toBe(true);
    expect(record?.reviewReason).toBe(
      "Automatically checked out at end of day.",
    );
  });

  it("marks employees absent when they never checked in", async () => {
    const employee = await createEmployee("EMP1002");

    const result = await processDailyAttendance(TARGET_DATE, AFTER_CUTOFF);

    const record = await Attendance.findOne({
      employee: employee._id,
      date: TARGET_DATE,
    });

    expect(result.markedAbsent).toBe(1);
    expect(record?.status).toBe("absent");
    expect(record?.checkInAt).toBeUndefined();
    expect(record?.checkOutAt).toBeUndefined();
    expect(record?.needsReview).toBe(false);
  });

  it("does not modify employees who already checked out", async () => {
    const employee = await createEmployee("EMP1003");

    await checkInEmployee(
  employee.id,
  {},
  new Date("2026-11-16T04:00:00.000Z"),
);

await checkOutEmployee(
  employee.id,
  {},
  new Date("2026-11-16T12:30:00.000Z"),
);

    const original = await Attendance.findOne({
      employee: employee._id,
      date: TARGET_DATE,
    });

    const originalCheckout = original?.checkOutAt?.getTime();

    const result = await processDailyAttendance(TARGET_DATE, AFTER_CUTOFF);

    const updated = await Attendance.findOne({
      employee: employee._id,
      date: TARGET_DATE,
    });

    expect(result.autoCheckedOut).toBe(0);
    expect(updated?.checkOutAt?.getTime()).toBe(originalCheckout);
    expect(updated?.isAutoCheckout).toBe(false);
  });

  it("does not process attendance on company holidays", async () => {
    const employee = await createEmployee("EMP1004");

    await CompanyHoliday.create({
      date: TARGET_DATE,
      name: "Company Holiday",
    });

    const result = await processDailyAttendance(TARGET_DATE, AFTER_CUTOFF);

    const record = await Attendance.findOne({
      employee: employee._id,
      date: TARGET_DATE,
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("COMPANY_HOLIDAY");
    expect(record).toBeNull();
  });

  it("does not process attendance on non-working days", async () => {
    const employee = await createEmployee("EMP1005");
    const friday = "2026-11-20";

    const result = await processDailyAttendance(
      friday,
      new Date("2026-11-20T18:01:00.000Z"),
    );

    const record = await Attendance.findOne({
      employee: employee._id,
      date: friday,
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("NON_WORKING_DAY");
    expect(record).toBeNull();
  });

  it("is idempotent when processing the same date more than once", async () => {
    const employee = await createEmployee("EMP1006");

    await processDailyAttendance(TARGET_DATE, AFTER_CUTOFF);
    const secondResult = await processDailyAttendance(
      TARGET_DATE,
      AFTER_CUTOFF,
    );

    const records = await Attendance.find({
      employee: employee._id,
      date: TARGET_DATE,
    });

    expect(secondResult.autoCheckedOut).toBe(0);
    expect(secondResult.markedAbsent).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("absent");
  });

  it("rejects processing before the absence cutoff", async () => {
    await expect(
      processDailyAttendance(
        TARGET_DATE,
        new Date("2026-11-16T17:59:00.000Z"),
      ),
    ).rejects.toMatchObject({
      code: "ATTENDANCE_CUTOFF_NOT_REACHED",
    });
  });
});
