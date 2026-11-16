
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";

const EARTH_RADIUS_METERS = 6_371_000;

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculates the distance between two geographic coordinates
 * using the Haversine formula.
 */
function calculateDistanceMeters(
  origin: Coordinates,
  destination: Coordinates,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const latitudeDifference = toRadians(
    destination.latitude - origin.latitude,
  );

  const longitudeDifference = toRadians(
    destination.longitude - origin.longitude,
  );

  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  const centralAngle = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a),
  );

  return EARTH_RADIUS_METERS * centralAngle;
}

/**
 * Validates an employee's shared WhatsApp location
 * against the fixed company office location.
 */
export function validateOfficeLocation(
  employeeLocation: Coordinates,
): { distanceMeters: number } {
  const { OFFICE_LATITUDE, OFFICE_LONGITUDE, OFFICE_LOCATION_RADIUS_METERS } =
    env;

  if (
    OFFICE_LATITUDE === undefined ||
    OFFICE_LONGITUDE === undefined
  ) {
    throw new AppError(
      "Company office location has not been configured.",
      503,
      "OFFICE_LOCATION_NOT_CONFIGURED",
    );
  }

  const { latitude, longitude } = employeeLocation;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new AppError(
      "Invalid location coordinates.",
      400,
      "INVALID_LOCATION",
    );
  }

  const distanceMeters = calculateDistanceMeters(
    {
      latitude: OFFICE_LATITUDE,
      longitude: OFFICE_LONGITUDE,
    },
    employeeLocation,
  );

  if (distanceMeters > OFFICE_LOCATION_RADIUS_METERS) {
    throw new AppError(
      "Sorry, you are not within the office location.",
      403,
      "OUTSIDE_OFFICE_LOCATION",
    );
  }

  return {
    distanceMeters: Math.round(distanceMeters * 100) / 100,
  };
}
