import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";
import {
  createEmployeeAccountController,
  createEmployeeController,
  deactivateEmployeeController,
  getEmployeeController,
  listEmployeesController,
  updateEmployeeController,
} from "./employee.controller.js";

import {
  createEmployeeAccountSchema,
  createEmployeeSchema,
  employeeIdSchema,
  updateEmployeeSchema,
} from "./employee.schema.js";

const employeeRouter = Router();

// All employee routes require admin authentication.
employeeRouter.use(requireAuth);

// Create employee.
employeeRouter.post(
  "/",
  validateBody(createEmployeeSchema),
  createEmployeeController,
);

// List employees.
employeeRouter.get("/", listEmployeesController);

// Get employee by ID.
employeeRouter.get(
  "/:id",
  (req, _res, next) => {
    const result = employeeIdSchema.safeParse(req.params.id);

    if (!result.success) {
      next(result.error);
      return;
    }

    next();
  },
  getEmployeeController,
);

// Update employee.
employeeRouter.patch(
  "/:id",
  (req, _res, next) => {
    const result = employeeIdSchema.safeParse(req.params.id);

    if (!result.success) {
      next(result.error);
      return;
    }

    next();
  },
  validateBody(updateEmployeeSchema),
  updateEmployeeController,
);

// Deactivate employee.
employeeRouter.patch(
  "/:id/deactivate",
  (req, _res, next) => {
    const result = employeeIdSchema.safeParse(req.params.id);

    if (!result.success) {
      next(result.error);
      return;
    }

    next();
  },
  deactivateEmployeeController,
);

// Create employee login account.
employeeRouter.post(
  "/:id/account",
  (req, _res, next) => {
    const result = employeeIdSchema.safeParse(req.params.id);

    if (!result.success) {
      next(result.error);
      return;
    }

    next();
  },
  validateBody(createEmployeeAccountSchema),
  createEmployeeAccountController,
);

export { employeeRouter };
