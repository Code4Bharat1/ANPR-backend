
import express from 'express';
import { verifyAccessToken } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/role.middleware.js';
import {
  createProjectManager,
  listProjectManagers,
  updateProjectManager,
  toggleProjectManager,
  getDashboardStats,
  getMySites,
  getSiteDetails,
  createSupervisor,
  getAllSupervisors,
  assignSiteToSupervisor,
  toggleSupervisorStatus,
  getLiveVehicles,
  getTripReports,
  getVendors,
  getProfile,
  createVendor,
  toggleVendorStatus,
  deleteVendor,
  exportReportsToExcel,
  getReportStats,
  getanalytics,
  updateProfile,
  getProfileStats,
  getSettings,
  updateSettings,
} from '../controllers/projectManager.controller.js';
import { updateVendor } from '../controllers/vendor.controller.js';

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

// Sites routes
router.get('/sites', verifyAccessToken, authorizeRoles('project_manager'), getMySites);
router.get('/sites/:id', verifyAccessToken, authorizeRoles('project_manager'), getSiteDetails);

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
  getTripReports
);

router.get(
  '/reports/export', 
  verifyAccessToken, 
  authorizeRoles('project_manager'), 
  exportReportsToExcel
);

router.get(
  '/reports/stats', 
  verifyAccessToken, 
  authorizeRoles('project_manager'), 
  getReportStats
);

router.get(
  "/analytics",
  verifyAccessToken,
  authorizeRoles("project_manager"),
  getanalytics
);
router.post('/vendors', verifyAccessToken, authorizeRoles('project_manager'), createVendor);
router.get('/vendors', verifyAccessToken, authorizeRoles('project_manager'), getVendors);
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
