// controllers/supervisor.controller.js
import Supervisor from "../models/supervisor.model.js";
import ProjectManager from "../models/ProjectManager.model.js"; // Added missing import
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Vendor from "../models/Vendor.model.js";
import Vehicle from "../models/Vehicle.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import ClientModel from "../models/Client.model.js";
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

    if (!name || !email || !mobile || !password || !projectManagerId) {
      return res.status(400).json({
        message: "Required fields missing",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const pm = await ProjectManager.findById(projectManagerId).select("clientId");
    if (!pm) {
      return res.status(404).json({ message: "Project Manager not found" });
    }

    const existingSupervisor = await Supervisor.findOne({
      email: normalizedEmail,
    });
    if (existingSupervisor) {
      return res.status(409).json({
        message: "Supervisor with this email already exists",
      });
    }

    let site = null;
    if (siteId) {
      site = await Site.findOne({
        _id: siteId,
        clientId: pm.clientId,
      });

      if (!site) {
        return res.status(404).json({
          message: "Invalid site for this client",
        });
      }
    }

    const supervisor = await Supervisor.create({
      name,
      email: normalizedEmail,
      mobile,
      password: await hashPassword(password),
      siteId,
      clientId: pm.clientId,
      projectManagerId,
      shiftStart,
      shiftEnd,
      createdBy: req.user.id,
    });

    await ProjectManager.findByIdAndUpdate(
      projectManagerId,
      { $addToSet: { supervisors: supervisor._id } }
    );

    if (site) {
      await Site.findByIdAndUpdate(site._id, {
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
 * GET ALL SUPERVISORS
 * - Admin: all supervisors of client
 * - Client: all supervisors of client
 * - Project Manager: only assigned supervisors
 */
export const getAllSupervisors = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { role, clientId, id } = req.user;

    let filter = {};

    if (role === "admin" || role === "client") {
      // ✅ Admin & Client see all supervisors of their client
      filter.clientId = clientId;
    } else if (role === "project_manager") {
      // ✅ PM sees only assigned supervisors
      filter.projectManagerId = id;
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const supervisors = await Supervisor.find(filter)
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

    const OVERSTAY_MINUTES = 240;

    const trips = await Trip.find({
      siteId: new mongoose.Types.ObjectId(siteId),
      status: { $in: ["INSIDE", "active"] },
    })
      .populate("vendorId", "name")
      .populate(
        "vehicleId",
        "vehicleNumber vehicleType driverName driverPhone"
      )
      .sort({ entryAt: -1 })
      .lean();

    const now = Date.now();

    const formatted = trips.map((t) => {
      const entryTime = new Date(t.entryAt);
      const durationMinutes = Math.floor(
        (now - entryTime.getTime()) / (1000 * 60)
      );

      return {
        // 🔑 IDs
        _id: t._id?.toString(),                  // Trip ID (UI)
        tripId: t.tripId || "N/A",
        vehicleId: t.vehicleId?._id?.toString(), // ✅ FIX (Vehicle ID)

        // Vehicle
        vehicleNumber:
          t.vehicleId?.vehicleNumber || t.plateText || "Unknown",
        vehicleType: t.vehicleId?.vehicleType || "Unknown",

        // Relations
        vendor: t.vendorId?.name || "Unknown",

        // Driver
        driver: t.vehicleId?.driverName || "N/A",
        driverPhone: t.vehicleId?.driverPhone || "N/A",

        // Time
        entryTime: entryTime.toLocaleString(),
        entryTimeISO: entryTime.toISOString(),

        // Duration
        duration: `${Math.floor(durationMinutes / 60)}h ${
          durationMinutes % 60
        }m`,
        durationMinutes,

        // Status
        status: durationMinutes > OVERSTAY_MINUTES ? "overstay" : "loading",
        loadStatus: t.loadStatus || "FULL",
        purpose: t.purpose || "N/A",
        entryGate: t.entryGate || "N/A",

        entryMedia: t.entryMedia || null,
        exitMedia: t.exitMedia || null,
      };
    });

    return res.json({
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
 * SUPERVISOR ANALYTICS - FIXED VERSION
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

    // ============================================
    // FIX 1: DAILY TRENDS - Show all 7 days
    // ============================================
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
    ]);

    // Create a map of existing data
    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dataMap = {};
    dailyTrends.forEach((d) => {
      dataMap[d._id] = { entries: d.entries, exits: d.exits };
    });

    // Generate all 7 days with 0 for missing days
    const formattedDaily = dayMap.map((day, index) => {
      const dayOfWeek = index + 1; // MongoDB uses 1-7 (Sun-Sat)
      return {
        day: day,
        entries: dataMap[dayOfWeek]?.entries || 0,
        exits: dataMap[dayOfWeek]?.exits || 0,
      };
    });

    // ============================================
    // HOURLY TRENDS (unchanged but optimized)
    // ============================================
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

    // ============================================
    // PEAK HOUR LOGIC EXPLANATION
    // ============================================
    /**
     * Peak Hour Logic:
     * 1. Find the hour with maximum vehicle entries
     * 2. Format as a time range (e.g., "14:00 - 15:00")
     * 3. This helps identify busiest traffic periods
     * 
     * Example: If most vehicles entered at 14:00 (2 PM),
     * peak hour will be "14:00 - 15:00"
     */
    const peak = formattedHourly.reduce(
      (max, curr) => (curr.count > max.count ? curr : max),
      { hour: "00:00", count: 0 }
    );

    const peakHour = peak.hour && peak.count > 0
      ? `${peak.hour} - ${String(Number(peak.hour.split(":")[0]) + 1).padStart(2, "0")}:00`
      : "--";

    // ============================================
    // FIX 2: VEHICLE TYPES - Add actual data
    // ============================================
    const vehicleTypesData = await Trip.aggregate([
      {
        $match: {
          siteId: new mongoose.Types.ObjectId(siteId),
          entryAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$vehicleType",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Calculate total for percentage
    const totalVehicles = vehicleTypesData.reduce((sum, v) => sum + v.count, 0);

    const vehicleTypes = vehicleTypesData.map((v) => ({
      type: v._id || "Unknown",
      count: v.count,
      percentage: totalVehicles > 0 ? Math.round((v.count / totalVehicles) * 100) : 0,
    }));

    // ============================================
    // FIX 3: TOP VENDORS - Populate vendor names
    // ============================================
    const topVendorsData = await Trip.aggregate([
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
      {
        $lookup: {
          from: "vendors", // Your vendor collection name
          localField: "_id",
          foreignField: "_id",
          as: "vendorInfo",
        },
      },
      {
        $unwind: {
          path: "$vendorInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ["$vendorInfo.companyName", "Unknown Vendor"] },
          trips: 1,
        },
      },
    ]);

    // Calculate percentages
    const totalTopVendorTrips = topVendorsData.reduce((sum, v) => sum + v.trips, 0);
    
    const topVendors = topVendorsData.map((v) => ({
      name: v.name,
      trips: v.trips,
      percentage: totalTopVendorTrips > 0 
        ? Math.round((v.trips / totalTopVendorTrips) * 100) 
        : 0,
    }));

    // ============================================
    // CALCULATE TIME IMPROVEMENT
    // ============================================
    // Get last period's average for comparison
    const lastPeriodStart = new Date(startDate);
    lastPeriodStart.setDate(lastPeriodStart.getDate() - 7);
    
    const lastPeriodTrips = await Trip.find({
      siteId,
      exitAt: { $ne: null },
      entryAt: { $gte: lastPeriodStart, $lt: startDate },
    });

    let lastPeriodMinutes = 0;
    lastPeriodTrips.forEach((t) => {
      lastPeriodMinutes += (t.exitAt - t.entryAt) / (1000 * 60);
    });

    const lastAvgMinutes =
      lastPeriodTrips.length > 0
        ? Math.round(lastPeriodMinutes / lastPeriodTrips.length)
        : avgMinutes;

    const timeImprovement = lastAvgMinutes - avgMinutes;

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
        timeImprovement: Math.max(0, timeImprovement), // Only show if improved
      },
      dailyTrends: formattedDaily,
      hourlyTrends: formattedHourly,
      vehicleTypes: vehicleTypes, // ✅ Now populated
      topVendors: topVendors, // ✅ Now includes names
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

// Add this function at the end of your supervisor.controller.js file
export const exportAnalyticsReport = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;
    const { period = "last7days" } = req.query;

    if (!siteId) {
      return res.status(400).json({ message: "Site not assigned" });
    }

    // Date range based on period
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
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    }

    const endDate = new Date();

    // Get trips for the selected period
    const trips = await Trip.find({
      siteId,
      entryAt: { $gte: startDate, $lte: endDate },
    })
      .populate("vehicleId", "vehicleNumber vehicleType")
      .populate("vendorId", "name")
      .sort({ entryAt: -1 })
      .lean();

    // Get site info
    const site = await Site.findById(siteId).lean();

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    
    // Add a worksheet
    const worksheet = workbook.addWorksheet('Analytics Report');
    
    // Add headers
    worksheet.columns = [
      { header: 'Trip ID', key: 'tripId', width: 20 },
      { header: 'Vehicle Number', key: 'vehicleNumber', width: 20 },
      { header: 'Vehicle Type', key: 'vehicleType', width: 15 },
      { header: 'Vendor', key: 'vendor', width: 20 },
      { header: 'Entry Time', key: 'entryTime', width: 25 },
      { header: 'Exit Time', key: 'exitTime', width: 25 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Purpose', key: 'purpose', width: 15 },
      { header: 'Gate', key: 'gate', width: 15 },
    ];

    // Add data rows
    trips.forEach(trip => {
      worksheet.addRow({
        tripId: trip.tripId || `TRP-${trip._id.toString().slice(-6)}`,
        vehicleNumber: trip.vehicleId?.vehicleNumber || trip.plateText || 'N/A',
        vehicleType: trip.vehicleId?.vehicleType || 'N/A',
        vendor: trip.vendorId?.name || 'N/A',
        entryTime: trip.entryAt ? new Date(trip.entryAt).toLocaleString() : 'N/A',
        exitTime: trip.exitAt ? new Date(trip.exitAt).toLocaleString() : 'N/A',
        status: trip.status,
        purpose: trip.purpose || 'N/A',
        gate: trip.entryGate || trip.exitGate || 'N/A'
      });
    });

    // Add summary at the beginning
    worksheet.insertRow(1, ['Site Analytics Report']);
    worksheet.insertRow(2, ['']);
    worksheet.insertRow(3, ['Site:', site?.name || 'Unknown']);
    worksheet.insertRow(4, ['Period:', period]);
    worksheet.insertRow(5, ['Date Range:', `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`]);
    worksheet.insertRow(6, ['Total Trips:', trips.length]);
    worksheet.insertRow(7, ['Generated On:', new Date().toLocaleString()]);
    worksheet.insertRow(8, ['']);

    // Style the header
    worksheet.getRow(10).font = { bold: true };

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    
    const filename = `analytics-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    // Send the Excel file
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Export analytics error:', err);
    next(err);
  }
};
// backend controller (supervisorController.js)
export const getSupervisorVendors = async (req, res) => {
  try {
    // Get sites assigned to supervisor
    // const assignedSites = await Site.find({ 
    //   supervisors: req.user.id 
    // }).select('_id');

    const assignedSite = await Supervisor.findById(req.user.id).select('siteId');
    console.log(assignedSite);
    
    // const siteIds = assignedSites.map(site => site._id);
    
    // Get vendors assigned to these sites
    const vendors = await Vendor.find({
      assignedSites: { $in: assignedSite.siteId },
      isActive: true
    })
    .select('name email phone address')
    .sort({ name: 1 });

    console.log(vendors);
    
    res.status(200).json({
      success: true,
      data: vendors
    });
  } catch (error) {
    console.error('Error fetching supervisor vendors:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch vendors',
      error: error.message 
    });
  }
};