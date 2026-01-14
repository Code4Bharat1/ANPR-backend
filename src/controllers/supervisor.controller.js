// controllers/supervisor.controller.js
import Supervisor from "../models/supervisor.model.js";
import ProjectManager from "../models/ProjectManager.model.js"; // Added missing import
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Vehicle from "../models/Vehicle.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import mongoose from "mongoose";

/**
 * CREATE SUPERVISOR
 */
export const createSupervisor = async (req, res, next) => {
  try {
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      name,
      email,
      mobile,
      password,
      siteId,
      projectManagerId,
      shiftStart,
      shiftEnd,
    } = req.body;

    // Validate required fields
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ 
        message: "Name, email, mobile and password are required" 
      });
    }

    if (!projectManagerId) {
      return res.status(400).json({ 
        message: "Project Manager is required" 
      });
    }

    // ✅ Fetch PM to get clientId
    const pm = await ProjectManager.findById(projectManagerId).select("clientId");
    if (!pm) {
      return res.status(404).json({ message: "Project Manager not found" });
    }

    // Check if email already exists
    const existingSupervisor = await Supervisor.findOne({ email });
    if (existingSupervisor) {
      return res.status(409).json({ 
        message: "Supervisor with this email already exists" 
      });
    }

    const supervisor = await Supervisor.create({
      name,
      email,
      mobile,
      password: await hashPassword(password),
      siteId,
      clientId: pm.clientId, // ✅ AUTO SET from PM
      projectManagerId,
      shiftStart,
      shiftEnd,
      createdBy: req.user.id,
    });

    // Attach supervisor to project manager
    await ProjectManager.findByIdAndUpdate(
      projectManagerId,
      { $addToSet: { supervisors: supervisor._id } }
    );

    // Attach supervisor to site
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

    res.status(201).json({
      message: "Supervisor created successfully",
      data: supervisor,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL SUPERVISORS (Client Admin)
 */
export const getSupervisors = async (req, res, next) => {
  try {
    // 🔐 Safety checks
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const clientId = req.user.clientId;

    const supervisors = await Supervisor.find({ clientId })
      .populate("siteId", "name location")
      .populate("projectManagerId", "name email")
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({
      count: supervisors.length,
      data: supervisors,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE SUPERVISOR (Client / Admin)
 */
export const updateSupervisor = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🛑 ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Supervisor ID" });
    }

    const supervisor = await Supervisor.findById(id);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    /**
     * 🔐 AUTHORIZATION
     * Client → only same client supervisors
     * Admin  → all supervisors
     */
    if (
      req.user.role === "client" &&
      String(supervisor.clientId) !== String(req.user.clientId)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ✅ Allowed fields only
    const {
      name,
      email,
      mobile,
      address,
      status,
      siteId,
      projectManagerId,
      isActive,
      shiftStart,
      shiftEnd,
    } = req.body;

    const oldValue = supervisor.toObject();

    if (name !== undefined) supervisor.name = name;
    if (email !== undefined) supervisor.email = email.toLowerCase().trim();
    if (mobile !== undefined) supervisor.mobile = mobile;

    // 🔐 Address safe update
    if (address !== undefined && address.trim() !== "") {
      supervisor.address = address;
    }

    if (status !== undefined) supervisor.status = status;
    if (siteId !== undefined) supervisor.siteId = siteId;
    if (projectManagerId !== undefined) supervisor.projectManagerId = projectManagerId;
    if (isActive !== undefined) supervisor.isActive = isActive;
    if (shiftStart !== undefined) supervisor.shiftStart = shiftStart;
    if (shiftEnd !== undefined) supervisor.shiftEnd = shiftEnd;

    supervisor.updatedBy = req.user.id;
    supervisor.updatedAt = new Date();

    await supervisor.save();

    await logAudit({
      req,
      action: "UPDATE",
      module: "SUPERVISOR",
      oldValue: oldValue,
      newValue: supervisor,
    });

    res.json({
      success: true,
      message: "Supervisor updated successfully",
      data: {
        id: supervisor._id,
        name: supervisor.name,
        email: supervisor.email,
        mobile: supervisor.mobile,
        status: supervisor.status,
        siteId: supervisor.siteId,
        projectManagerId: supervisor.projectManagerId,
        isActive: supervisor.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ASSIGN / CHANGE SITE
 */
export const assignSite = async (req, res, next) => {
  try {
    const { siteId } = req.body;
    const supervisorId = req.params.id;

    if (!siteId) {
      return res.status(400).json({ message: "Site ID is required" });
    }

    const supervisor = await Supervisor.findById(supervisorId);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    // Check authorization
    if (String(supervisor.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const oldValue = supervisor.toObject();

    // Remove from old site
    if (supervisor.siteId) {
      await Site.findByIdAndUpdate(supervisor.siteId, {
        $pull: { supervisors: supervisor._id },
      });
    }

    // Assign new site
    supervisor.siteId = siteId;
    supervisor.updatedBy = req.user.id;
    supervisor.updatedAt = new Date();
    await supervisor.save();

    // Add to new site
    await Site.findByIdAndUpdate(siteId, {
      $addToSet: { supervisors: supervisor._id },
    });

    await logAudit({
      req,
      action: "ASSIGN_SITE",
      module: "SUPERVISOR",
      oldValue: oldValue,
      newValue: supervisor,
    });

    res.json({
      success: true,
      message: "Site assigned successfully",
      data: supervisor,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * ENABLE / DISABLE SUPERVISOR
 */
export const toggleSupervisor = async (req, res, next) => {
  try {
    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    // Check authorization
    if (String(supervisor.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const oldValue = supervisor.toObject();
    supervisor.isActive = !supervisor.isActive;
    supervisor.updatedBy = req.user.id;
    supervisor.updatedAt = new Date();
    await supervisor.save();

    await logAudit({
      req,
      action: "TOGGLE",
      module: "SUPERVISOR",
      oldValue: oldValue,
      newValue: supervisor,
    });

    res.json({
      success: true,
      message: `Supervisor ${supervisor.isActive ? 'enabled' : 'disabled'} successfully`,
      data: supervisor,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET SUPERVISOR DASHBOARD
 */
export const supervisorDashboard = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;

    // Enhanced error checking
    if (!siteId) {
      return res.status(400).json({
        success: false,
        message: "Supervisor not assigned to any site",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const [
        vehiclesInside,
        todayEntry,
        todayExit,
        pendingExit,
        deniedEntries,
        recentTrips,
        site,
      ] = await Promise.all([
        // Vehicles currently inside
        Trip.countDocuments({ 
          siteId: new mongoose.Types.ObjectId(siteId), 
          status: "INSIDE" 
        }),

        // Today's entries
        Trip.countDocuments({
          siteId: new mongoose.Types.ObjectId(siteId),
          entryAt: { $gte: today },
        }),

        // Today's exits
        Trip.countDocuments({
          siteId: new mongoose.Types.ObjectId(siteId),
          status: "EXITED",
          exitAt: { $gte: today },
        }),

        // Pending exit (INSIDE vehicles)
        Trip.countDocuments({
          siteId: new mongoose.Types.ObjectId(siteId),
          status: "INSIDE",
        }),

        // Denied entries
        Trip.countDocuments({
          siteId: new mongoose.Types.ObjectId(siteId),
          status: "DENIED",
          entryAt: { $gte: today },
        }),

        // Recent trips with proper population
        Trip.find({ siteId: new mongoose.Types.ObjectId(siteId) })
          .sort({ entryAt: -1 })
          .limit(10)
          .populate("vehicleId", "vehicleNumber vehicleType")
          .populate("vendorId", "name")
          .lean(),

        // Site info
        Site.findById(siteId).lean(),
      ]);

      if (!site) {
        return res.status(404).json({
          success: false,
          message: "Assigned site not found",
        });
      }

      // Format recent activity
      const recentActivity = (recentTrips || []).map((t) => {
        const vehicleNumber = t.vehicleId?.vehicleNumber || t.plateText || "Unknown";
        const entryTime = t.entryAt || t.createdAt;
        
        return {
          id: t._id?.toString(),
          tripId: t.tripId || "N/A",
          vehicleNumber,
          vehicleType: t.vehicleId?.vehicleType || "Unknown",
          vendor: t.vendorId?.name || "Unknown",
          type: t.status === "EXITED" ? "exit" : "entry",
          status: t.status === "DENIED" ? "denied" : "allowed",
          gate: t.status === "EXITED"
            ? t.exitGate || "Unknown Gate"
            : t.entryGate || "Unknown Gate",
          visitor: t.purpose || "Vehicle",
          time: entryTime ? new Date(entryTime).toLocaleTimeString() : "N/A",
          fullDate: entryTime,
          loadStatus: t.loadStatus || "FULL"
        };
      });

      res.json({
        success: true,
        stats: {
          todayEntry,
          todayExit,
          vehiclesInside,
          pendingExit,
          deniedEntries,
        },
        recentActivity,
        siteInfo: {
          id: site._id?.toString(),
          name: site.name,
          gates: site.gates?.length || 0,
          shift: "Day Shift",
          status: site.status || "Active",
        },
      });

    } catch (queryError) {
      console.error('Dashboard query error:', queryError);
      throw queryError;
    }

  } catch (err) {
    console.error('Dashboard error:', err);
    next(err);
  }
};

/**
 * GET ACTIVE VEHICLES
 */
export const getActiveVehicles = async (req, res, next) => {
  try {
    const siteId = req.query.siteId || req.user?.siteId;

    if (!siteId) {
      return res.status(400).json({
        success: false,
        message: "Site ID is required",
      });
    }

    const OVERSTAY_MINUTES = 240; // 4 hours

    const trips = await Trip.find({
      siteId: new mongoose.Types.ObjectId(siteId),
      status: { $in: ["INSIDE", "active"] },
    })
      .populate("vendorId", "name")
      .populate("vehicleId", "vehicleNumber vehicleType driverName driverPhone")
      .sort({ entryAt: -1 })
      .lean();

    const now = Date.now();

    const formatted = trips.map((t) => {
      const entryTime = new Date(t.entryAt);
      const durationMinutes = Math.floor((now - entryTime.getTime()) / (1000 * 60));

      return {
        _id: t._id?.toString(),
        tripId: t.tripId || "N/A",
        vehicleNumber: t.vehicleId?.vehicleNumber || t.plateText || "Unknown",
        vehicleType: t.vehicleId?.vehicleType || "Unknown",
        vendor: t.vendorId?.name || "Unknown",
        driver: t.vehicleId?.driverName || "N/A",
        driverPhone: t.vehicleId?.driverPhone || "N/A",
        entryTime: entryTime.toLocaleString(),
        entryTimeISO: entryTime.toISOString(),
        duration: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`,
        durationMinutes,
        status: durationMinutes > OVERSTAY_MINUTES ? "overstay" : "loading",
        loadStatus: t.loadStatus || "FULL",
        purpose: t.purpose || "N/A",
        entryGate: t.entryGate || "N/A",
      };
    });

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    console.error("Get active vehicles error:", err);
    next(err);
  }
};


/**
 * SUPERVISOR ANALYTICS
 */
export const supervisorAnalytics = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;
    const { period = "last7days" } = req.query;

    if (!siteId) {
      return res.status(400).json({ message: "Site not assigned" });
    }

    // Date range
    const now = new Date();
    let startDate;

    switch (period) {
      case "today":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case "last7days":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "last30days":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "thismonth":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    }

    // Basic counts
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTrips = await Trip.countDocuments({
      siteId,
      entryAt: { $gte: todayStart },
    });

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const yesterdayTrips = await Trip.countDocuments({
      siteId,
      entryAt: { $gte: yesterdayStart, $lt: todayStart },
    });

    const todayChange =
      yesterdayTrips === 0
        ? 100
        : Math.round(((todayTrips - yesterdayTrips) / yesterdayTrips) * 100);

    const weekTrips = await Trip.countDocuments({
      siteId,
      entryAt: { $gte: startDate },
    });

    const totalEntries = weekTrips;
    const totalExits = await Trip.countDocuments({
      siteId,
      exitAt: { $gte: startDate },
    });

    const activeVehicles = await Trip.countDocuments({
      siteId,
      status: "INSIDE",
    });

    // Avg duration
    const completedTrips = await Trip.find({
      siteId,
      exitAt: { $ne: null },
      entryAt: { $gte: startDate },
    });

    let totalMinutes = 0;
    completedTrips.forEach((t) => {
      totalMinutes += (t.exitAt - t.entryAt) / (1000 * 60);
    });

    const avgMinutes =
      completedTrips.length > 0
        ? Math.round(totalMinutes / completedTrips.length)
        : 0;

    const avgDuration = `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m`;

    // Daily trends
    const dailyTrends = await Trip.aggregate([
      {
        $match: {
          siteId: new mongoose.Types.ObjectId(siteId),
          entryAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: "$entryAt" },
          entries: { $sum: 1 },
          exits: {
            $sum: { $cond: [{ $ne: ["$exitAt", null] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          day: "$_id",
          entries: 1,
          exits: 1,
        },
      },
    ]);

    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const formattedDaily = dailyTrends.map((d) => ({
      day: dayMap[d.day - 1],
      entries: d.entries,
      exits: d.exits,
    }));

    // Hourly trends
    const hourlyTrends = await Trip.aggregate([
      {
        $match: {
          siteId: new mongoose.Types.ObjectId(siteId),
          entryAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $hour: "$entryAt" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const formattedHourly = hourlyTrends.map((h) => ({
      hour: `${String(h._id).padStart(2, "0")}:00`,
      count: h.count,
    }));

    // Peak hour
    const peak = formattedHourly.reduce(
      (max, curr) => (curr.count > max.count ? curr : max),
      { count: 0 }
    );

    const peakHour = peak.hour
      ? `${peak.hour} - ${String(Number(peak.hour.split(":")[0]) + 1).padStart(2, "0")}:00`
      : "--";

    // Top vendors
    const topVendors = await Trip.aggregate([
      {
        $match: {
          siteId: new mongoose.Types.ObjectId(siteId),
          entryAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$vendorId",
          trips: { $sum: 1 },
        },
      },
      { $sort: { trips: -1 } },
      { $limit: 5 },
    ]);

    // Response
    res.json({
      analytics: {
        todayTrips,
        todayChange,
        weekTrips,
        avgProcessingTime: avgDuration,
        peakHour,
        totalEntries,
        totalExits,
        activeVehicles,
        avgDuration,
      },
      dailyTrends: formattedDaily,
      hourlyTrends: formattedHourly,
      topVendors,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET MY ASSIGNED SITE
 */
export const getMyAssignedSite = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;

    if (!siteId) {
      return res.status(404).json({
        success: false,
        message: "No site assigned to this supervisor",
      });
    }

    const site = await Site.findById(siteId)
      .populate("clientId", "name email")
      .populate("projectId", "name");

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Assigned site not found",
      });
    }

    res.status(200).json({
      success: true,
      data: site,
    });
  } catch (error) {
    next(error);
  }
};