import { Router } from "express";

import { getCurrentAdmin, login } from "./auth.controller.js";
import { loginSchema } from "./auth.schema.js";
import { validateBody } from "../../common/middleware/validate.middleware.js";
import { requireAuth } from "../../common/middleware/auth.middleware.js";

const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), login);
authRouter.get("/me", requireAuth, getCurrentAdmin);

export { authRouter };