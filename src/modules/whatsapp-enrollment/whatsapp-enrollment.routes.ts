
import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";

import {
  createWhatsAppEnrollmentController,
  revokeWhatsAppEnrollmentController,
} from "./whatsapp-enrollment.controller.js";

import {
  createWhatsAppEnrollmentSchema,
  employeeIdSchema,
} from "./whatsapp-enrollment.schema.js";

const whatsappEnrollmentRouter = Router();

// All enrollment management routes require admin authentication.
whatsappEnrollmentRouter.use(requireAuth);

// Create an enrollment invitation.
whatsappEnrollmentRouter.post(
  "/",
  validateBody(createWhatsAppEnrollmentSchema),
  createWhatsAppEnrollmentController,
);

// Revoke an employee's enrollment.
whatsappEnrollmentRouter.patch(
  "/:employeeId/revoke",
  (req, _res, next) => {
    const result = employeeIdSchema.safeParse(req.params.employeeId);

    if (!result.success) {
      next(result.error);
      return;
    }

    next();
  },
  revokeWhatsAppEnrollmentController,
);

export { whatsappEnrollmentRouter };
