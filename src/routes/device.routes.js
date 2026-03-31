import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
  registerDevice,
  assignDevice,
  updateDevice,
  deleteDevice,
  toggleDeviceStatus,
  listDevices,
  heartbeat,
  getDevicesByGate,
  assignDeviceToGate,
} from "../controllers/device.controller.js";
import { checkDeviceLimit, checkDeviceLimitForToggle, checkDeviceLimitForUpdate } from "../middlewares/checkDeviceLimit.middleware.js";

const router = express.Router();

// Register new device (FR-4.1, FR-4.2)
router.post("/register", verifyAccessToken, authorizeRoles("superadmin"), checkDeviceLimit, registerDevice);

// List all devices
router.get("/", verifyAccessToken, resolveTenantDB, authorizeRoles("superadmin", "admin","client", "project_manager"), listDevices);

// FR-4.4: Heartbeat — agent marks device online (no role restriction, agent uses its own auth)
router.patch("/:id/heartbeat", verifyAccessToken, heartbeat);

// FR-4.5: Get all devices for a specific gate
router.get("/by-gate/:siteId/:gateId", verifyAccessToken, resolveTenantDB, authorizeRoles("superadmin", "admin","client", "project_manager", "supervisor"), getDevicesByGate);

// FR-4.5: Assign device to a gate
router.patch("/:id/assign-gate", verifyAccessToken, resolveTenantDB, authorizeRoles("superadmin", "admin", "client"), assignDeviceToGate);

// Update device (FR-4.1, FR-4.2 — role/gateId/lane)
router.put("/:id", verifyAccessToken, authorizeRoles("superadmin"), checkDeviceLimitForUpdate, updateDevice);

// Delete device
router.delete("/:id", verifyAccessToken, authorizeRoles("superadmin"), deleteDevice);

// Toggle device status (online/offline)
router.patch("/:id/toggle", verifyAccessToken, authorizeRoles("superadmin"), checkDeviceLimitForToggle, toggleDeviceStatus);

// Assign device to client/site
router.put("/:id/assign", verifyAccessToken, authorizeRoles("superadmin"), checkDeviceLimitForUpdate, assignDevice);

export default router;