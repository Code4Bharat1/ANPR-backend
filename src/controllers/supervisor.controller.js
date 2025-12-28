// controllers/supervisor.controller.js
import Supervisor from "../models/supervisor.model.js";
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/**
 * Create Supervisor
 */
export const createSupervisor = async (req, res, next) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      siteId,
      shiftStart,
      shiftEnd,
    } = req.body;

    const supervisor = await Supervisor.create({
      name,
      email,
      mobile,
      password: await hashPassword(password),
      siteId,
      clientId: req.user.clientId,
      shiftStart,
      shiftEnd,
    });

    // attach supervisor to site
    if (siteId) {
      await Site.findByIdAndUpdate(siteId, {
        $addToSet: { supervisors: supervisor._id },
      });
    }

    await logAudit({
      req,
      action: "CREATE",
      module: "SUPERVISOR",
      newValue: supervisor,
    });

    res.status(201).json(supervisor);
  } catch (e) {
    next(e);
  }
};

/**
 * Get all supervisors
 */
export const getSupervisors = async (req, res, next) => {
  try {
    const supervisors = await Supervisor.find({
      clientId: req.user.clientId,
    })
      .populate("siteId", "name location")
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(supervisors);
  } catch (e) {
    next(e);
  }
};

/**
 * Assign / Change Site
 */
export const assignSite = async (req, res, next) => {
  try {
    const { siteId } = req.body;
    const supervisorId = req.params.id;

    const supervisor = await Supervisor.findById(supervisorId);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    // remove from old site
    if (supervisor.siteId) {
      await Site.findByIdAndUpdate(supervisor.siteId, {
        $pull: { supervisors: supervisor._id },
      });
    }

    // assign new site
    supervisor.siteId = siteId;
    await supervisor.save();

    await Site.findByIdAndUpdate(siteId, {
      $addToSet: { supervisors: supervisor._id },
    });

    await logAudit({
      req,
      action: "ASSIGN_SITE",
      module: "SUPERVISOR",
      newValue: supervisor,
    });

    res.json(supervisor);
  } catch (e) {
    next(e);
  }
};

/**
 * Enable / Disable Supervisor
 */
export const toggleSupervisor = async (req, res, next) => {
  try {
    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    supervisor.isActive = !supervisor.isActive;
    await supervisor.save();

    await logAudit({
      req,
      action: "TOGGLE",
      module: "SUPERVISOR",
      newValue: supervisor,
    });

    res.json(supervisor);
  } catch (e) {
    next(e);
  }
};

export const supervisorDashboard = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;

    const activeTrips = await Trip.countDocuments({
      siteId,
      status: "INSIDE",
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEntries = await Trip.countDocuments({
      siteId,
      entryAt: { $gte: today },
    });

    const todayExits = await Trip.countDocuments({
      siteId,
      exitAt: { $gte: today },
    });

    res.json({
      activeTrips,
      todayEntries,
      todayExits,
    });
  } catch (e) {
    next(e);
  }
};

