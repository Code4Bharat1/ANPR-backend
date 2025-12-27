// controllers/projectManager.controller.js
import ProjectManager from "../models/ProjectManager.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/**
 * Admin → Create Project Manager
 */
export const createProjectManager = async (req, res, next) => {
  try {
    // ✅ Role safety (Admin OR Client)
    if (!req.user || !["admin", "client"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Only admin or client can create project manager",
      });
    }

    // ✅ clientId must come from token
    if (!req.user.clientId) {
      return res.status(400).json({ message: "ClientId missing in token" });
    }

    const { name, email, mobile, password, assignedSites } = req.body;

    // ✅ Basic validations
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const pm = await ProjectManager.create({
      name,
      email,
      mobile,
      password: await hashPassword(password),
      assignedSites: assignedSites || [],
      adminId: req.user.id,
      clientId: req.user.clientId, // 🔥 ALWAYS FROM TOKEN
    });

    await logAudit({
      req,
      action: "CREATE",
      module: "PROJECT_MANAGER",
      newValue: pm,
    });

    res.status(201).json({
      message: "Project Manager created successfully",
      data: pm,
    });
  } catch (e) {
    next(e);
  }
};



/**
 * List all PMs (Admin / SuperAdmin)
 */
export const listProjectManagers = async (req, res, next) => {
  try {
    const pms = await ProjectManager.find({
      clientId: req.user.clientId,
    })
      .populate("assignedSites", "name location")
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(pms);
  } catch (e) {
    next(e);
  }
};

/**
 * Update PM (assign sites / details)
 */
export const updateProjectManager = async (req, res, next) => {
  try {
    const { id } = req.params;

    const old = await ProjectManager.findById(id);
    if (!old) return res.status(404).json({ message: "PM not found" });

    const updated = await ProjectManager.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );

    await logAudit({
      req,
      action: "UPDATE",
      module: "PROJECT_MANAGER",
      oldValue: old,
      newValue: updated,
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/**
 * Enable / Disable PM
 */
export const toggleProjectManager = async (req, res, next) => {
  try {
    const pm = await ProjectManager.findById(req.params.id);
    if (!pm) return res.status(404).json({ message: "PM not found" });

    pm.isActive = !pm.isActive;
    await pm.save();

    await logAudit({
      req,
      action: "TOGGLE",
      module: "PROJECT_MANAGER",
      newValue: pm,
    });

    res.json(pm);
  } catch (e) {
    next(e);
  }
};
