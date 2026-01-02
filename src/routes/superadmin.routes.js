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
/* ======================================================
   SITE ROUTES
====================================================== */
router.get('/sites', ...guard,SA.getAllSites);                    // Get all sites
router.get('/sites/:id', ...guard,SA.getSiteById);                // Get single site
router.post('/sites',...guard,SA.createSite);                     // Create new site
router.put('/sites/:id',...guard,SA.updateSite);                  // Update site
router.delete('/sites/:id', ...guard,SA.deleteSite);               // Delete/deactivate site
router.patch('/sites/:id/toggle', ...guard,SA.toggleSiteStatus);   // Activate/deactivate site
router.get('/clients/:clientId/sites', ...guard,SA.getSitesByClient); // Get sites by client

// Devices
// router.get("/devices/stats", ...guard, SA.deviceStats);
// router.get("/devices", ...guard, SA.listDevices);
// router.patch("/devices/:id/toggle", ...guard, SA.toggleDevice);
// Devices
router.post("/devices", ...guard, SA.createDevice); // ✅ ADD THIS
router.get("/devices/stats", ...guard, SA.deviceStats);
router.get("/devices", ...guard, SA.listDevices);
router.get("/devices/:id", ...guard, SA.getDeviceById); // optional
router.put("/devices/:id", ...guard, SA.updateDevice);  // optional
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
