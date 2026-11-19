
import type { RequestHandler } from "express";

import { AppError } from "../../common/errors/app-error.js";
import { WhatsAppEnrollmentModel } from "./whatsapp-enrollment.model.js";
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
    const { employeeId } = req.body as {
      employeeId: string;
    };

    const result = await createWhatsAppEnrollment(employeeId);

    res.status(201).json({
      message: "WhatsApp enrollment invitation created successfully.",
      data: {
        enrollment: {
          id: result.enrollment._id.toString(),
          employeeId: result.enrollment.employeeId.toString(),
          status: result.enrollment.status,
          expiresAt: result.expiresAt,
        },
        // This is the only response that exposes the raw token.
        token: result.token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getWhatsAppEnrollmentController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = req.params.employeeId as string;

    const enrollment = await WhatsAppEnrollmentModel.findOne({
      employeeId,
    }).select(
      [
        "_id",
        "employeeId",
        "status",
        "expiresAt",
        "attemptCount",
        "verifiedAt",
        "consentedAt",
        "consentVersion",
        "revokedAt",
        "createdAt",
        "updatedAt",
      ].join(" "),
    );

    if (!enrollment) {
      throw new AppError(
        "WhatsApp enrollment not found.",
        404,
        "ENROLLMENT_NOT_FOUND",
      );
    }

    res.status(200).json({
      message: "WhatsApp enrollment retrieved successfully.",
      data: {
        enrollment: {
          id: enrollment._id.toString(),
          employeeId: enrollment.employeeId.toString(),
          status: enrollment.status,
          expiresAt: enrollment.expiresAt,
          attemptCount: enrollment.attemptCount,
          verifiedAt: enrollment.verifiedAt,
          consentedAt: enrollment.consentedAt,
          consentVersion: enrollment.consentVersion,
          revokedAt: enrollment.revokedAt,
          createdAt: enrollment.createdAt,
          updatedAt: enrollment.updatedAt,
        },
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
