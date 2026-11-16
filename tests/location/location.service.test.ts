
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  OFFICE_LATITUDE: 23.8103 as number | undefined,
  OFFICE_LONGITUDE: 90.4125 as number | undefined,
  OFFICE_LOCATION_RADIUS_METERS: 100,
}));

vi.mock("../../src/config/env", () => ({
  env: mockEnv,
}));

import { validateOfficeLocation } from "../../src/modules/locations/location.service";

describe("Office location validation", () => {
  beforeEach(() => {
    mockEnv.OFFICE_LATITUDE = 23.8103;
    mockEnv.OFFICE_LONGITUDE = 90.4125;
    mockEnv.OFFICE_LOCATION_RADIUS_METERS = 100;
  });

  it("accepts an employee at the office coordinates", () => {
    const result = validateOfficeLocation({
      latitude: 23.8103,
      longitude: 90.4125,
    });

    expect(result.distanceMeters).toBe(0);
  });

  it("accepts an employee within 100 metres", () => {
    // Approximately 50 metres east of the office.
    const result = validateOfficeLocation({
      latitude: 23.8103,
      longitude: 90.4125 + 0.0005,
    });

    expect(result.distanceMeters).toBeLessThan(100);
  });

  it("rejects an employee outside 100 metres", () => {
    // Approximately 150 metres east of the office.
    expect(() =>
      validateOfficeLocation({
        latitude: 23.8103,
        longitude: 90.4125 + 0.0015,
      }),
    ).toThrow("Sorry, you are not within the office location.");
  });

  it("rejects invalid coordinates", () => {
    expect(() =>
      validateOfficeLocation({
        latitude: 100,
        longitude: 90.4125,
      }),
    ).toThrow("Invalid location coordinates.");
  });

  it("rejects check-in when office coordinates are not configured", () => {
    mockEnv.OFFICE_LATITUDE = undefined;
    mockEnv.OFFICE_LONGITUDE = undefined;

    expect(() =>
      validateOfficeLocation({
        latitude: 23.8103,
        longitude: 90.4125,
      }),
    ).toThrow("Company office location has not been configured.");
  });
});
