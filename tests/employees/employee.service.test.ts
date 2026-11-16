import { describe, it, expect } from "vitest";
import { EmployeeModel } from "../../src/modules/employees/employee.model.js";
import { findEmployeeByWhatsAppNumber } from "../../src/modules/employees/employee.service.js";

async function createTestEmployee(input: {
  phoneNumber: string;
  isActive?: boolean;
}) {
  return EmployeeModel.create({
    employeeCode: "EMP001",
    fullName: "Test Employee",
    phoneNumber: input.phoneNumber,
    employmentType: "office",
    isActive: input.isActive ?? true,
  });
}

describe("WhatsApp employee identification", () => {
  it("finds an employee stored with a local number", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
    });

    const result = await findEmployeeByWhatsAppNumber(
      "8801712345678",
    );

    expect(result.status).toBe("active");

    if (result.status === "active") {
      expect(result.employee.fullName).toBe("Test Employee");
      expect(result.employee.phoneNumber).toBe("01712345678");
    }
  });

  it("finds an employee stored with an international number", async () => {
    await createTestEmployee({
      phoneNumber: "8801712345678",
    });

    const result = await findEmployeeByWhatsAppNumber(
      "+8801712345678",
    );

    expect(result.status).toBe("active");

    if (result.status === "active") {
      expect(result.employee.phoneNumber).toBe("8801712345678");
    }
  });

  it("returns inactive for a deactivated employee", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      isActive: false,
    });

    const result = await findEmployeeByWhatsAppNumber(
      "8801712345678",
    );

    expect(result.status).toBe("inactive");
  });

  it("returns not_found for an unregistered number", async () => {
    const result = await findEmployeeByWhatsAppNumber(
      "8801999999999",
    );

    expect(result.status).toBe("not_found");
  });

  it("returns not_found for an empty or invalid number", async () => {
    const result = await findEmployeeByWhatsAppNumber("");

    expect(result.status).toBe("not_found");
  });
});
