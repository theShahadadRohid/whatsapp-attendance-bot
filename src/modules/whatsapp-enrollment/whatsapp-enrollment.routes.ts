import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";

import {
  createWhatsAppEnrollmentController,
  getWhatsAppEnrollmentController,
  listWhatsAppEnrollmentsController,
  reissueWhatsAppEnrollmentController,
  revokeWhatsAppEnrollmentController,
} from "./whatsapp-enrollment.controller.js";

import {
  createWhatsAppEnrollmentSchema,
  employeeIdSchema,
} from "./whatsapp-enrollment.schema.js";

const whatsappEnrollmentRouter = Router();

whatsappEnrollmentRouter.use(requireAuth);

function validateEmployeeId(
  req: Parameters<import("express").RequestHandler>[0],
  _res: Parameters<import("express").RequestHandler>[1],
  next: Parameters<import("express").RequestHandler>[2],
) {
  const result = employeeIdSchema.safeParse(req.params.employeeId);

  if (!result.success) {
    next(result.error);
    return;
  }

  next();
}

// List, search, filter and paginate enrollments.
whatsappEnrollmentRouter.get(
  "/",
  listWhatsAppEnrollmentsController,
);

// Create an enrollment invitation.
whatsappEnrollmentRouter.post(
  "/",
  validateBody(createWhatsAppEnrollmentSchema),
  createWhatsAppEnrollmentController,
);

// Reissue an invitation for an employee.
whatsappEnrollmentRouter.post(
  "/:employeeId/reissue",
  validateEmployeeId,
  reissueWhatsAppEnrollmentController,
);

// Retrieve an employee's enrollment details.
whatsappEnrollmentRouter.get(
  "/:employeeId",
  validateEmployeeId,
  getWhatsAppEnrollmentController,
);

// Revoke an employee's enrollment and unlink their WhatsApp identity.
whatsappEnrollmentRouter.patch(
  "/:employeeId/revoke",
  validateEmployeeId,
  revokeWhatsAppEnrollmentController,
);

export { whatsappEnrollmentRouter };