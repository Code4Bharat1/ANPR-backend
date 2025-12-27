import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

import * as SA from "../controllers/superadmin.controller.js";

const router = express.Router();
const guard = [verifyAccessToken, authorizeRoles("superadmin")];

router.get("/dashboard", ...guard, SA.dashboardOverview);

// Analytics
router.get("/analytics/summary", ...guard, SA.analyticsSummary);
router.get("/analytics/trips", ...guard, SA.tripVolumeDaily);
router.get("/analytics/clients", ...guard, SA.clientDistribution);

// Audit
router.get("/audit-logs", ...guard, SA.getAuditLogs);

// Clients
router.post("/clients", ...guard, SA.createClient);
router.get("/clients", ...guard, SA.listClients);
router.put("/clients/:id", ...guard, SA.updateClient);
router.patch("/clients/:id/deactivate", ...guard, SA.deactivateClient);

// Devices
router.get("/devices/stats", ...guard, SA.deviceStats);
router.get("/devices", ...guard, SA.listDevices);
router.patch("/devices/:id/toggle", ...guard, SA.toggleDevice);

// Profile
router.get("/profile", ...guard, SA.getProfile);
router.patch("/profile/change-password", ...guard, SA.changePassword);

// Settings
router.get("/settings", ...guard, SA.getSettings);
router.patch("/settings", ...guard, SA.updateSettings);

// Notifications
router.get("/notifications", ...guard, SA.listNotifications);

export default router;
