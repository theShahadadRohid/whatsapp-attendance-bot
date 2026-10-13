import type { AdminRole } from "./admin.model.js";

export interface AuthenticatedUser {
  adminId: string;
  role: AdminRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};