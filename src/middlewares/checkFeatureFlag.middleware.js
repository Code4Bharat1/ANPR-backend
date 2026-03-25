/**
 * FR-9.2 / FR-9.3 — Feature Flag Enforcement Middleware
 *
 * Usage:
 *   router.post("/barrier/open", verifyAccessToken, checkFeatureFlag("barrierAutomation"), handler)
 *
 * Supported feature keys (must match PLANS[plan].features):
 *   barrierAutomation | biometricOpening | topCamera | aiAnalytics | dedicatedDB
 *
 * Resolution order (FR-9.4):
 *   1. client.featuresOverride[feature]  — per-client SuperAdmin override
 *   2. PLANS[client.packageType].features[feature]  — plan default
 *
 * On denial → 403 { success: false, code: "FEATURE_NOT_IN_PLAN", feature, plan }
 */

import Client from "../models/Client.model.js";
import { getPlanFeatures } from "../utils/planFeatures.util.js";

export const checkFeatureFlag = (feature) => async (req, res, next) => {
  try {
    // Resolve clientId from JWT (all roles carry clientId except superadmin)
    const clientId = req.user?.clientId;

    // SuperAdmin bypasses all feature gates
    if (req.user?.role === "superadmin") return next();

    if (!clientId) {
      return res.status(403).json({
        success: false,
        code: "FEATURE_NOT_IN_PLAN",
        message: "Client context not found in token",
        feature,
      });
    }

    const client = await Client.findById(clientId).lean();
    if (!client || !client.isActive) {
      return res.status(403).json({
        success: false,
        code: "CLIENT_INACTIVE",
        message: "Client account is inactive",
      });
    }

    const features = getPlanFeatures(client);

    if (!features[feature]) {
      return res.status(403).json({
        success: false,
        code: "FEATURE_NOT_IN_PLAN",
        message: `Feature '${feature}' is not available in your current plan (${client.packageType}). Please upgrade to access this feature.`,
        feature,
        plan: client.packageType,
      });
    }

    // Attach resolved features to req for downstream use (avoids re-fetching)
    req.planFeatures = features;
    next();
  } catch (err) {
    console.error("❌ checkFeatureFlag error:", err.message);
    res.status(500).json({ success: false, message: "Feature check failed" });
  }
};
