import type { RequestHandler } from "express";
import { loginAdmin } from "./auth.service.js";

export const login: RequestHandler = async (req, res) => {
  const result = await loginAdmin(req.body);

  res.status(200).json({
    success: true,
    data: result
  });
};

export const getCurrentAdmin: RequestHandler = (req, res) => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required."
      }
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      id: req.auth.adminId,
      role: req.auth.role
    }
  });
};