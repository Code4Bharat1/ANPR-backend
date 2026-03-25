/**
 * FR-9.1 — User Limit Enforcement Middleware
 *
 * Checks PM and supervisor counts against plan limits (with FR-9.4 overrides).
 * Usage: checkUserLimit("pm") or checkUserLimit("supervisor")
 */

import Client from "../models/Client.model.js";
import ProjectManagerModel from "../models/ProjectManager.model.js";
import SupervisorModel from "../models/supervisor.model.js";
import { getPlanLimits } from "../utils/planFeatures.util.js";

export const checkUserLimit = (role) => async (req, res, next) => {
  try {
    const clientId = req.user?.clientId || req.body?.clientId;
    const client = await Client.findById(clientId).lean();

    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    // FR-9.4: getPlanLimits merges plan defaults with per-client overrides
    const limits = getPlanLimits(client);
    const allowed = limits[role] ?? 0;

    let currentCount = 0;
    if (role === "pm") {
      currentCount = await ProjectManagerModel.countDocuments({ clientId, isActive: true });
    } else if (role === "supervisor") {
      currentCount = await SupervisorModel.countDocuments({ clientId, isActive: true });
    }

    if (currentCount >= allowed) {
      return res.status(403).json({
        success: false,
        code: "USER_LIMIT_EXCEEDED",
        message: `Limit reached: your ${client.packageType} plan allows ${allowed} ${role}(s). You currently have ${currentCount}.`,
        current: currentCount,
        limit: allowed,
        plan: client.packageType,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
