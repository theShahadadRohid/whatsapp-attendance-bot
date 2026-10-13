import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app";

describe("GET /health", () => {
  it("returns a successful health response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "whatsapp-attendance-bot",
    });
  });
});
