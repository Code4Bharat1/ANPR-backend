// routes/supervisor.routes.js
import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
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
  authorizeRoles("supervisor"),
  supervisorDashboard
);

router.get(
  "/vehicles/active",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  getActiveVehicles
);
router.get(
  "/trips",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  getTripHistory
);
router.get(
  "/trips/export",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  exportTripHistory
);
router.get(
  "/analytics",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  supervisorAnalytics
);


router.post(
  "/vehicles/exit",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  exitVehicle
);
router.post(
  "/vehicles/entry",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  createManualTrip  // यह सही controller है
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
  authorizeRoles("supervisor"),
  getMyAssignedSite
);



// Add this route with the other supervisor routes
router.get(
  "/analytics/export",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  exportAnalyticsReport
);

router.post(
  "/mobile/trips/manual",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  createManualTripMobile
);

// backend routes (supervisorRoutes.js)
router.get('/vendors', verifyAccessToken, authorizeRoles('supervisor'), getSupervisorVendors);

export default router;
