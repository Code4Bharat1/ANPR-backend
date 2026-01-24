

import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
  createClient,
  getClients,
  updateClient,
  toggleClient,
  getClientDashboard,
  createProjectManager,

  getMyProfile,
  createusers,
  listUsers,

  getSettings,
  updateSettings,
  updateMyProfile,
  getProjectManagers,
  togglePMStatus,
  toggleSupervisor,
  updateProjectManager,
  deleteProjectManager,
  deleteSupervisor,

} from "../controllers/client.controller.js";
import { checkUserLimit } from "../middlewares/checkUserLimit.middleware.js";
import { createClientSite, deleteClientSite, getClientSites, updateClientSite, } from "../controllers/site.controller.js";
import { createSupervisor, getAllSupervisors, updateSupervisor } from "../controllers/supervisor.controller.js";
import { getDevices } from "../controllers/device.controller.js";
import { exportReports, exportReportsToExcelPM, getReports, getReportStatsPM, getTripReportsPM, siteWise, summary } from "../controllers/report.controller.js";
// In client.routes.js
const router = express.Router();
/**
 * @route   POST /api/clients
 * @desc    Create new client
 * @access  SuperAdmin
 */
router.post(
  "/",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  createClient
);

/**
 * @route   GET /api/clients
 * @desc    Get all clients
 * @access  SuperAdmin
 */
router.get(
  "/",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  getClients
);

/**
 * @route   PUT /api/clients/:id
 * @desc    Update client details
 * @access  SuperAdmin
 */
router.put(
  "/update/:id",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  updateClient
);

/**
 * @route   PATCH /api/clients/:id/toggle
 * @desc    Enable / Disable client
 * @access  SuperAdmin
 */
router.patch(
  "/:id/toggle",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  toggleClient
);

router.get(
  "/dashboard",
  verifyAccessToken,              // 🔥 MUST
  authorizeRoles("client", "admin"),
  getClientDashboard
);


router.post(
  "/project-managers",
  verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"),
  checkUserLimit("pm"),  // 🔥 MUST
  createProjectManager
);


router.get(
  "/project-managers",
  verifyAccessToken,
  authorizeRoles("client", "admin", "project_manager"),
  getProjectManagers
);
router.put(
  "/project-managers/:id",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  updateProjectManager
);
router.delete(
  "/project-managers/:id",
  verifyAccessToken,
  authorizeRoles("admin", "client"),
  deleteProjectManager
);
router.post("/supervisors", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), checkUserLimit("supervisor"), createSupervisor);

router.get("/supervisors", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), getAllSupervisors);

router.put(
  "/supervisor/:id",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  updateSupervisor
);

// ❌ DELETE SUPERVISOR
router.delete(
  "/supervisors/:id",
  verifyAccessToken,
  authorizeRoles("admin", "client"),
  deleteSupervisor
);
// router.get("/users", getUsers);
router.post("/users", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), createusers);

router.get("/users", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), listUsers);

router.patch("/pm/:id/status", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), togglePMStatus);


router.patch("/supervisor/:id/status", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), toggleSupervisor);



router.post(
  "/sites",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  createClientSite
);

router.get(
  "/sites",
  verifyAccessToken,
  authorizeRoles("client", "admin",),
  getClientSites
);
// ✅ UPDATE SITE
router.put(
  "/sites/:id",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  updateClientSite
);

// ✅ DELETE SITE
router.delete(
  "/sites/:id",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  deleteClientSite
);

router.get("/devices",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  getDevices);

// Reports routes for Client Admin
router.get(
  "/reports",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  getReports // Client admin reports
);

router.get(
  "/reports/export",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  exportReports // Client admin export (ExcelJS)
);

// Trip reports routes for Project Manager
router.get(
  "/trips/reports",
  verifyAccessToken,
  authorizeRoles("client", "admin", "project_manager"),
  getTripReportsPM
);

router.get(
  "/trips/export", // ✅ Changed endpoint to avoid conflict
  verifyAccessToken,
  authorizeRoles("client", "admin", "project_manager"),
  exportReportsToExcelPM // Project manager export (XLSX)
);

router.get(
  "/trips/stats",
  verifyAccessToken,
  authorizeRoles("client", "admin", "project_manager"),
  getReportStatsPM
);

// Dashboard routes
router.get("/summary", verifyAccessToken, authorizeRoles("client", "admin"), summary);
router.get("/site-wise", verifyAccessToken, authorizeRoles("client", "admin"), siteWise);
/**
 * GET MY PROFILE
 * /api/clients-admin/profile
 */
router.get(
  "/profile",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  getMyProfile
);

router.put(
  "/profile",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  updateMyProfile
);





// Settings routes
router.get(
  '/settings',
  verifyAccessToken,
  authorizeRoles('client', 'admin'),
  getSettings
);

router.put(
  '/settings',
  verifyAccessToken,
  authorizeRoles('client', 'admin'),
  updateSettings
);

// router.post(
//   '/settings/logo',
//   verifyAccessToken,
//   authorizeRoles('client', 'admin'),
//   uploadLogo
// );

// router.delete(
//   '/settings/logo',
//   verifyAccessToken,
//   authorizeRoles('client', 'admin'),
//   deleteLogo
// );
export default router;
