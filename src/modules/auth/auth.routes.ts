
import { Router } from "express";

import {
  employeeLogin,
  getCurrentAdmin,
  login,
} from "./auth.controller.js";

import {
  employeeLoginSchema,
  loginSchema,
} from "./auth.schema.js";

import { validateBody } from "../../common/middleware/validate.middleware.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";

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

export { authRouter };
