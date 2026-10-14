import argon2 from "argon2";
import mongoose from "mongoose";

import { env } from "../src/config/env.js";
import { AdminModel } from "../src/modules/auth/admin.model.js";

async function seedAdmin() {
  try {
    const fullName = process.env.SEED_ADMIN_NAME?.trim();
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!fullName || !email || !password) {
      throw new Error(
        "Set SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD."
      );
    }

    if (password.length < 12) {
      throw new Error("Password must contain at least 12 characters.");
    }

    const mongoUri = env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is required to seed the admin.");
    }

    await mongoose.connect(mongoUri);

    if (await AdminModel.exists({})) {
      throw new Error("An admin already exists. Seeding cancelled.");
    }

    const passwordHash = await argon2.hash(password);

    const admin = await AdminModel.create({
      fullName,
      email,
      passwordHash,
      role: "super_admin",
      isActive: true,
    });

    console.log("Super-admin created successfully.");
    console.log("Admin ID:", admin.id);
    console.log("Email:", admin.email);
  } catch (error) {
    console.error(
      "Failed to seed admin:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

seedAdmin();