// routes/trip.routes.js
import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { getActiveTrips, getTripHistory } from "../controllers/trip.controller.js";

const router = express.Router();

// Active vehicles (currently inside premises)
router.get(
  "/active", 
  verifyAccessToken, 
  authorizeRoles("supervisor", "project_manager", "admin", "client"), 
  getActiveTrips
);

// Trip history (completed and active trips)
router.get(
  "/history", 
  verifyAccessToken, 
  authorizeRoles("supervisor", "project_manager", "admin", "client"), 
  getTripHistory
);

export default router;