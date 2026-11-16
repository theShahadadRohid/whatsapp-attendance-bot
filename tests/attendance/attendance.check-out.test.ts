
import { beforeEach, describe, expect, it } from "vitest";
import { EmployeeModel } from "../../src/modules/employees/employee.model";
import { CompanySchedule } from "../../src/modules/schedules/schedule.model";
import { Attendance } from "../../src/modules/attendance/attendance.model";
import {
  checkInEmployee,
  checkOutEmployee,
} from "../../src/modules/attendance/attendance.service";

describe("Attendance check-out", () => {
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

    // Check in at 10:00 AM Dhaka time.
    await checkInEmployee(
      employeeId,
      {},
      new Date("2026-11-16T04:00:00.000Z"),
    );
  });

  it("marks checkout before 6:30 PM as early", async () => {
    const attendance = await checkOutEmployee(
      employeeId,
      {},
      new Date("2026-11-16T12:29:00.000Z"),
    );

    expect(attendance.checkOutStatus).toBe("early");
    expect(attendance.checkOutAt?.toISOString()).toBe(
      "2026-11-16T12:29:00.000Z",
    );
  });

  it("marks checkout at 6:30 PM as normal", async () => {
    const attendance = await checkOutEmployee(
      employeeId,
      {},
      new Date("2026-11-16T12:30:00.000Z"),
    );

    expect(attendance.checkOutStatus).toBe("normal");
  });

  it("does not require a note at exactly 7:00 PM", async () => {
    const attendance = await checkOutEmployee(
      employeeId,
      {},
      new Date("2026-11-16T13:00:00.000Z"),
    );

    expect(attendance.checkOutStatus).toBe("normal");
    expect(attendance.checkOutNote).toBeUndefined();
  });

  it("requires a note after 7:00 PM", async () => {
    await expect(
      checkOutEmployee(
        employeeId,
        {},
        new Date("2026-11-16T13:01:00.000Z"),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "CHECKOUT_NOTE_REQUIRED",
    });

    const attendance = await Attendance.findOne({ employee: employeeId });

    expect(attendance?.checkOutAt).toBeUndefined();
  });

  it("accepts checkout after 7:00 PM when a note is provided", async () => {
    const attendance = await checkOutEmployee(
      employeeId,
      { note: "Working overtime" },
      new Date("2026-11-16T13:01:00.000Z"),
    );

    expect(attendance.checkOutNote).toBe("Working overtime");
    expect(attendance.checkOutStatus).toBe("normal");
  });

  it("accepts checkout at exactly 11:59 PM", async () => {
    const attendance = await checkOutEmployee(
      employeeId,
      { note: "Finishing late work" },
      new Date("2026-11-16T17:59:00.000Z"),
    );

    expect(attendance.checkOutAt?.toISOString()).toBe(
      "2026-11-16T17:59:00.000Z",
    );
    expect(attendance.checkOutStatus).toBe("normal");
  });

  it("rejects checkout before check-in", async () => {
    await expect(
      checkOutEmployee(
        employeeId,
        {},
        new Date("2026-11-16T03:59:00.000Z"),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_CHECKOUT_TIME",
    });
  });

  it("rejects a second checkout", async () => {
    await checkOutEmployee(
      employeeId,
      {},
      new Date("2026-11-16T12:30:00.000Z"),
    );

    await expect(
      checkOutEmployee(
        employeeId,
        {},
        new Date("2026-11-16T13:00:00.000Z"),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "ALREADY_CHECKED_OUT",
    });
  });

  it("rejects checkout when no check-in record exists", async () => {
    await Attendance.deleteMany({ employee: employeeId });

    await expect(
      checkOutEmployee(
        employeeId,
        {},
        new Date("2026-11-16T12:30:00.000Z"),
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CHECK_IN_NOT_FOUND",
    });
  });
});
