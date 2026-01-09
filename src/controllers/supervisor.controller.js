// controllers/supervisor.controller.js
import Supervisor from "../models/supervisor.model.js";
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Vehicle from "../models/Vehicle.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import mongoose from "mongoose";


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


/**
 * @desc   Get supervisor dashboard with stats and recent activity
 * @route  GET /api/supervisor/dashboard
 * @access Supervisor
 */
export const supervisorDashboard = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;

    // Enhanced error checking
    if (!siteId) {
      console.error('❌ Supervisor siteId missing:', {
        userId: req.user._id,
        role: req.user.role,
        siteId: req.user.siteId
      });
      
      return res.status(400).json({
        success: false,
        message: "Supervisor not assigned to any site",
        debug: {
          userId: req.user._id,
          hasSiteId: !!req.user.siteId
        }
      });
    }

    console.log('✅ Dashboard request for supervisor:', {
      supervisorId: req.user._id,
      siteId: siteId
    });

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
          .lean()
          .exec(),

        // Site info
        Site.findById(siteId).lean().exec(),
      ]);

      console.log('📊 Dashboard stats:', {
        vehiclesInside,
        todayEntry,
        todayExit,
        recentTripsCount: recentTrips?.length || 0
      });

      if (!site) {
        return res.status(404).json({
          success: false,
          message: "Assigned site not found",
          siteId
        });
      }

      // Format recent activity with null safety
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
      console.error('❌ Dashboard query error:', queryError);
      throw queryError;
    }

  } catch (err) {
    console.error('❌ Dashboard error:', err);
    next(err);
  }
};

/**
 * @desc   Get active vehicles (currently inside)
 * @route  GET /api/supervisor/vehicles/active
 * @access Supervisor
 */
export const getActiveVehicles = async (req, res, next) => {
  try {
    // Get siteId from query parameter OR authenticated user
    const siteId = req.query.siteId || req.user?.siteId;

    console.log('🚗 Get active vehicles request:', {
      siteId,
      fromQuery: req.query.siteId,
      fromUser: req.user?.siteId,
      query: req.query,
      hasAuth: !!req.user
    });

    if (!siteId) {
      console.error('❌ Missing siteId in both query and user session');
      return res.status(400).json({
        success: false,
        message: "Site ID is required. Either pass as ?siteId=... or ensure supervisor is assigned to a site.",
        debug: {
          querySiteId: req.query.siteId,
          userSiteId: req.user?.siteId,
          userId: req.user?._id,
          hint: "Add ?siteId=YOUR_SITE_ID to the request URL"
        }
      });
    }

    const OVERSTAY_MINUTES = 240; // 4 hours

    console.log('🔍 Querying trips with:', {
      siteId,
      status: ["INSIDE", "active"]
    });

    const trips = await Trip.find({
      siteId: new mongoose.Types.ObjectId(siteId),
      status: { $in: ["INSIDE", "active"] },
    })
      .populate("vendorId", "name")
      .populate("vehicleId", "vehicleNumber vehicleType driverName driverPhone")
      .sort({ entryAt: -1 })
      .lean();

    console.log('📊 Found trips:', {
      count: trips.length,
      tripIds: trips.map(t => t.tripId || t._id)
    });

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

    console.log('✅ Active vehicles fetched:', {
      count: formatted.length,
      vehicles: formatted.map(v => v.vehicleNumber)
    });

    res.json({
      success: true,
      count: formatted.length,
      siteId, // Include for debugging
      data: formatted,
    });
  } catch (err) {
    console.error("❌ Get active vehicles error:", err);
    next(err);
  }
};

/**
 * @desc   Get trip history with filters
 * @route  GET /api/supervisor/trips
 * @access Supervisor
 */
// Backend: controllers/supervisorController.js (or similar)
export const getTripHistory = async (req, res) => {
  try {
    const { period } = req.query;
    const siteId = req.user.siteId; // Get from authenticated user
    
    if (!siteId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Site ID not found. Please contact administrator.' 
      });
    }

    // Calculate date range based on period
    let startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'last7days') {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid period parameter. Use "today" or "last7days".' 
      });
    }

    console.log('🚗 Get trip history request:', {
      siteId,
      period,
      startDate,
      fromUser: req.user._id
    });

    // Query trips
    const trips = await Trip.find({
      siteId: siteId,
      createdAt: { $gte: startDate }
    })
    .sort({ createdAt: -1 })
    .lean();

    // Format trips for frontend
    const formattedTrips = trips.map(trip => ({
      _id: trip._id,
      tripId: trip.tripId,
      vehicleNumber: trip.vehicleNumber,
      vendor: trip.vendor || 'N/A',
      driver: trip.driverName || 'N/A',
      materialType: trip.materialType || 'N/A',
      entryTime: new Date(trip.entryTime).toLocaleString(),
      exitTime: trip.exitTime ? new Date(trip.exitTime).toLocaleString() : '--',
      duration: trip.exitTime 
        ? calculateDuration(trip.entryTime, trip.exitTime)
        : 'Ongoing',
      status: trip.status === 'INSIDE' ? 'active' : trip.status.toLowerCase()
    }));

    console.log('✅ Trip history fetched:', { count: formattedTrips.length });

    res.json({
      success: true,
      data: formattedTrips,
      count: formattedTrips.length
    });

  } catch (error) {
    console.error('❌ Error fetching trip history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch trip history',
      error: error.message 
    });
  }
};

// Helper function to calculate duration
const calculateDuration = (entryTime, exitTime) => {
  const diff = new Date(exitTime) - new Date(entryTime);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

/**
 * @desc   Allow vehicle entry (manual)
 * @route  POST /api/supervisor/vehicles/entry
 * @access Supervisor
 */
export const allowVehicleEntry = async (req, res, next) => {
  try {
    const supervisorId = req.user._id;
    const { siteId, clientId } = req.user;

    if (!siteId || !clientId) {
      return res.status(400).json({
        success: false,
        message: "Supervisor not properly configured (missing siteId or clientId)",
      });
    }

    const {
      vehicleNumber,
      vehicleType,
      driverName,
      vendorId,
      entryTime,
      materialType,
      loadStatus,
      notes,
      media,
    } = req.body;

    if (!vehicleNumber || !vehicleType || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "vehicleNumber, vehicleType and vendorId are required",
      });
    }

    // Find or create vehicle
    let vehicle = await Vehicle.findOne({
      vehicleNumber: vehicleNumber.toUpperCase(),
      siteId,
    });

    if (vehicle?.isInside) {
      return res.status(409).json({
        success: false,
        message: "Vehicle is already inside the site",
      });
    }

    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleNumber: vehicleNumber.toUpperCase(),
        vehicleType,
        driverName,
        vendorId,
        siteId,
        clientId,
        createdBy: supervisorId,
      });
      console.log('✅ New vehicle created:', vehicle._id);
    } else {
      vehicle.driverName = driverName || vehicle.driverName;
      vehicle.vehicleType = vehicleType;
      vehicle.vendorId = vendorId;
    }

    vehicle.isInside = true;
    vehicle.lastEntryAt = entryTime ? new Date(entryTime) : new Date();
    vehicle.lastAnprImage = media?.anprImage || vehicle.lastAnprImage;
    vehicle.lastDetectedAt = new Date();

    await vehicle.save();

    // Get site details for projectManagerId
    const site = await Site.findById(siteId);
    
    // Create trip
    const trip = await Trip.create({
      clientId,
      siteId,
      vehicleId: vehicle._id,
      vendorId,
      supervisorId: supervisorId,
      projectManagerId: site?.projectManagerId || clientId, // Fallback to clientId
      plateText: vehicleNumber.toUpperCase(),
      driverName,
      entryAt: entryTime ? new Date(entryTime) : new Date(),
      entryGate: "Main Gate",
      status: "INSIDE",
      purpose: materialType || "Manual Entry",
      loadStatus: loadStatus || "FULL",
      entryMedia: {
        anprImage: media?.anprImage || "",
        photos: [
          media?.frontView,
          media?.backView,
          media?.driverView,
          media?.loadView
        ].filter(Boolean),
        video: media?.videoClip || "",
        challanImage: media?.challanImage || media?.frontView || "placeholder",
      },
      notes: notes || "",
      createdBy: supervisorId,
    });

    console.log('✅ Trip created:', trip.tripId);

    res.status(201).json({
      success: true,
      message: "Vehicle entry allowed successfully",
      data: {
        tripId: trip.tripId,
        vehicleId: vehicle._id,
        entryAt: trip.entryAt,
      }
    });
  } catch (err) {
    console.error("❌ Allow Vehicle Entry Error:", err);
    next(err);
  }
};

/**
 * @desc   Allow vehicle exit (manual)
 * @route  POST /api/supervisor/vehicles/exit
 * @access Supervisor
 */
export const allowVehicleExit = async (req, res, next) => {
  try {
    const supervisorId = req.user._id;

    const {
      vehicleId, // This is tripId, not vehicle ObjectId
      vehicleNumber,
      exitTime,
      exitLoadStatus,
      exitNotes,
      exitMedia,
    } = req.body;

    if (!vehicleId || !exitTime) {
      return res.status(400).json({
        success: false,
        message: "vehicleId (tripId) and exitTime are required",
      });
    }

    const trip = await Trip.findOne({
      _id: vehicleId,
      status: "INSIDE",
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Active trip not found",
      });
    }

    // Update trip
    trip.exitAt = new Date(exitTime);
    trip.exitGate = "Main Gate";
    trip.status = "EXITED";

    trip.exitMedia = {
      photos: [
        exitMedia?.frontView,
        exitMedia?.backView,
        exitMedia?.loadView,
      ].filter(Boolean),
      video: exitMedia?.videoClip || "",
      challanImage: exitMedia?.frontView || "placeholder",
    };

    if (exitNotes) {
      trip.notes = trip.notes 
        ? `${trip.notes}\nExit: ${exitNotes}` 
        : exitNotes;
    }

    await trip.save();

    // Update vehicle status
    await Vehicle.findByIdAndUpdate(trip.vehicleId, {
      isInside: false,
      lastExitAt: new Date(exitTime),
    });

    console.log('✅ Vehicle exit recorded:', trip.tripId);

    res.json({
      success: true,
      message: "Vehicle exit approved successfully",
      data: {
        tripId: trip.tripId,
        exitAt: trip.exitAt,
        duration: trip.getDuration()
      }
    });
  } catch (err) {
    console.error("❌ Allow Vehicle Exit Error:", err);
    next(err);
  }
};

/**
 * @desc   Create manual entry (for testing/debug)
 * @route  POST /api/supervisor/trips/manual
 * @access Public (should be protected in production)
 */
export const createManualEntry = async (req, res, next) => {
  try {
    const {
      numberPlate,
      vehicleType,
      cameraName,
      isEntry,
      timestamp,
      siteId,
      notes,
      driverName,
      purpose,
      loadStatus,
    } = req.body;

    // 🔹 Normalize timestamp (single source of truth)
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    // 🔹 IST formatted time (for response / logs only)
    const eventTimeIST = eventTime.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    console.log("📝 Manual entry request:", {
      numberPlate,
      vehicleType,
      isEntry,
      siteId,
      eventTimeUTC: eventTime,
      eventTimeIST,
    });

    if (!numberPlate || !siteId) {
      return res.status(400).json({
        success: false,
        message: "Number plate and site ID are required",
      });
    }

    const site = await Site.findById(siteId);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    // 🔹 Find or create vehicle
    let vehicle = await Vehicle.findOne({
      vehicleNumber: numberPlate.toUpperCase(),
      siteId,
    });

    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleNumber: numberPlate.toUpperCase(),
        vehicleType: vehicleType || "OTHER",
        siteId,
        clientId: site.clientId._id,
        vendorId: site.clientId._id,
        driverName: driverName || "",
        isInside: isEntry,
        lastDetectedAt: eventTime,
        createdBy: site.createdBy,
      });
    } else {
      vehicle.lastDetectedAt = eventTime;
      vehicle.isInside = isEntry;
      vehicle.driverName = driverName || vehicle.driverName;

      if (isEntry) {
        vehicle.lastEntryAt = eventTime;
      } else {
        vehicle.lastExitAt = eventTime;
      }

      await vehicle.save();
    }

    // ================= ENTRY =================
    if (isEntry) {
      const existingTrip = await Trip.findOne({
        vehicleId: vehicle._id,
        siteId,
        status: { $in: ["INSIDE", "active"] },
      });

      if (existingTrip) {
        return res.status(400).json({
          success: false,
          message: "Vehicle already has an open trip",
          data: { tripId: existingTrip.tripId },
        });
      }

      const supervisorId = site.createdBy;
      const projectManagerId = site.projectManagerId || site.createdBy;

      const newTrip = await Trip.create({
        clientId: site.clientId._id,
        siteId,
        vehicleId: vehicle._id,
        vendorId: site.clientId._id,
        supervisorId,
        projectManagerId,
        plateText: numberPlate.toUpperCase(),
        status: "INSIDE",
        loadStatus: loadStatus || "FULL",
        purpose: purpose || notes || "Manual Entry",
        notes: notes || "",
        entryAt: eventTime,
        entryGate: cameraName || "Manual Entry",
        entryMedia: {
          photos: [],
          video: "",
          challanImage: "manual-entry",
        },
        createdBy: supervisorId,
      });

      console.log("✅ Manual entry created:", newTrip.tripId);

      return res.status(201).json({
        success: true,
        message: "Manual entry created successfully",
        data: {
          trip: newTrip,
          vehicle,
          timeIST: eventTimeIST,
        },
      });
    }

    // ================= EXIT =================
    const openTrip = await Trip.findOne({
      vehicleId: vehicle._id,
      siteId,
      status: { $in: ["INSIDE", "active"] },
    });

    if (!openTrip) {
      return res.status(404).json({
        success: false,
        message: "No open trip found for this vehicle",
      });
    }

    openTrip.status = "EXITED";
    openTrip.exitAt = eventTime;
    openTrip.exitGate = cameraName || "Manual Exit";
    openTrip.exitMedia = {
      photos: [],
      video: "",
      challanImage: "manual-exit",
    };

    if (notes) {
      openTrip.notes = openTrip.notes
        ? `${openTrip.notes}\nExit: ${notes}`
        : notes;
    }

    await openTrip.save();

    const duration = openTrip.getDuration();

    console.log("✅ Manual exit recorded:", openTrip.tripId);

    return res.status(200).json({
      success: true,
      message: "Manual exit recorded successfully",
      data: {
        trip: openTrip,
        vehicle,
        duration,
        timeIST: eventTimeIST,
      },
    });
  } catch (error) {
    console.error("❌ Manual entry error:", error);
    next(error);
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
      site,
    });
  } catch (error) {
    next(error);
  }
};
