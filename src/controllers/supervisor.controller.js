// controllers/supervisor.controller.js
import Supervisor from "../models/supervisor.model.js";
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Vehicle from "../models/Vehicle.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";


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
    // ✅ supervisor is always assigned to ONE site
    const siteId = req.user.siteId;

    if (!siteId) {
      return res.status(400).json({ message: "Supervisor not assigned to any site" });
    }

    /* ==========================
       DATE RANGE (TODAY)
    ========================== */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    /* ==========================
       TRIP STATS
    ========================== */

    const vehiclesInside = await Trip.countDocuments({
      siteId,
      status: "INSIDE",
    });

    const todayEntry = await Trip.countDocuments({
      siteId,
      entryAt: { $gte: today },
    });

    const todayExit = await Trip.countDocuments({
      siteId,
      exitAt: { $gte: today },
    });

    const pendingExit = await Trip.countDocuments({
      siteId,
      status: "INSIDE",
      exitExpectedAt: { $exists: true },
    });

    const deniedEntries = await Trip.countDocuments({
      siteId,
      status: "DENIED",
      entryAt: { $gte: today },
    });

    /* ==========================
       RECENT ACTIVITY (LAST 10)
    ========================== */
    const recentTrips = await Trip.find({ siteId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentActivity = recentTrips.map(t => ({
      id: t._id,
      vehicleNumber: t.vehicleNumber,
      type: t.entryType === "ENTRY" ? "entry" : "exit",
      status: t.status === "DENIED" ? "denied" : "allowed",
      gate: t.gateName || "Main Gate",
      visitor: t.visitorType || "Unknown",
      time: new Date(t.createdAt).toLocaleTimeString(),
    }));

    /* ==========================
       SITE INFO
    ========================== */
    const site = await Site.findById(siteId).lean();

    const siteInfo = {
      name: site?.name || "Assigned Site",
      gates: site?.gates?.length || 1,
      shift: "Day Shift",
      status: "Active",
    };

    /* ==========================
       FINAL RESPONSE (🔥 MATCHES UI)
    ========================== */
    res.json({
      stats: {
        todayEntry,
        todayExit,
        vehiclesInside,
        pendingExit,
        deniedEntries,
      },
      recentActivity,
      siteInfo,
    });

  } catch (e) {
    next(e);
  }
};




export const getTripHistory = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;
    const { period } = req.query;

    if (!siteId) {
      return res.status(400).json({
        message: "Supervisor not assigned to site",
      });
    }

    /* ---------------- DATE FILTER ---------------- */
    const now = new Date();
    let startDate = null;

    switch (period) {
      case "today":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;

      case "last7days":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;

      case "last30days":
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;

      case "thismonth":
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        break;

      default:
        startDate = null;
    }

    const query = { siteId };
    if (startDate) {
      query.entryAt = { $gte: startDate };
    }

    /* ---------------- FETCH TRIPS ---------------- */
    const trips = await Trip.find(query)
      .populate("vendorId", "name")
      .sort({ entryAt: -1 })
      .lean();

    /* ---------------- FORMAT FOR UI ---------------- */
    const formattedTrips = trips.map((trip) => {
      let status = "active";

      if (trip.status === "EXITED" || trip.status === "completed") {
        status = "completed";
      }
      if (trip.status === "cancelled") {
        status = "denied";
      }

      let duration = "--";
      if (trip.exitAt) {
        const diff = new Date(trip.exitAt) - new Date(trip.entryAt);
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        duration = `${h}h ${m}m`;
      }

      return {
        _id: trip._id,

        // UI expects this
        tripId: `#${trip.tripId}`,
        vehicleNumber: trip.plateText,
        vendor: trip.vendorId?.name || "Unknown",
        driver: "N/A",

        entryTime: new Date(trip.entryAt).toLocaleString(),
        exitTime: trip.exitAt
          ? new Date(trip.exitAt).toLocaleString()
          : "--",

        duration,
        status,
        materialType: trip.purpose || "N/A",
      };
    });

    res.json({
      data: formattedTrips,
    });
  } catch (err) {
    next(err);
  }
};

export const exportTripHistory = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;
    const { period = "last7days", format = "csv" } = req.query;

    if (!siteId) {
      return res.status(400).json({
        message: "Supervisor not assigned to site",
      });
    }

    /* ---------------- DATE FILTER ---------------- */
    const now = new Date();
    let startDate = null;

    switch (period) {
      case "today":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;

      case "last7days":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;

      case "last30days":
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;

      case "thismonth":
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        break;
    }

    const query = { siteId };
    if (startDate) {
      query.entryAt = { $gte: startDate };
    }

    /* ---------------- FETCH TRIPS ---------------- */
    const trips = await Trip.find(query)
      .populate("vendorId", "name")
      .sort({ entryAt: -1 })
      .lean();

    const rows = trips.map((t) => {
      let duration = "--";
      if (t.exitAt) {
        const diff = new Date(t.exitAt) - new Date(t.entryAt);
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        duration = `${h}h ${m}m`;
      }

      return {
        Trip_ID: t.tripId,
        Vehicle_Number: t.plateText,
        Vendor: t.vendorId?.name || "Unknown",
        Entry_Time: new Date(t.entryAt).toLocaleString(),
        Exit_Time: t.exitAt ? new Date(t.exitAt).toLocaleString() : "--",
        Duration: duration,
        Status: t.status,
        Purpose: t.purpose || "",
      };
    });

    /* ---------------- CSV EXPORT ---------------- */
    if (format === "csv") {
      const parser = new Parser();
      const csv = parser.parse(rows);

      res.header("Content-Type", "text/csv");
      res.attachment(`trip-history-${Date.now()}.csv`);
      return res.send(csv);
    }

    /* ---------------- EXCEL EXPORT ---------------- */
    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Trip History");

      sheet.columns = Object.keys(rows[0] || {}).map((key) => ({
        header: key.replace(/_/g, " "),
        key,
        width: 25,
      }));

      rows.forEach((row) => sheet.addRow(row));

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=trip-history-${Date.now()}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    res.status(400).json({ message: "Invalid export format" });
  } catch (err) {
    next(err);
  }
};
export const supervisorAnalytics = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;
    const { period = "last7days" } = req.query;

    if (!siteId) {
      return res.status(400).json({ message: "Site not assigned" });
    }

    /* ---------------- DATE RANGE ---------------- */
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

    /* ---------------- BASIC COUNTS ---------------- */
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

    /* ---------------- AVG DURATION ---------------- */
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

    /* ---------------- DAILY TRENDS ---------------- */
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

    /* ---------------- HOURLY TRENDS ---------------- */
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

    /* ---------------- PEAK HOUR ---------------- */
    const peak = formattedHourly.reduce(
      (max, curr) => (curr.count > max.count ? curr : max),
      { count: 0 }
    );

    const peakHour = peak.hour
      ? `${peak.hour} - ${String(Number(peak.hour.split(":")[0]) + 1).padStart(
          2,
          "0"
        )}:00`
      : "--";

    /* ---------------- TOP VENDORS ---------------- */
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

    /* ---------------- RESPONSE ---------------- */
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



export const getActiveVehicles = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;

    const trips = await Trip.find({
      siteId,
      status: "INSIDE",
    })
      .populate("vendorId", "name")
      .populate("vehicleId", "vehicleNumber vehicleType")
      .sort({ entryAt: -1 });

    const formatted = trips.map((t) => {
      const durationMinutes = Math.floor(
        (Date.now() - new Date(t.entryAt)) / (1000 * 60)
      );

      return {
        _id: t._id,
        vehicleNumber: t.plateText,
        vehicleType: t.vehicleId?.vehicleType || "Unknown",
        vendor: t.vendorId?.name || "Unknown",
        driver: t.driverName || "N/A",
        entryTime: t.entryAt.toLocaleTimeString(),
        duration: `${Math.floor(durationMinutes / 60)}h ${
          durationMinutes % 60
        }m`,
        durationMinutes,
        status: durationMinutes > 240 ? "overstay" : "loading",
        materialType: t.purpose || "N/A",
      };
    });

    res.json({ data: formatted });
  } catch (err) {
    next(err);
  }
};
export const allowVehicleExit = async (req, res, next) => {
  try {
    const supervisorId = req.user._id;

    const {
      vehicleId,
      vehicleNumber,
      exitTime,
      exitLoadStatus,
      returnMaterialType,
      papersVerified,
      physicalInspection,
      materialMatched,
      exitNotes,
      exitMedia,
    } = req.body;

    if (!vehicleId || !exitTime) {
      return res.status(400).json({
        message: "vehicleId and exitTime are required",
      });
    }

    const trip = await Trip.findOne({
      _id: vehicleId,
      status: "INSIDE",
    });

    if (!trip) {
      return res.status(404).json({
        message: "Active trip not found",
      });
    }

    /* ---------------- UPDATE TRIP ---------------- */
    trip.exitAt = new Date(exitTime);
    trip.exitGate = "Main Gate";
    trip.status = "EXITED";

    trip.exitMedia = {
      photos: [
        exitMedia.frontView,
        exitMedia.backView,
        exitMedia.loadView,
      ].filter(Boolean),
      video: exitMedia.videoClip || "",
      challanImage: exitMedia.frontView || "",
    };

    trip.notes = exitNotes;

    await trip.save();

    /* ---------------- UPDATE VEHICLE (OPTIONAL) ---------------- */
    await Vehicle.findByIdAndUpdate(trip.vehicleId, {
      isOnline: false,
    });

    res.json({
      message: "Vehicle exit approved successfully",
      tripId: trip.tripId,
      exitAt: trip.exitAt,
    });
  } catch (err) {
    next(err);
  }
};
