
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  WHATSAPP_VERIFY_TOKEN: "test-verify-token" as string | undefined,
  WHATSAPP_APP_SECRET: "test-app-secret" as string | undefined,
}));

const mockServices = vi.hoisted(() => ({
  employee: {
    _id: { toString: () => "employee-id-123" },
    fullName: "Test Employee",
    employeeCode: "EMP001",
    isActive: true,
    pendingAttendanceAction: undefined as
      | "check_in"
      | "check_out"
      | undefined,
    pendingAttendanceLocation: undefined as
      | { latitude: number; longitude: number }
      | undefined,
  },
  lookupStatus: "active" as "active" | "inactive" | "not_found",
  findEmployeeByWhatsAppNumber: vi.fn(),
  updateEmployee: vi.fn(),
  validateOfficeLocation: vi.fn(),
  checkInEmployee: vi.fn(),
  checkOutEmployee: vi.fn(),
  sendWhatsAppTextMessage: vi.fn(),
  claimWhatsAppMessage: vi.fn(),
  markWhatsAppMessageProcessed: vi.fn(),
  markWhatsAppMessageFailed: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  env: mockEnv,
}));

vi.mock("../../src/common/logging/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/modules/employees/employee.service.js", () => ({
  findEmployeeByWhatsAppNumber:
    mockServices.findEmployeeByWhatsAppNumber,
}));

vi.mock("../../src/modules/employees/employee.model.js", () => ({
  EmployeeModel: {
    updateOne: mockServices.updateEmployee,
  },
}));

vi.mock("../../src/modules/locations/location.service.js", () => ({
  validateOfficeLocation: mockServices.validateOfficeLocation,
}));

vi.mock("../../src/modules/attendance/attendance.service.js", () => ({
  checkInEmployee: mockServices.checkInEmployee,
  checkOutEmployee: mockServices.checkOutEmployee,
}));

vi.mock("../../src/modules/integrations/whatsapp/whatsapp.client.js", () => ({
  sendWhatsAppTextMessage: mockServices.sendWhatsAppTextMessage,
}));

vi.mock(
  "../../src/modules/integrations/whatsapp/whatsapp-message.service.js",
  () => ({
    claimWhatsAppMessage: mockServices.claimWhatsAppMessage,
    markWhatsAppMessageProcessed:
      mockServices.markWhatsAppMessageProcessed,
    markWhatsAppMessageFailed:
      mockServices.markWhatsAppMessageFailed,
  }),
);

import { AppError } from "../../src/common/errors/app-error.js";
import { whatsappWebhookRouter } from "../../src/modules/integrations/whatsapp/whatsapp.webhook.js";

const app = express();
app.use("/", whatsappWebhookRouter);

function createSignature(body: string): string {
  return `sha256=${createHmac(
    "sha256",
    mockEnv.WHATSAPP_APP_SECRET!,
  )
    .update(body)
    .digest("hex")}`;
}

function createMessageBody(
  message: Record<string, unknown>,
): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [message],
            },
          },
        ],
      },
    ],
  });
}

function createTextMessage(
  text: string,
  id = "wamid.test123",
): string {
  return createMessageBody({
    from: "8801712345678",
    id,
    timestamp: "1763300000",
    type: "text",
    text: { body: text },
  });
}

function createLocationMessage(
  id = "wamid.location123",
  latitude = 23.8103,
  longitude = 90.4125,
): string {
  return createMessageBody({
    from: "8801712345678",
    id,
    timestamp: "1763300000",
    type: "location",
    location: {
      latitude,
      longitude,
    },
  });
}

async function postWebhook(rawBody: string) {
  return request(app)
    .post("/")
    .set("Content-Type", "application/json")
    .set("X-Hub-Signature-256", createSignature(rawBody))
    .send(rawBody);
}

describe("WhatsApp webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
    mockEnv.WHATSAPP_APP_SECRET = "test-app-secret";

    mockServices.employee.isActive = true;
    mockServices.employee.pendingAttendanceAction = undefined;
    mockServices.employee.pendingAttendanceLocation = undefined;
    mockServices.lookupStatus = "active";

    mockServices.findEmployeeByWhatsAppNumber.mockImplementation(
      async () => ({
        status: mockServices.lookupStatus,
        ...(mockServices.lookupStatus !== "not_found"
          ? { employee: mockServices.employee }
          : {}),
      }),
    );

    mockServices.updateEmployee.mockImplementation(
      async (_filter, update) => {
        if (update.$set) {
          Object.assign(mockServices.employee, update.$set);
        }

        if (update.$unset) {
          for (const key of Object.keys(update.$unset)) {
            delete (mockServices.employee as Record<string, unknown>)[key];
          }
        }

        return { acknowledged: true };
      },
    );

    mockServices.validateOfficeLocation.mockReturnValue({
      distanceMeters: 25,
    });

    mockServices.claimWhatsAppMessage.mockResolvedValue({
      status: "claimed",
      leaseToken: "test-lease-token",
      attemptCount: 1,
    });

    mockServices.markWhatsAppMessageProcessed.mockResolvedValue(true);
    mockServices.markWhatsAppMessageFailed.mockResolvedValue(true);

    mockServices.checkInEmployee.mockResolvedValue({
      timeZone: "Asia/Dhaka",
      checkInAt: new Date("2026-11-18T09:00:00+06:00"),
      status: "present",
    });

    mockServices.checkOutEmployee.mockResolvedValue({
      timeZone: "Asia/Dhaka",
      checkOutAt: new Date("2026-11-18T18:00:00+06:00"),
      checkOutStatus: "normal",
    });

    mockServices.sendWhatsAppTextMessage.mockResolvedValue(undefined);
  });

  describe("GET verification", () => {
    it("returns the challenge when the verification token matches", async () => {
      const response = await request(app)
        .get("/")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "test-verify-token",
          "hub.challenge": "test-challenge",
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe("test-challenge");
    });

    it("rejects an incorrect verification token", async () => {
      const response = await request(app)
        .get("/")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong-token",
          "hub.challenge": "test-challenge",
        });

      expect(response.status).toBe(403);
    });

    it("returns 503 when the verification token is missing", async () => {
      mockEnv.WHATSAPP_VERIFY_TOKEN = undefined;

      const response = await request(app)
        .get("/")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "test-verify-token",
          "hub.challenge": "test-challenge",
        });

      expect(response.status).toBe(503);
    });
  });

  describe("POST notifications", () => {
    it("accepts a valid webhook signature", async () => {
      const rawBody = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [],
      });

      const response = await postWebhook(rawBody);

      expect(response.status).toBe(200);
    });

    it("rejects an invalid signature", async () => {
      const rawBody = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [],
      });

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", `sha256=${"0".repeat(64)}`)
        .send(rawBody);

      expect(response.status).toBe(401);
    });

    it("rejects a missing signature", async () => {
      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .send('{"object":"whatsapp_business_account","entry":[]}');

      expect(response.status).toBe(401);
    });

    it("returns 503 when the app secret is missing", async () => {
      mockEnv.WHATSAPP_APP_SECRET = undefined;

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .send('{"object":"whatsapp_business_account"}');

      expect(response.status).toBe(503);
    });

    it("rejects malformed JSON", async () => {
      const rawBody = '{"object":';

      const response = await postWebhook(rawBody);

      expect(response.status).toBe(400);
    });

    it("rejects an invalid WhatsApp payload", async () => {
      const rawBody = JSON.stringify({ object: "invalid_object" });

      const response = await postWebhook(rawBody);

      expect(response.status).toBe(400);
    });
  });

  describe("employee messages", () => {
    it("asks for location after IN without recording attendance", async () => {
      const response = await postWebhook(createTextMessage("IN"));

      expect(response.status).toBe(200);

      expect(mockServices.updateEmployee).toHaveBeenCalledWith(
        { _id: "employee-id-123" },
        expect.objectContaining({
          $set: expect.objectContaining({
            pendingAttendanceAction: "check_in",
          }),
        }),
      );

      expect(mockServices.checkInEmployee).not.toHaveBeenCalled();
      expect(mockServices.checkOutEmployee).not.toHaveBeenCalled();

      expect(mockServices.sendWhatsAppTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "8801712345678",
          body: expect.stringContaining("share your current WhatsApp location"),
        }),
      );
    });

    it("records check-in after receiving a valid location", async () => {
      await postWebhook(createTextMessage("IN"));

      const response = await postWebhook(
        createLocationMessage(),
      );

      expect(response.status).toBe(200);

      expect(mockServices.validateOfficeLocation).toHaveBeenCalledWith({
        latitude: 23.8103,
        longitude: 90.4125,
      });

      expect(mockServices.checkInEmployee).toHaveBeenCalledWith(
        "employee-id-123",
        {
          location: {
            latitude: 23.8103,
            longitude: 90.4125,
          },
        },
      );

      expect(mockServices.updateEmployee).toHaveBeenCalledWith(
        { _id: "employee-id-123" },
        {
          $unset: {
            pendingAttendanceAction: 1,
            pendingAttendanceAt: 1,
            pendingAttendanceLocation: 1,
          },
        },
      );
    });

    it("asks for a reason when check-in is late", async () => {
      mockServices.checkInEmployee
        .mockRejectedValueOnce(
          new AppError(
            "A reason is required for late check-in.",
            400,
            "LATE_REASON_REQUIRED",
          ),
        )
        .mockResolvedValueOnce({
          timeZone: "Asia/Dhaka",
          checkInAt: new Date("2026-11-18T10:30:00+06:00"),
          status: "late",
        });

      await postWebhook(createTextMessage("IN"));

      const locationResponse = await postWebhook(
        createLocationMessage(),
      );

      expect(locationResponse.status).toBe(200);

      expect(mockServices.employee.pendingAttendanceLocation).toEqual({
        latitude: 23.8103,
        longitude: 90.4125,
      });

      expect(mockServices.checkInEmployee).toHaveBeenCalledOnce();

      const reasonResponse = await postWebhook(
        createTextMessage("Traffic jam", "wamid.reason123"),
      );

      expect(reasonResponse.status).toBe(200);

      expect(mockServices.checkInEmployee).toHaveBeenLastCalledWith(
        "employee-id-123",
        {
          location: {
            latitude: 23.8103,
            longitude: 90.4125,
          },
          reason: "Traffic jam",
        },
      );
    });

    it("asks for location after OUT without recording checkout", async () => {
      const response = await postWebhook(createTextMessage("OUT"));

      expect(response.status).toBe(200);

      expect(mockServices.checkOutEmployee).not.toHaveBeenCalled();

      expect(mockServices.employee.pendingAttendanceAction).toBe(
        "check_out",
      );
    });

    it("records checkout after receiving a valid location", async () => {
      await postWebhook(createTextMessage("OUT"));

      const response = await postWebhook(
        createLocationMessage(),
      );

      expect(response.status).toBe(200);

      expect(mockServices.checkOutEmployee).toHaveBeenCalledWith(
        "employee-id-123",
        {
          location: {
            latitude: 23.8103,
            longitude: 90.4125,
          },
        },
      );
    });

    it("asks for a note when checkout requires one", async () => {
      mockServices.checkOutEmployee
        .mockRejectedValueOnce(
          new AppError(
            "A note is required for late checkout.",
            400,
            "CHECKOUT_NOTE_REQUIRED",
          ),
        )
        .mockResolvedValueOnce({
          timeZone: "Asia/Dhaka",
          checkOutAt: new Date("2026-11-18T20:00:00+06:00"),
          checkOutStatus: "normal",
        });

      await postWebhook(createTextMessage("OUT"));

      await postWebhook(createLocationMessage());

      expect(mockServices.employee.pendingAttendanceLocation).toEqual({
        latitude: 23.8103,
        longitude: 90.4125,
      });

      await postWebhook(
        createTextMessage("Personal work", "wamid.note123"),
      );

      expect(mockServices.checkOutEmployee).toHaveBeenLastCalledWith(
        "employee-id-123",
        {
          location: {
            latitude: 23.8103,
            longitude: 90.4125,
          },
          note: "Personal work",
        },
      );
    });

    it("rejects a location outside the office radius", async () => {
      mockServices.validateOfficeLocation.mockImplementation(() => {
        throw new AppError(
          "You are outside the permitted office location.",
          400,
          "OUTSIDE_OFFICE_RADIUS",
        );
      });

      await postWebhook(createTextMessage("IN"));

      const response = await postWebhook(
        createLocationMessage(),
      );

      expect(response.status).toBe(200);

      expect(mockServices.checkInEmployee).not.toHaveBeenCalled();
      expect(mockServices.checkOutEmployee).not.toHaveBeenCalled();
    });

    it("rejects an unknown WhatsApp number", async () => {
      mockServices.lookupStatus = "not_found";

      const response = await postWebhook(
        createTextMessage("IN"),
      );

      expect(response.status).toBe(200);

      expect(mockServices.checkInEmployee).not.toHaveBeenCalled();
      expect(mockServices.checkOutEmployee).not.toHaveBeenCalled();

      expect(mockServices.sendWhatsAppTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("not registered"),
        }),
      );
    });

    it("rejects an inactive employee", async () => {
      mockServices.lookupStatus = "inactive";
      mockServices.employee.isActive = false;

      const response = await postWebhook(
        createTextMessage("IN"),
      );

      expect(response.status).toBe(200);

      expect(mockServices.checkInEmployee).not.toHaveBeenCalled();
      expect(mockServices.checkOutEmployee).not.toHaveBeenCalled();
    });

    it("responds to HELP", async () => {
      const response = await postWebhook(
        createTextMessage("HELP"),
      );

      expect(response.status).toBe(200);

      expect(mockServices.checkInEmployee).not.toHaveBeenCalled();
      expect(mockServices.checkOutEmployee).not.toHaveBeenCalled();

      expect(mockServices.sendWhatsAppTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("Send IN to check in."),
        }),
      );
    });

    it("ignores duplicate messages", async () => {
      mockServices.claimWhatsAppMessage.mockResolvedValue({
        status: "duplicate",
      });

      const response = await postWebhook(
        createTextMessage("IN"),
      );

      expect(response.status).toBe(200);

      expect(mockServices.updateEmployee).not.toHaveBeenCalled();
      expect(mockServices.checkInEmployee).not.toHaveBeenCalled();
      expect(mockServices.sendWhatsAppTextMessage).not.toHaveBeenCalled();
    });

    it("marks unexpected processing errors as failed", async () => {
      const processingError = new Error("Database unavailable");

      mockServices.updateEmployee.mockRejectedValueOnce(processingError);

      const response = await postWebhook(
        createTextMessage("IN"),
      );

      expect(response.status).toBe(500);

      expect(mockServices.markWhatsAppMessageFailed).toHaveBeenCalledWith(
        "wamid.test123",
        "test-lease-token",
        processingError,
      );
    });
  });
});
