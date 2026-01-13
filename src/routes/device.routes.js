import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { 
  registerDevice, 
  assignDevice, 
  updateDevice,
  deleteDevice,
  toggleDeviceStatus,
  listDevices 
} from "../controllers/device.controller.js";

const router = express.Router();

// Register new device
router.post("/register", verifyAccessToken, authorizeRoles("superadmin"), registerDevice);

// Update device
router.put("/:id", verifyAccessToken, authorizeRoles("superadmin"), updateDevice);

// Delete device
router.delete("/:id", verifyAccessToken, authorizeRoles("superadmin"), deleteDevice);

// Toggle device status (online/offline)
router.patch("/:id/toggle", verifyAccessToken, authorizeRoles("superadmin"), toggleDeviceStatus);

// Assign device to client/site
router.put("/:id/assign", verifyAccessToken, authorizeRoles("superadmin"), assignDevice);

// List all devices
router.get("/", verifyAccessToken, authorizeRoles("superadmin", "admin", "project_manager"), listDevices);

export default router;