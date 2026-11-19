import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { linkUnknownContactToEmployee } from "./unknown-contact.service.js";
import { AppError } from "../../common/errors/app-error.js";
import { UnknownContactModel } from "./unknown-contact.model.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listUnknownContactsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const pageValue = Number(req.query.page ?? 1);
    const limitValue = Number(req.query.limit ?? 20);

    if (
      !Number.isInteger(pageValue) ||
      pageValue < 1 ||
      !Number.isInteger(limitValue) ||
      limitValue < 1 ||
      limitValue > 100
    ) {
      throw new AppError(
        "Page must be at least 1 and limit must be between 1 and 100.",
        400,
        "INVALID_PAGINATION",
      );
    }

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    if (search.length > 100) {
      throw new AppError(
        "Search cannot exceed 100 characters.",
        400,
        "INVALID_SEARCH",
      );
    }

    const filter = search
      ? {
          $or: [
            {
              phoneNumber: {
                $regex: escapeRegex(search),
                $options: "i",
              },
            },
            {
              whatsappBusinessScopedUserId: {
                $regex: escapeRegex(search),
                $options: "i",
              },
            },
          ],
        }
      : {};

    const skip = (pageValue - 1) * limitValue;

    const [contacts, total] = await Promise.all([
      UnknownContactModel.find(filter)
        .select(
          [
            "_id",
            "phoneNumber",
            "whatsappBusinessScopedUserId",
            "attemptCount",
            "restrictedUntil",
            "lastMessageAt",
            "createdAt",
            "updatedAt",
          ].join(" "),
        )
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitValue)
        .lean(),

      UnknownContactModel.countDocuments(filter),
    ]);

    res.status(200).json({
      message: "Unknown contacts retrieved successfully.",
      data: {
        contacts: contacts.map((contact) => ({
          id: contact._id.toString(),
          phoneNumber: contact.phoneNumber,
          whatsappBusinessScopedUserId:
            contact.whatsappBusinessScopedUserId,
          attemptCount: contact.attemptCount,
          restrictedUntil: contact.restrictedUntil,
          lastMessageAt: contact.lastMessageAt,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        })),
        pagination: {
          page: pageValue,
          limit: limitValue,
          total,
          totalPages: Math.ceil(total / limitValue),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUnknownContactController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const contactId = req.params.id as string;

    if (!Types.ObjectId.isValid(contactId)) {
      throw new AppError(
        "Invalid unknown contact ID.",
        400,
        "INVALID_CONTACT_ID",
      );
    }

    const contact = await UnknownContactModel.findById(contactId)
      .select(
        [
          "_id",
          "phoneNumber",
          "whatsappBusinessScopedUserId",
          "attemptCount",
          "restrictedUntil",
          "lastMessageAt",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .lean();

    if (!contact) {
      throw new AppError(
        "Unknown contact not found.",
        404,
        "UNKNOWN_CONTACT_NOT_FOUND",
      );
    }

    res.status(200).json({
      message: "Unknown contact retrieved successfully.",
      data: {
        contact: {
          id: contact._id.toString(),
          phoneNumber: contact.phoneNumber,
          whatsappBusinessScopedUserId:
            contact.whatsappBusinessScopedUserId,
          attemptCount: contact.attemptCount,
          restrictedUntil: contact.restrictedUntil,
          lastMessageAt: contact.lastMessageAt,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};


export const linkUnknownContactController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const contactId = req.params.id as string;
    const { employeeId } = req.body as {
      employeeId?: string;
    };

    if (!employeeId || !Types.ObjectId.isValid(employeeId)) {
      throw new AppError(
        "A valid employeeId is required.",
        400,
        "INVALID_EMPLOYEE_ID",
      );
    }

    const employee = await linkUnknownContactToEmployee(
      contactId,
      employeeId,
    );

    res.status(200).json({
      message: "Unknown contact linked to employee successfully.",
      data: {
        employee,
      },
    });
  } catch (error) {
    next(error);
  }
};
