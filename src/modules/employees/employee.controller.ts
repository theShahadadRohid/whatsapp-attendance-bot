
import type { RequestHandler } from "express";

import { AppError } from "../../common/errors/app-error.js";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
} from "./employee.service.js";

export const createEmployeeController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employee = await createEmployee(req.body);

    res.status(201).json({
      message: "Employee created successfully.",
      data: { employee },
    });
  } catch (error) {
    next(error);
  }
};

export const listEmployeesController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    if (
      req.query.includeInactive !== undefined &&
      req.query.includeInactive !== "true" &&
      req.query.includeInactive !== "false"
    ) {
      throw new AppError(
        "includeInactive must be true or false.",
        400,
        "INVALID_QUERY_PARAMETER",
      );
    }

    const limit = req.query.limit === undefined
      ? 20
      : Number(req.query.limit);

    const skip = req.query.skip === undefined
      ? 0
      : Number(req.query.skip);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(skip) ||
      skip < 0
    ) {
      throw new AppError(
        "Invalid pagination parameters.",
        400,
        "INVALID_PAGINATION",
      );
    }

    const result = await listEmployees({
      includeInactive,
      limit,
      skip,
    });

    res.status(200).json({
      message: "Employees retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employee = await getEmployeeById(req.params.id as string);

    res.status(200).json({
      message: "Employee retrieved successfully.",
      data: { employee },
    });
  } catch (error) {
    next(error);
  }
};

export const updateEmployeeController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employee = await updateEmployee(
      req.params.id as string,
      req.body,
    );

    res.status(200).json({
      message: "Employee updated successfully.",
      data: { employee },
    });
  } catch (error) {
    next(error);
  }
};

export const deactivateEmployeeController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const employee = await deactivateEmployee(req.params.id as string);

    res.status(200).json({
      message: "Employee deactivated successfully.",
      data: { employee },
    });
  } catch (error) {
    next(error);
  }
};
