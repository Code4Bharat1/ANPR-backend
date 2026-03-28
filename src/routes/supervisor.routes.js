// routes/supervisor.routes.js
import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { checkCreditBalance } from "../middlewares/checkCreditBalance.middleware.js";
// Add this import at the top
import { exportAnalyticsReport, getAllSupervisors, getSupervisorVendors } from "../controllers/supervisor.controller.js";
import {
    createSupervisor,
  
    assignSite,
    toggleSupervisor,
    supervisorDashboard,
    supervisorAnalytics,
  
    getMyAssignedSite,
    getActiveVehicles
} from "../controllers/supervisor.controller.js";
import { createManualTrip, createManualTripMobile, exitVehicle, exportTripHistory, getActiveTrips, getTripHistory } from "../controllers/trip.controller.js";

const router = express.Router();

router.post(
    "/",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    createSupervisor
);

router.get(
    "/",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    getAllSupervisors
);

router.patch(
    "/:id/assign-site",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    assignSite
);

router.patch(
    "/:id/toggle",
    verifyAccessToken,
    authorizeRoles("project_manager","client","admin"),
    toggleSupervisor
);
router.get(
  "/dashboard",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  supervisorDashboard
);

router.get(
  "/vehicles/active",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  getActiveVehicles
);
router.get(
  "/trips",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  getTripHistory
);
router.get(
  "/trips/export",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  exportTripHistory
);
router.get(
  "/analytics",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  supervisorAnalytics
);


router.post(
  "/vehicles/exit",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  resolveTenantDB,
  exitVehicle
);
router.post(
  "/vehicles/entry",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  checkCreditBalance,
  resolveTenantDB,
  createManualTrip
);
router.post(
  "/mobile/trips/manual",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  checkCreditBalance,
  resolveTenantDB,
  createManualTripMobile
);

// और GET endpoint अलग से बनाएं
// router.get(
//   "/vehicles/active",
//   verifyAccessToken,
//   authorizeRoles("supervisor"),
//   getActiveTrips
// );

router.get(
  "/my-site",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  getMyAssignedSite
);

router.get(
  "/analytics/export",
  verifyAccessToken,
  resolveTenantDB,
  authorizeRoles("supervisor"),
  exportAnalyticsReport
);

router.get('/vendors', verifyAccessToken, resolveTenantDB, authorizeRoles('supervisor'), getSupervisorVendors);

export default router;
