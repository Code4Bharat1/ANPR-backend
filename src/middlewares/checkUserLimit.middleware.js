import Client from "../models/Client.model.js";
import ProjectManagerModel from "../models/ProjectManager.model.js";
import SupervisorModel from "../models/supervisor.model.js";

export const checkUserLimit = (role) => async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    let currentCount = 0;

    // ✅ Count based on role
    if (role === "pm") {
      currentCount = await ProjectManagerModel.countDocuments({
        clientId,
        isActive: true,
      });
    }

    if (role === "supervisor") {
      currentCount = await SupervisorModel.countDocuments({
        clientId,
        isActive: true,
      });
    }

    const allowed = client.userLimits?.[role] ?? 0;

    if (currentCount >= allowed) {
      return res.status(403).json({
        message: `Limit exceeded: Only ${allowed} ${role}(s) allowed in your plan`,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
