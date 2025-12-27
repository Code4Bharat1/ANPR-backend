// routes/projectManager.routes.js
import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

import {
  createProjectManager,
  listProjectManagers,
  updateProjectManager,
  toggleProjectManager,
} from "../controllers/projectManager.controller.js";

const router = express.Router();

// Admin / SuperAdmin
router.post(
  "/",
  verifyAccessToken,
  authorizeRoles("admin","client", "superadmin"),
  createProjectManager
);

router.get(
  "/",
  verifyAccessToken,
  authorizeRoles("admin", "client","superadmin"),
  listProjectManagers
);

router.put(
  "/:id",
  verifyAccessToken,
  authorizeRoles("admin", "client","superadmin"),
  updateProjectManager
);

router.patch(
  "/:id/toggle",
  verifyAccessToken,
  authorizeRoles("admin","client", "superadmin"),
  toggleProjectManager
);

export default router;
