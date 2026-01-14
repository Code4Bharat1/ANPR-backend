// routes/supervisor.routes.js
import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    createSupervisor,
    getSupervisors,
    assignSite,
    toggleSupervisor,
    supervisorDashboard,
    supervisorAnalytics,
  
    getMyAssignedSite,
    getActiveVehicles
} from "../controllers/supervisor.controller.js";
import { createManualTrip, exportTripHistory, getActiveTrips, getTripHistory, updateTrip } from "../controllers/trip.controller.js";

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
    getSupervisors
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
    authorizeRoles("project_manager"),
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
  updateTrip
);
router.post(
  "/vehicles/entry",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  getActiveTrips
);

router.post(
  "/trips/manual",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  createManualTrip
);

router.get(
  "/my-site",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  getMyAssignedSite
);

export default router;
