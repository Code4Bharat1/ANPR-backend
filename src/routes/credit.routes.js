import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
  getBalance,
  topupCredits,
  getLedger,
  updateThreshold,
} from "../controllers/credit.controller.js";

const router = express.Router();

// GET /api/credits/balance
// Client sees own balance; superadmin can pass ?clientId=
router.get(
  "/balance",
  verifyAccessToken,
  authorizeRoles("client", "superadmin", "project_manager"),
  getBalance
);

// POST /api/credits/topup  — superadmin only
router.post(
  "/topup",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  topupCredits
);

// GET /api/credits/ledger
// Client sees own ledger; superadmin passes ?clientId=
router.get(
  "/ledger",
  verifyAccessToken,
  authorizeRoles("client", "superadmin", "project_manager"),
  getLedger
);

// PATCH /api/credits/threshold  — superadmin only
router.patch(
  "/threshold",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  updateThreshold
);

export default router;
