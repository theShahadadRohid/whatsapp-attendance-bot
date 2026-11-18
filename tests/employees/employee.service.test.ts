
import { describe, it, expect } from "vitest";
import { EmployeeModel } from "../../src/modules/employees/employee.model.js";
import {
  findEmployeeByWhatsAppNumber,
  findEmployeeByWhatsAppIdentity,
} from "../../src/modules/employees/employee.service.js";

async function createTestEmployee(input: {
  phoneNumber: string;
  isActive?: boolean;
  bsuid?: string;
  employeeCode?: string;
}) {
  return EmployeeModel.create({
    employeeCode: input.employeeCode ?? "EMP001",
    fullName: "Test Employee",
    phoneNumber: input.phoneNumber,
    ...(input.bsuid
      ? { whatsappBusinessScopedUserId: input.bsuid }
      : {}),
    employmentType: "office",
    isActive: input.isActive ?? true,
  });
}

describe("WhatsApp employee identification", () => {
  // Existing phone-number lookup tests

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

  // New BSUID identity lookup tests

  it("finds an employee using BSUID only", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    const result = await findEmployeeByWhatsAppIdentity({
      bsuid: "BSUID_EMPLOYEE_001",
    });

    expect(result.status).toBe("active");

    if (result.status === "active") {
      expect(result.employee.fullName).toBe("Test Employee");
      expect(result.employee.whatsappBusinessScopedUserId).toBe(
        "BSUID_EMPLOYEE_001",
      );
    }
  });

  it("finds an employee using phone number only", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
    });

    const result = await findEmployeeByWhatsAppIdentity({
      phoneNumber: "8801712345678",
    });

    expect(result.status).toBe("active");

    if (result.status === "active") {
      expect(result.employee.phoneNumber).toBe("01712345678");
    }
  });

  it("finds an employee when both BSUID and phone number match", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    const result = await findEmployeeByWhatsAppIdentity({
      phoneNumber: "8801712345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    expect(result.status).toBe("active");

    if (result.status === "active") {
      expect(result.employee.fullName).toBe("Test Employee");
    }
  });

  it("returns identity_mismatch when BSUID and phone number belong to different employees", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    await createTestEmployee({
      employeeCode: "EMP002",
      phoneNumber: "01812345678",
    });

    const result = await findEmployeeByWhatsAppIdentity({
      phoneNumber: "01812345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    expect(result.status).toBe("identity_mismatch");
  });

  it("returns inactive employee when BSUID belongs to a deactivated employee", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      bsuid: "BSUID_INACTIVE_001",
      isActive: false,
    });

    const result = await findEmployeeByWhatsAppIdentity({
      bsuid: "BSUID_INACTIVE_001",
    });

    expect(result.status).toBe("inactive");

    if (result.status === "inactive") {
      expect(result.employee.fullName).toBe("Test Employee");
      expect(result.employee.isActive).toBe(false);
    }
  });



it("automatically links an unknown BSUID when the registered phone matches", async () => {
  const employee = await createTestEmployee({
    phoneNumber: "01712345678",
  });

  const result = await findEmployeeByWhatsAppIdentity({
    phoneNumber: "8801712345678",
    bsuid: "UNKNOWN_BSUID",
  });

  expect(result.status).toBe("active");

  const updatedEmployee = await EmployeeModel.findById(
    employee._id,
  ).lean();

  expect(updatedEmployee?.whatsappBusinessScopedUserId).toBe(
    "UNKNOWN_BSUID",
  );
});

it("returns not_found when BSUID is unknown and phone number is unavailable", async () => {
  const result = await findEmployeeByWhatsAppIdentity({
    bsuid: "UNKNOWN_BSUID",
  });

  expect(result.status).toBe("not_found");
});


  it("does not overwrite an employee's existing BSUID", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      bsuid: "BSUID_OLD_001",
    });

    const result = await findEmployeeByWhatsAppIdentity({
      phoneNumber: "01712345678",
      bsuid: "BSUID_NEW_001",
    });

    expect(result.status).toBe("identity_mismatch");

    const employee = await EmployeeModel.findOne({
      phoneNumber: "01712345678",
    }).lean();

    expect(employee?.whatsappBusinessScopedUserId).toBe(
      "BSUID_OLD_001",
    );
  });

  it("does not link a BSUID that belongs to another employee", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    await createTestEmployee({
      employeeCode: "EMP002",
      phoneNumber: "01812345678",
    });

    const result = await findEmployeeByWhatsAppIdentity({
      phoneNumber: "01812345678",
      bsuid: "BSUID_EMPLOYEE_001",
    });

    expect(result.status).toBe("identity_mismatch");

    const secondEmployee = await EmployeeModel.findOne({
      employeeCode: "EMP002",
    }).lean();

    expect(
      secondEmployee?.whatsappBusinessScopedUserId,
    ).toBeUndefined();
  });

  it("safely handles concurrent attempts to link the same BSUID", async () => {
    await createTestEmployee({
      employeeCode: "EMP001",
      phoneNumber: "01712345678",
    });

    await createTestEmployee({
      employeeCode: "EMP002",
      phoneNumber: "01812345678",
    });

    const results = await Promise.all([
      findEmployeeByWhatsAppIdentity({
        phoneNumber: "01712345678",
        bsuid: "BSUID_CONCURRENT_001",
      }),
      findEmployeeByWhatsAppIdentity({
        phoneNumber: "01812345678",
        bsuid: "BSUID_CONCURRENT_001",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "active"),
    ).toHaveLength(1);

    expect(
      results.filter(
        (result) => result.status === "identity_mismatch",
      ),
    ).toHaveLength(1);

    const linkedEmployees = await EmployeeModel.find({
      whatsappBusinessScopedUserId: "BSUID_CONCURRENT_001",
    }).lean();

    expect(linkedEmployees).toHaveLength(1);
  });

  it("does not automatically link a BSUID to an inactive employee", async () => {
    await createTestEmployee({
      phoneNumber: "01712345678",
      isActive: false,
    });

    const result = await findEmployeeByWhatsAppIdentity({
      phoneNumber: "01712345678",
      bsuid: "BSUID_INACTIVE_NEW",
    });

    expect(result.status).toBe("inactive");

    const employee = await EmployeeModel.findOne({
      phoneNumber: "01712345678",
    }).lean();

    expect(employee?.whatsappBusinessScopedUserId).toBeUndefined();
  });

});
