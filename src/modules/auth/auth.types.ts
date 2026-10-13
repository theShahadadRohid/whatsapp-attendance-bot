import type { Request } from "express";
import type { AdminRole } from "./admin.model.js";

export interface AuthenticatedUser {
  adminId: string;
  role: AdminRole;
}

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedUser;
};
