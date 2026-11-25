
import type { Request } from "express";
import type { AdminRole } from "./admin.model.js";

export interface AuthenticatedAdmin {
  accountType: "admin";
  adminId: string;
  role: AdminRole;
}

export interface AuthenticatedEmployee {
  accountType: "employee";
  employeeId: string;
  role: "employee";
}

export type AuthenticatedUser =
  | AuthenticatedAdmin
  | AuthenticatedEmployee;

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedUser;
};
