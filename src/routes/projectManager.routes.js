
import express from 'express';
import { verifyAccessToken } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/role.middleware.js';
import {
  createProjectManager,
  listProjectManagers,
  updateProjectManager,
  toggleProjectManager,
  getDashboardStats,

  createSupervisor,
  getAllSupervisors,
  assignSiteToSupervisor,
  toggleSupervisorStatus,
  getLiveVehicles,
  getVendors,
  getProfile,
  createVendor,
  toggleVendorStatus,
  deleteVendor,
  getanalytics,
  updateProfile,
  getProfileStats,
  getSettings,
  updateSettings,
  
} from '../controllers/projectManager.controller.js';
import { updateVendor } from '../controllers/vendor.controller.js';
import { addVehicleToSite, getMySites, getPMSiteDetails, getSiteActivity, getSiteTraffic, logVehicleMovement, removeVehicleFromSite, updateVehicleStatus } from '../controllers/site.controller.js';
import { exportReportsToExcelPM, getReportStatsPM, getTripReportsPM } from '../controllers/report.controller.js';

const router = express.Router();

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
  authorizeRoles("admin", "client","superadmin",),
  updateProjectManager
);

router.patch(
  "/:id/toggle",
  verifyAccessToken,
  authorizeRoles("admin","client", "superadmin"),
  toggleProjectManager
);


// Dashboard stats
router.get('/dashboard/stats', verifyAccessToken, authorizeRoles('project_manager'), getDashboardStats);

// Site routes
router.get("/sites",verifyAccessToken, authorizeRoles('project_manager'), getMySites);
router.get("/sites/:id", verifyAccessToken, authorizeRoles('project_manager'), getPMSiteDetails);
router.get("/sites/:id/traffic",verifyAccessToken, authorizeRoles('project_manager'), getSiteTraffic);
router.get("/sites/:id/activity",verifyAccessToken, authorizeRoles('project_manager'), getSiteActivity);
// Log vehicle entry or exit
router.post('/sites/log-vehicle',verifyAccessToken, authorizeRoles('project_manager'), logVehicleMovement);

// Update live vehicle status
router.put('/sites/update-vehicle-status',verifyAccessToken, authorizeRoles('project_manager'), updateVehicleStatus);

// Add vehicle to site
router.post('/sites/add-vehicle',verifyAccessToken, authorizeRoles('project_manager'), addVehicleToSite);

// Remove vehicle from site
router.delete('/sites/remove-vehicle',verifyAccessToken, authorizeRoles('project_manager'), removeVehicleFromSite);


// Vehicle management routes
router.post("/vehicles/log",verifyAccessToken, authorizeRoles('project_manager'), logVehicleMovement);
router.put("/vehicles/status",verifyAccessToken, authorizeRoles('project_manager'), updateVehicleStatus);
router.post("/vehicles/add",verifyAccessToken, authorizeRoles('project_manager'), addVehicleToSite);
router.post("/vehicles/remove",verifyAccessToken, authorizeRoles('project_manager'), removeVehicleFromSite);

// Supervisor routes
router.post('/supervisors', verifyAccessToken, authorizeRoles('project_manager'), createSupervisor);
router.get('/supervisors', verifyAccessToken, authorizeRoles('project_manager'), getAllSupervisors);
router.patch('/supervisors/:id/assign-site', verifyAccessToken, authorizeRoles('project_manager'), assignSiteToSupervisor);
router.patch('/supervisors/:id/enable-disable', verifyAccessToken, authorizeRoles('project_manager'), toggleSupervisorStatus);

// Live Vehicles monitoring
router.get('/live-monitoring/vehicles', verifyAccessToken, authorizeRoles('project_manager'), getLiveVehicles);


router.get(
  '/reports/trip', 
  verifyAccessToken, 
  authorizeRoles('project_manager'), 
  getTripReportsPM
);

router.get(
  '/reports/export', 
  verifyAccessToken, 
  authorizeRoles('project_manager'), 
  exportReportsToExcelPM
);

router.get(
  '/reports/stats', 
  verifyAccessToken, 
  authorizeRoles('project_manager'), 
  getReportStatsPM
);

router.get(
  "/analytics",
  verifyAccessToken,
  authorizeRoles("project_manager"),
  getanalytics
);
router.post('/vendors', verifyAccessToken, authorizeRoles('project_manager'), createVendor);
router.get('/vendors', verifyAccessToken, authorizeRoles('project_manager','supervisor'), getVendors);
router.patch('/vendors/:id', verifyAccessToken, authorizeRoles('project_manager'), updateVendor);
router.patch('/vendors/:id/toggle-status', verifyAccessToken, authorizeRoles('project_manager'), toggleVendorStatus);
router.delete('/vendors/:id', verifyAccessToken, authorizeRoles('project_manager'), deleteVendor);

// Profile route

router.get(
  "/profile",
  verifyAccessToken,
  authorizeRoles("project_manager"),
  getProfile
);

router.put(
  "/profile",
  verifyAccessToken,
  authorizeRoles("project_manager"),
  updateProfile
);
// Get profile stats
router.get(
  '/profile/stats',
  verifyAccessToken,
  authorizeRoles('project_manager', 'admin'),
  getProfileStats
);


router.get(
  "/settings",
  verifyAccessToken,
  authorizeRoles("project_manager"),
  getSettings
);

router.put(
  "/settings",
  verifyAccessToken,
  authorizeRoles("project_manager"),
  updateSettings
);

export default router;
