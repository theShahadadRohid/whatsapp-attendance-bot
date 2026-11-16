
import { beforeEach, describe, expect, it } from "vitest";
import { EmployeeModel } from "../../src/modules/employees/employee.model";
import { CompanySchedule } from "../../src/modules/schedules/schedule.model";
import { Attendance } from "../../src/modules/attendance/attendance.model";
import { checkInEmployee } from "../../src/modules/attendance/attendance.service";

describe("Attendance check-in", () => {
  let employeeId: string;

  beforeEach(async () => {
    await CompanySchedule.create({
      key: "company",
    });

    const employee = await EmployeeModel.create({
      employeeCode: "EMP001",
      fullName: "Test Employee",
      phoneNumber: "8801700000001",
      employmentType: "office",
    });

    employeeId = employee._id.toString();
  });

  it.each([
    {
      time: "03:30",
      expectedAttendance: "present",
      expectedCheckIn: "on_time",
      description: "09:30 AM",
    },
    {
      time: "04:00",
      expectedAttendance: "present",
      expectedCheckIn: "on_time",
      description: "10:00 AM",
    },
    {
      time: "04:01",
      expectedAttendance: "late",
      expectedCheckIn: "late_yellow",
      description: "10:01 AM",
    },
    {
      time: "04:30",
      expectedAttendance: "late",
      expectedCheckIn: "late_yellow",
      description: "10:30 AM",
    },
    {
      time: "04:31",
      expectedAttendance: "late",
      expectedCheckIn: "late_red",
      description: "10:31 AM",
    },
  ])(
    "classifies check-in correctly at $description",
    async ({ time, expectedAttendance, expectedCheckIn }) => {
      const now = new Date(`2026-11-16T${time}:00.000Z`);

      const attendance = await checkInEmployee(
        employeeId,
        { reason: "Traffic" },
        now,
      );

      expect(attendance.status).toBe(expectedAttendance);
      expect(attendance.checkInStatus).toBe(expectedCheckIn);
      expect(attendance.checkInAt?.toISOString()).toBe(
        now.toISOString(),
      );
    },
  );

  it("does not require a reason for on-time check-in", async () => {
    const attendance = await checkInEmployee(
      employeeId,
      {},
      new Date("2026-11-16T04:00:00.000Z"),
    );

    expect(attendance.status).toBe("present");
    expect(attendance.checkInStatus).toBe("on_time");
    expect(attendance.checkInReason).toBeUndefined();
  });

  it("rejects late check-in without a reason", async () => {
    await expect(
      checkInEmployee(
        employeeId,
        {},
        new Date("2026-11-16T04:01:00.000Z"),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "LATE_REASON_REQUIRED",
    });

    expect(await Attendance.countDocuments()).toBe(0);
  });
});
