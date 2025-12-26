import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { registerDevice, assignDevice, setDeviceOnline, listDevices } from "../controllers/device.controller.js";

const router = express.Router();

router.post("/register", verifyAccessToken, authorizeRoles("superadmin"), registerDevice);
router.put("/:id/assign", verifyAccessToken, authorizeRoles("superadmin"), assignDevice);
router.put("/:id/health", verifyAccessToken, authorizeRoles("superadmin"), setDeviceOnline);

router.get("/", verifyAccessToken, authorizeRoles("superadmin", "admin", "project_manager"), listDevices);

export default router;
