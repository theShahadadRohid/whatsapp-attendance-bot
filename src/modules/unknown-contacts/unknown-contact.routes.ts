import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";

import {
  getUnknownContactController,
  listUnknownContactsController,
} from "./unknown-contact.controller.js";

const unknownContactRouter = Router();

// All unknown-contact management routes require admin authentication.
unknownContactRouter.use(requireAuth);

unknownContactRouter.get("/", listUnknownContactsController);

unknownContactRouter.get("/:id", getUnknownContactController);

export { unknownContactRouter };
