import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Application health", () => {
  it("returns a successful liveness response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "whatsapp-attendance-bot",
    });
  });

  it("returns a consistent 404 response for unknown routes", async () => {
    const response = await request(app).get("/this-route-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
