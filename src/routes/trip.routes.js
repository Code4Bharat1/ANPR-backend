// routes/trip.routes.js
import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
  getActiveTrips,
  getTripHistory,
  getTripById,
  getTripStats,
  exportTripHistory,
} from "../controllers/trip.controller.js";

const router = express.Router();

// Resolve correct DB connection for tenant isolation (dedicated DB support)
router.use(verifyAccessToken, resolveTenantDB);

const tripRoles = ["supervisor", "project_manager", "admin", "client"];

// ⚠️ Static routes MUST come before /:id to avoid Express treating them as id params

// FR-3.1: Active vehicles (currently inside premises)
router.get("/active", authorizeRoles(...tripRoles), getActiveTrips);

// FR-3.2: Trip history with filters + pagination
router.get("/history", authorizeRoles(...tripRoles), getTripHistory);

// FR-3.5: Export trip history (CSV / Excel)
router.get("/export", authorizeRoles(...tripRoles), exportTripHistory);

// FR-3.3 / stats: Trip statistics
router.get("/stats", authorizeRoles(...tripRoles), getTripStats);

// FR-3.2: Single trip by ID — must be last
router.get("/:id", authorizeRoles(...tripRoles), getTripById);

export default router;
