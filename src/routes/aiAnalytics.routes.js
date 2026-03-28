/**
 * AI Analytics Routes
 * Feature-gated: aiAnalytics (ENTERPRISE plan only)
 */

import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { checkFeatureFlag } from "../middlewares/checkFeatureFlag.middleware.js";
import { aiAnalyticsQuery } from "../controllers/aiAnalytics.controller.js";

const router = express.Router();

router.use(verifyAccessToken, resolveTenantDB);

/**
 * POST /api/ai-analytics/query
 * Body: { question: "How many vehicles entered today?" }
 * Returns: { success, answer, data, intent }
 */
router.post(
  "/query",
  authorizeRoles("admin", "client", "project_manager"),
  checkFeatureFlag("aiAnalytics"),
  aiAnalyticsQuery
);

export default router;
