
import { Router } from "express";

import { requireAuth } from "../../common/middleware/auth.middleware.js";

import {
  getUnknownContactController,
  linkUnknownContactController,
  listUnknownContactsController,
} from "./unknown-contact.controller.js";

const unknownContactRouter = Router();

// All unknown-contact management routes require admin authentication.
unknownContactRouter.use(requireAuth);

// List unknown contacts with pagination and search.
unknownContactRouter.get("/", listUnknownContactsController);

// Get one unknown contact.
unknownContactRouter.get("/:id", getUnknownContactController);

// Link an unknown WhatsApp contact to an existing employee.
unknownContactRouter.patch("/:id/link", linkUnknownContactController);

export { unknownContactRouter };
