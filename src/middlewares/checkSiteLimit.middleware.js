/**
 * FR-9.1 — Site Limit Enforcement Middleware
 *
 * Blocks site creation when the client has reached their plan's site limit.
 * Reads clientId from req.body (for superadmin creating on behalf of client)
 * or from req.user.clientId (for client-level calls).
 *
 * On denial → 403 { success: false, code: "SITE_LIMIT_EXCEEDED", current, limit, plan }
 */

import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import { getPlanLimits } from "../utils/planFeatures.util.js";

export const checkSiteLimit = async (req, res, next) => {
  try {
    const clientId = req.body?.clientId || req.user?.clientId;

    if (!clientId) {
      return res.status(400).json({ success: false, message: "clientId is required" });
    }

    const client = await Client.findById(clientId).lean();
    if (!client || !client.isActive) {
      return res.status(403).json({ success: false, message: "Client inactive or not found" });
    }

    const limits = getPlanLimits(client);
    const currentCount = await Site.countDocuments({ clientId, isActive: { $ne: false } });

    if (currentCount >= limits.sites) {
      return res.status(403).json({
        success: false,
        code: "SITE_LIMIT_EXCEEDED",
        message: `Site limit reached. Your ${client.packageType} plan allows ${limits.sites} site(s). You currently have ${currentCount}.`,
        current: currentCount,
        limit: limits.sites,
        plan: client.packageType,
      });
    }

    next();
  } catch (err) {
    console.error("❌ checkSiteLimit error:", err.message);
    res.status(500).json({ success: false, message: "Site limit check failed" });
  }
};
