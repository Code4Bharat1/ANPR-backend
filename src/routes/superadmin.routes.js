import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import * as SA from "../controllers/superadmin.controller.js";
import { 
  checkDeviceLimit, 
  checkDeviceLimitForToggle,
  checkDeviceLimitForUpdate 
} from '../middlewares/checkDeviceLimit.middleware.js';
import { checkSiteLimit } from "../middlewares/checkSiteLimit.middleware.js";
import { createClientSite, deleteClientSite, getAdminSiteById, getAllSites, getSitesByClient, toggleClientSite, updateClientSite } from "../controllers/site.controller.js";
import { topupCredits, getBalance, getLedger, updateThreshold } from "../controllers/credit.controller.js";

const router = express.Router();
const guard = [verifyAccessToken, authorizeRoles("superadmin")];

// router.get("/dashboard", ...guard, SA.dashboardOverview);
// Dashboard Routes
router.get("/dashboard",  ...guard, SA.dashboardOverview);
router.get("/dashboard/stats",  ...guard, SA.getDashboardStats);
router.get("/dashboard/device-health",  ...guard, SA. getDeviceHealthDetails);
router.get("/dashboard/credits",  ...guard, SA.getCreditDashboard);

// Analytics
router.get("/analytics/summary", ...guard, SA.analyticsSummary);
router.get("/analytics/trips", ...guard, SA.tripVolumeDaily);
router.get("/analytics/clients", ...guard, SA.clientDistribution);
router.get("/analytics/revenue", ...guard, SA.revenueAnalytics);
// Audit
router.get("/audit-logs", ...guard, SA.getAuditLogs);

// Clients
router.post("/clients", ...guard, SA.createClient);
router.get("/clients", ...guard, SA.listClients);
router.put("/clients/:id", ...guard, SA.updateClient);
router.patch("/clients/:id/deactivate", ...guard, SA.deactivateClient);
// FR-9.4: Per-client plan override (feature flags + limits)
router.patch("/clients/:id/plan-override", ...guard, SA.updatePlanOverride);

// Dedicated DB provisioning (SRS §10, ENTERPRISE only)
router.post("/clients/:id/provision-db",   ...guard, SA.provisionDedicatedDB);
router.delete("/clients/:id/provision-db", ...guard, SA.deprovisionDedicatedDB);

/* ======================================================
   SITE ROUTES
====================================================== */
router.get('/sites', getAllSites);
router.get('/sites/:id', getAdminSiteById);
router.post('/sites', checkSiteLimit, createClientSite);   // FR-9.1: site limit check
router.put('/sites/:id', updateClientSite);
router.delete('/sites/:id', deleteClientSite);
router.patch('/sites/:id/toggle', toggleClientSite);
router.get('/clients/:clientId/sites', getSitesByClient);

// Devices
router.post("/devices", ...guard, checkDeviceLimit, SA.createDevice);
router.get("/devices/stats", ...guard, SA.deviceStats);
router.get("/devices", ...guard, SA.listDevices);
router.get("/devices/:id", ...guard, SA.getDeviceById);
router.put("/devices/:id", ...guard, checkDeviceLimitForUpdate, SA.updateDevice);
router.patch("/devices/:id/toggle", ...guard, checkDeviceLimitForToggle, SA.toggleDevice);
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

// Credits (superadmin convenience routes)
router.post("/credits/topup", ...guard, topupCredits);
router.get("/credits/balance", ...guard, getBalance);
router.get("/credits/ledger", ...guard, getLedger);
router.patch("/credits/threshold", ...guard, updateThreshold);

export default router;
