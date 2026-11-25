import { Router } from "express";

import {
  employeeLogin,
  getCurrentAdmin,
  getCurrentEmployee,
  login,
  changeEmployeePasswordController,
  forgotEmployeePasswordController,
  listPasswordResetRequestsController,
  adminResetEmployeePasswordController,
} from "./auth.controller.js";

import {
  employeeLoginSchema,
  loginSchema,
  changeEmployeePasswordSchema,
  forgotEmployeePasswordSchema,
  adminResetEmployeePasswordSchema,
} from "./auth.schema.js";

import {
  requireAuth,
  requireEmployeeAuth,
} from "../../common/middleware/auth.middleware.js";

import { validateBody } from "../../common/middleware/validate.middleware.js";
import { employeeIdSchema } from "../employees/employee.schema.js";

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

// Employee password management
authRouter.post(
  "/employee/change-password",
  requireEmployeeAuth,
  validateBody(changeEmployeePasswordSchema),
  changeEmployeePasswordController,
);

authRouter.post(
  "/employee/forgot-password",
  validateBody(forgotEmployeePasswordSchema),
  forgotEmployeePasswordController,
);

// Admin password reset management
authRouter.get(
  "/employee/password-reset-requests",
  requireAuth,
  listPasswordResetRequestsController,
);

authRouter.post(
  "/employee/password-reset-requests/:requestId/reset",
  requireAuth,
  (req, _res, next) => {
    const result = employeeIdSchema.safeParse(req.params.requestId);

    if (!result.success) {
      next(result.error);
      return;
    }

    next();
  },
  validateBody(adminResetEmployeePasswordSchema),
  adminResetEmployeePasswordController,
);

export { authRouter };