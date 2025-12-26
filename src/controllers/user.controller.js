import Admin from "../models/admin.model.js";
import ProjectManager from "../models/ProjectManager.model.js";
import Supervisor from "../models/supervisor.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/**
 * SuperAdmin creates Admin for a client
 */
export const createAdmin = async (req, res, next) => {
  try {
    const { name, email, password, clientId } = req.body;

    const admin = await Admin.create({
      name,
      email,
      password: await hashPassword(password),
      createdBy: req.user.id,
      clientId,
    });

    await logAudit({ req, action: "CREATE", module: "ADMIN", newValue: admin });

    res.status(201).json(admin);
  } catch (e) {
    next(e);
  }
};

/**
 * Admin creates Project Manager
 */
export const createProjectManager = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const pm = await ProjectManager.create({
      name,
      email,
      password: await hashPassword(password),
      adminId: req.user.id,
      clientId: req.user.clientId,
    });

    await logAudit({ req, action: "CREATE", module: "PROJECT_MANAGER", newValue: pm });

    res.status(201).json(pm);
  } catch (e) {
    next(e);
  }
};

/**
 * Admin or PM creates Supervisor
 */
export const createSupervisor = async (req, res, next) => {
  try {
    const { name, email, password, projectManagerId, siteId } = req.body;

    // If PM creating, force projectManagerId = self
    const pmId = req.user.role === "project_manager" ? req.user.id : projectManagerId;

    const supervisor = await Supervisor.create({
      name,
      email,
      password: await hashPassword(password),
      projectManagerId: pmId,
      siteId,
      clientId: req.user.clientId,
    });

    await logAudit({ req, action: "CREATE", module: "SUPERVISOR", newValue: supervisor });

    res.status(201).json(supervisor);
  } catch (e) {
    next(e);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    const pms = await ProjectManager.find({ clientId }).select("-password").sort({ createdAt: -1 });
    const supervisors = await Supervisor.find({ clientId }).select("-password").sort({ createdAt: -1 });
    const admins = await Admin.find({ clientId }).select("-password").sort({ createdAt: -1 });

    res.json({ admins, projectManagers: pms, supervisors });
  } catch (e) {
    next(e);
  }
};

export const toggleSupervisor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sup = await Supervisor.findById(id);
    if (!sup) return res.status(404).json({ message: "Supervisor not found" });

    if (String(sup.clientId) !== String(req.user.clientId)) return res.status(403).json({ message: "Forbidden" });

    sup.isActive = !sup.isActive;
    await sup.save();

    await logAudit({ req, action: "TOGGLE", module: "SUPERVISOR", newValue: sup });

    res.json(sup);
  } catch (e) {
    next(e);
  }
};
