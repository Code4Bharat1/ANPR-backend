import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createEntry, createExit, getActiveTrips, getTripHistory } from "../controllers/trip.controller.js";

const router = express.Router();

router.post("/entry", verifyAccessToken, authorizeRoles("supervisor"), createEntry);
router.post("/exit/:tripId", verifyAccessToken, authorizeRoles("supervisor"), createExit);

router.get("/active", verifyAccessToken, authorizeRoles("supervisor", "project_manager", "admin","client"), getActiveTrips);
router.get("/history", verifyAccessToken, authorizeRoles("supervisor", "project_manager", "admin","client"), getTripHistory);

export default router;
