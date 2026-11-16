
import { beforeEach, describe, expect, it } from "vitest";
import { EmployeeModel } from "../../src/modules/employees/employee.model";
import { CompanySchedule, CompanyHoliday } from "../../src/modules/schedules/schedule.model";
import { Attendance } from "../../src/modules/attendance/attendance.model";
import { checkInEmployee } from "../../src/modules/attendance/attendance.service";

describe("Attendance check-in validation", () => {
  let employeeId: string;

  beforeEach(async () => {
    await CompanySchedule.create({ key: "company" });

    const employee = await EmployeeModel.create({
      employeeCode: "EMP001",
      fullName: "Test Employee",
      phoneNumber: "8801700000001",
      employmentType: "office",
    });

    employeeId = employee._id.toString();
  });

  it.each([
    { date: "2026-11-20", label: "Friday" },
    { date: "2026-11-21", label: "Saturday" },
  ])("rejects check-in on $label", async ({ date }) => {
    await expect(
      checkInEmployee(
        employeeId,
        {},
        new Date(`${date}T04:00:00.000Z`),
      ),
    ).rejects.toThrow();

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects check-in on a company holiday", async () => {
    await CompanyHoliday.create({
      date: "2026-11-16",
      name: "Company Holiday",
    });

    await expect(
      checkInEmployee(
        employeeId,
        {},
        new Date("2026-11-16T04:00:00.000Z"),
      ),
    ).rejects.toThrow();

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects duplicate check-in on the same day", async () => {
    const checkInTime = new Date("2026-11-16T04:00:00.000Z");

    await checkInEmployee(employeeId, {}, checkInTime);

    await expect(
      checkInEmployee(
        employeeId,
        {},
        new Date("2026-11-16T04:30:00.000Z"),
      ),
    ).rejects.toThrow();

    expect(await Attendance.countDocuments()).toBe(1);
  });
});
