import type { Request, Response } from "express";
import { connectToDatabase } from "../src/config/database";
import { app } from "../src/app";

let databaseConnection: Promise<boolean> | undefined;

async function ensureDatabaseConnection(): Promise<void> {
  if (!databaseConnection) {
    databaseConnection = connectToDatabase().catch((error: unknown) => {
      databaseConnection = undefined;
      throw error;
    });
  }

  await databaseConnection;
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureDatabaseConnection();
  app(req, res);
}
