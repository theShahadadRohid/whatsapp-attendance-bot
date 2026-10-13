import type { RequestHandler } from "express";

import { loginAdmin } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

export const login: RequestHandler = async (req, res) => {
  const result = await loginAdmin(req.body);

  res.status(200).json({
    success: true,
    data: result
  });
};

export const getCurrentAdmin: RequestHandler = (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const user = authenticatedReq.auth;

  if (!user) {
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
      id: user.adminId,
      role: user.role
    }
  });
};