
import mongoose from "mongoose";

import { env } from "./env.js";
import { logger } from "../common/logging/logger.js";

let connectionListenersRegistered = false;

function registerConnectionListeners(): void {
  if (connectionListenersRegistered) {
    return;
  }

  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("MongoDB reconnected");
  });

  mongoose.connection.on("error", (error: Error) => {
    logger.error({ err: error }, "MongoDB connection error");
  });

  connectionListenersRegistered = true;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectToDatabase(): Promise<boolean> {
  registerConnectionListeners();

  const uri = env.MONGODB_URI;

  if (!uri) {
    if (
      env.NODE_ENV !== "production" &&
      env.ALLOW_DATABASE_DISCONNECTED
    ) {
      logger.warn("Starting without MongoDB: no MONGODB_URI configured");
      return false;
    }

    throw new Error("MONGODB_URI is required to start the application.");
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      bufferCommands: false
    });

    logger.info("MongoDB connection established");
    return true;
  } catch (error) {
    if (
      env.NODE_ENV !== "production" &&
      env.ALLOW_DATABASE_DISCONNECTED
    ) {
      logger.warn(
        { err: error },
        "MongoDB connection failed; continuing in development mode"
      );

      return false;
    }

    throw error;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger.info("MongoDB connection closed");
}
