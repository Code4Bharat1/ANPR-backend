import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createAdmin, createProjectManager, createSupervisor, listUsers, toggleSupervisor } from "../controllers/user.controller.js";

const router = express.Router();

// SuperAdmin -> create Admin for client
router.post("/admin", verifyAccessToken, authorizeRoles("superadmin"), createAdmin);

// Admin -> create PM
router.post("/pm", verifyAccessToken, authorizeRoles("admin"), createProjectManager);

// Admin or PM -> create Supervisor
router.post("/supervisor", verifyAccessToken, authorizeRoles("admin", "project_manager"), createSupervisor);

router.get("/", verifyAccessToken, authorizeRoles("admin", "project_manager"), listUsers);
router.patch("/supervisor/:id/toggle", verifyAccessToken, authorizeRoles("admin", "project_manager"), toggleSupervisor);

export default router;
