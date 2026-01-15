import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import * as SA from "../controllers/superadmin.controller.js";
import { checkDeviceLimit } from "../middlewares/checkDeviceLimit.middleware.js";
import { createClientSite,  deleteClientSite,   getAdminSiteById,   getAllSites, getSitesByClient, toggleClientSite, updateClientSite, } from "../controllers/site.controller.js";

const router = express.Router();
const guard = [verifyAccessToken, authorizeRoles("superadmin")];

router.get("/dashboard", ...guard, SA.dashboardOverview);
// Analytics
router.get("/analytics/summary", ...guard, SA.analyticsSummary);
router.get("/analytics/trips", ...guard, SA.tripVolumeDaily);
router.get("/analytics/clients", ...guard, SA.clientDistribution);
router.get("/analytics/revenue", ...guard, SA.revenueAnalytics); // Add this
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
router.get('/sites', getAllSites);                    // Get all sites
router.get('/sites/:id', getAdminSiteById);                // Get single site
router.post('/sites',createClientSite);                     // Create new site
router.put('/sites/:id',updateClientSite);                  // Update site
router.delete('/sites/:id', deleteClientSite);               // Delete/deactivate site
router.patch('/sites/:id/toggle',toggleClientSite);   // Activate/deactivate site
router.get('/clients/:clientId/sites', getSitesByClient); // Get sites by client

// Devices
// router.get("/devices/stats", ...guard, SA.deviceStats);
// router.get("/devices", ...guard, SA.listDevices);
// router.patch("/devices/:id/toggle", ...guard, SA.toggleDevice);
// Devices
router.post("/devices", ...guard,  checkDeviceLimit, SA.createDevice); // ✅ ADD THIS
router.get("/devices/stats", ...guard, SA.deviceStats);
router.get("/devices", ...guard, SA.listDevices);
router.get("/devices/:id", ...guard, SA.getDeviceById); // optional
router.put("/devices/:id", ...guard, SA.updateDevice);  // optional
router.patch("/devices/:id/toggle", ...guard, SA.toggleDevice);
router.delete("/devices/:id", ...guard, SA.deleteDevice); 


// Profile
router.get("/profile", ...guard, SA.getProfile);
router.patch("/profile/change-password", ...guard, SA.changePassword);
router.put("/profile", ...guard, SA.updateProfile);


// Settings
router.get("/settings", ...guard, SA.getSettings);
router.put("/settings", ...guard, SA.updateSettings);


// Notifications
router.get("/notifications", ...guard, SA.listNotifications);

export default router;
