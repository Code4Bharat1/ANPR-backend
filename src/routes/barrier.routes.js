import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { checkFeatureFlag } from "../middlewares/checkFeatureFlag.middleware.js";
import {
  loginBarrier,
  openBarrier,
  closeBarrier,
  getBarrierStatus,
  getAllBarrierStatus,
} from "../controllers/barrier.controller.js";

const router = express.Router();

const barrierGuard = [
  verifyAccessToken,
  authorizeRoles("supervisor", "project_manager", "admin","client"),
  checkFeatureFlag("barrierAutomation"),
];

// Initial camera auth handshake — no feature gate needed
router.post("/login", loginBarrier);

// FR-5.1 / FR-5.5: Manual open
router.post("/open", ...barrierGuard, openBarrier);

// FR-5.2 / FR-5.5: Manual close
router.post("/close", ...barrierGuard, closeBarrier);

// FR-5.4: Last known barrier state for caller's site
router.get(
  "/status",
  verifyAccessToken,
  authorizeRoles("supervisor", "project_manager", "admin","client"),
  getBarrierStatus
);
// FR-5.4 Extended: All sites barrier status for client admin
router.get(
  "/status/all",
  verifyAccessToken,
  authorizeRoles("admin", "client"),
  getAllBarrierStatus
);

export default router;
