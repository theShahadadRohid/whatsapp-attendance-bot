
import { Router } from "express";

import {
  employeeLogin,
  getCurrentAdmin,
  getCurrentEmployee,
  login,
} from "./auth.controller.js";

import {
  employeeLoginSchema,
  loginSchema,
} from "./auth.schema.js";

import {
  requireAuth,
  requireEmployeeAuth,
} from "../../common/middleware/auth.middleware.js";

import { validateBody } from "../../common/middleware/validate.middleware.js";

const authRouter = Router();

// Admin authentication
authRouter.post("/login", validateBody(loginSchema), login);
authRouter.get("/me", requireAuth, getCurrentAdmin);

// Employee authentication
authRouter.post(
  "/employee/login",
  validateBody(employeeLoginSchema),
  employeeLogin,
);

authRouter.get(
  "/employee/me",
  requireEmployeeAuth,
  getCurrentEmployee,
);

export { authRouter };
