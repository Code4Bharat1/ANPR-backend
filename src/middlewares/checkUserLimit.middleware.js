import Client from "../models/Client.model.js";
import ProjectManagerModel from "../models/ProjectManager.model.js";
import SupervisorModel from "../models/supervisor.model.js";
import { PLANS } from "../config/plans.js";
export const checkUserLimit = (role) => async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const client = await Client.findById(clientId);
    
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const packageLimits = PLANS[client.packageType] || PLANS.LITE;
    const allowed = packageLimits.limits[role] ?? 0;

    let currentCount = 0;
    if (role === "pm") {
      currentCount = await ProjectManagerModel.countDocuments({ clientId, isActive: true });
    }
    if (role === "supervisor") {
      currentCount = await SupervisorModel.countDocuments({ clientId, isActive: true });
    }

    if (currentCount >= allowed) {
      return res.status(403).json({
        message: `Limit exceeded: Only ${allowed} ${role}(s) allowed in your plan`
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};