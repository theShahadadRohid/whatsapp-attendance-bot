
import type { RequestHandler } from "express";

import {
  createWhatsAppEnrollment,
  revokeWhatsAppEnrollment,
} from "./whatsapp-enrollment.service.js";

export const createWhatsAppEnrollmentController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { employeeId } = req.body as { employeeId: string };

    const result = await createWhatsAppEnrollment(employeeId);

    res.status(201).json({
      message: "WhatsApp enrollment invitation created successfully.",
      data: {
        enrollment: {
          id: result.enrollment._id.toString(),
          status: result.enrollment.status,
          expiresAt: result.expiresAt,
        },
        // Display this token only once. Share it securely with the employee.
        token: result.token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const revokeWhatsAppEnrollmentController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = req.params.employeeId as string;

    const enrollment = await revokeWhatsAppEnrollment(employeeId);

    res.status(200).json({
      message: "WhatsApp enrollment revoked successfully.",
      data: {
        enrollment: {
          id: enrollment._id.toString(),
          employeeId: enrollment.employeeId.toString(),
          status: enrollment.status,
          revokedAt: enrollment.revokedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
