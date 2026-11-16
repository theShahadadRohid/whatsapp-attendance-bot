
import { logger } from "../../src/common/logging/logger.js";
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  WHATSAPP_VERIFY_TOKEN: "test-verify-token" as string | undefined,
  WHATSAPP_APP_SECRET: "test-app-secret" as string | undefined,
}));

const mockServices = vi.hoisted(() => ({
  findEmployeeByWhatsAppNumber: vi.fn(),
  trackUnknownContact: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  env: mockEnv,
}));

vi.mock("../../src/common/logging/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/modules/employees/employee.service.js", () => ({
  findEmployeeByWhatsAppNumber:
    mockServices.findEmployeeByWhatsAppNumber,
}));

vi.mock("../../src/modules/unknown-contacts/unknown-contact.service.js", () => ({
  trackUnknownContact: mockServices.trackUnknownContact,
}));

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

function createIncomingMessageBody(): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  from: "8801712345678",
                  id: "wamid.test123",
                  timestamp: "1763300000",
                  type: "text",
                  text: {
                    body: "Check in",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("WhatsApp webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
    mockEnv.WHATSAPP_APP_SECRET = "test-app-secret";

    mockServices.findEmployeeByWhatsAppNumber.mockResolvedValue({
      status: "not_found",
    });

    mockServices.trackUnknownContact.mockResolvedValue({
      status: "tracked",
      attemptCount: 1,
    });
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

    it("returns 503 when the verification token is not configured", async () => {
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
    it("accepts a valid WhatsApp webhook signature", async () => {
      const rawBody = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [],
      });

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

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
      const rawBody = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [],
      });

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .send(rawBody);

      expect(response.status).toBe(401);
    });

    it("returns 503 when the app secret is not configured", async () => {
      mockEnv.WHATSAPP_APP_SECRET = undefined;

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .send('{"object":"whatsapp_business_account"}');

      expect(response.status).toBe(503);
    });

    it("rejects malformed JSON with a valid signature", async () => {
      const rawBody = '{"object":';

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(400);
    });

    it("rejects an invalid WhatsApp payload", async () => {
      const rawBody = JSON.stringify({
        object: "invalid_object",
      });

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(400);
    });

    it("parses incoming messages after verifying the signature", async () => {
      const rawBody = createIncomingMessageBody();

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(200);

      expect(logger.info).toHaveBeenCalledWith(
        { messageCount: 1 },
        "Verified WhatsApp webhook received.",
      );
    });

    it("tracks an unknown contact", async () => {
      const rawBody = createIncomingMessageBody();

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(200);

      expect(
        mockServices.findEmployeeByWhatsAppNumber,
      ).toHaveBeenCalledWith("8801712345678");

      expect(
        mockServices.trackUnknownContact,
      ).toHaveBeenCalledWith(
        "8801712345678",
        "wamid.test123",
      );
    });

    it("does not track an inactive employee as an unknown contact", async () => {
      mockServices.findEmployeeByWhatsAppNumber.mockResolvedValue({
        status: "inactive",
      });

      const rawBody = createIncomingMessageBody();

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(200);
      expect(mockServices.trackUnknownContact).not.toHaveBeenCalled();
    });

    it("does not track an active employee as an unknown contact", async () => {
      mockServices.findEmployeeByWhatsAppNumber.mockResolvedValue({
        status: "active",
        employee: {
          _id: {
            toString: () => "employee-id-123",
          },
          employeeCode: "EMP001",
        },
      });

      const rawBody = createIncomingMessageBody();

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(200);
      expect(mockServices.trackUnknownContact).not.toHaveBeenCalled();
    });

    it("acknowledges duplicate unknown-contact messages", async () => {
      mockServices.trackUnknownContact.mockResolvedValue({
        status: "duplicate",
      });

      const rawBody = createIncomingMessageBody();

      const response = await request(app)
        .post("/")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", createSignature(rawBody))
        .send(rawBody);

      expect(response.status).toBe(200);

      expect(
        mockServices.trackUnknownContact,
      ).toHaveBeenCalledOnce();
    });
  });
});
