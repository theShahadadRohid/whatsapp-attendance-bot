import type { RequestHandler } from "express";

import { AppError } from "../../common/errors/app-error.js";
import { WHATSAPP_ENROLLMENT_STATUSES } from "./whatsapp-enrollment.model.js";
import {
  createWhatsAppEnrollment,
  getWhatsAppEnrollmentByEmployeeId,
  listWhatsAppEnrollments,
  revokeWhatsAppEnrollment,
} from "./whatsapp-enrollment.service.js";

function getPositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new AppError("Invalid pagination value.", 400);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new AppError("Pagination value is out of range.", 400);
  }

  return parsed;
}

async function sendEnrollmentInvitation(
  employeeId: string,
  res: Parameters<RequestHandler>[1],
  statusCode: number,
  message: string,
) {
  const result = await createWhatsAppEnrollment(employeeId);

  res.status(statusCode).json({
    message,
    data: {
      enrollment: {
        id: result.enrollment._id.toString(),
        employeeId: result.enrollment.employeeId.toString(),
        status: result.enrollment.status,
        expiresAt: result.expiresAt,
      },
      // The raw token is shown only once.
      token: result.token,
    },
  });
}

export const createWhatsAppEnrollmentController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { employeeId } = req.body as {
      employeeId: string;
    };

    await sendEnrollmentInvitation(
      employeeId,
      res,
      201,
      "WhatsApp enrollment invitation created successfully.",
    );
  } catch (error) {
    next(error);
  }
};

export const reissueWhatsAppEnrollmentController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employeeId = req.params.employeeId as string;

    await sendEnrollmentInvitation(
      employeeId,
      res,
      200,
      "WhatsApp enrollment invitation reissued successfully.",
    );
  } catch (error) {
    next(error);
  }
};

export const listWhatsAppEnrollmentsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const page = getPositiveInteger(req.query.page, 1, 1_000_000);
    const limit = getPositiveInteger(req.query.limit, 20, 100);

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    if (search && search.length > 100) {
      throw new AppError(
        "Search query cannot exceed 100 characters.",
        400,
      );
    }

    let status:
      | (typeof WHATSAPP_ENROLLMENT_STATUSES)[number]
      | undefined;

    if (req.query.status !== undefined) {
      if (
        typeof req.query.status !== "string" ||
        !WHATSAPP_ENROLLMENT_STATUSES.includes(
          req.query.status as (typeof WHATSAPP_ENROLLMENT_STATUSES)[number],
        )
      ) {
        throw new AppError("Invalid enrollment status filter.", 400);
      }

      status = req.query.status as
        (typeof WHATSAPP_ENROLLMENT_STATUSES)[number];
    }

    const result = await listWhatsAppEnrollments({
      page,
      limit,
      search,
      status,
    });

    res.status(200).json({
      message: "WhatsApp enrollments retrieved successfully.",
      data: result,
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

    const result =
      await getWhatsAppEnrollmentByEmployeeId(employeeId);

    res.status(200).json({
      message: "WhatsApp enrollment retrieved successfully.",
      data: {
        enrollment: result.enrollment,
        employee: result.employee,
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