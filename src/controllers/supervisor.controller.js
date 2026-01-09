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


export const supervisorDashboard = async (req, res, next) => {
  try {
    const siteId = req.user.siteId;

    if (!siteId) {
      return res.status(400).json({
        message: "Supervisor not assigned to any site"
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      vehiclesInside,
      todayEntry,
      todayExit,
      pendingExit,
      deniedEntries,
      recentTrips,
      site
    ] = await Promise.all([
      Trip.countDocuments({ siteId, status: "INSIDE" }),

      Trip.countDocuments({
        siteId,
        entryAt: { $gte: today }
      }),

      Trip.countDocuments({
        siteId,
        status: "EXITED",
        exitAt: { $gte: today }
      }),

      Trip.countDocuments({
        siteId,
        status: "INSIDE",
        exitExpectedAt: { $exists: true }
      }),

      Trip.countDocuments({
        siteId,
        status: "DENIED",
        entryAt: { $gte: today }
      }),

      Trip.find({ siteId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Site.findById(siteId).lean()
    ]);

    if (!site) {
      return res.status(404).json({
        message: "Assigned site not found"
      });
    }

    const recentActivity = recentTrips.map(t => ({
      id: t._id,
      vehicleNumber: t.vehicleNumber,
      type: t.entryType === "EXIT" ? "exit" : "entry",
      status: t.status === "DENIED" ? "denied" : "allowed",
      gate: t.gateName ?? "Unknown Gate",
      visitor: t.visitorType || "Unknown",
      time: new Date(t.createdAt).toLocaleTimeString(),
    }));

    res.json({
      stats: {
        todayEntry,
        todayExit,
        vehiclesInside,
        pendingExit,
        deniedEntries,
      },
      recentActivity,
      siteInfo: {
        name: site.name,
        gates: site.gates?.length || 0,
        shift: "Day Shift",
        status: site.status || "Active",
      },
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
/**
 * @desc   Allow vehicle entry
 * @route  POST /api/supervisor/vehicles/entry
 * @access Supervisor
 */
export const allowVehicleEntry = async (req, res, next) => {
  try {
    const supervisorId = req.user._id;
    const { siteId, clientId } = req.user;

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
        message: "vehicleNumber, vehicleType and vendorId are required",
      });
    }

    /* ===============================
       FIND OR CREATE VEHICLE
    =============================== */
    let vehicle = await Vehicle.findOne({
      vehicleNumber,
      siteId,
    });

    if (vehicle?.isInside) {
      return res.status(409).json({
        message: "Vehicle is already inside the site",
      });
    }

    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleNumber,
        vehicleType,
        driverName,
        vendorId,
        siteId,
        clientId,
        createdBy: supervisorId,
      });
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

    /* ===============================
       CREATE TRIP (SOURCE OF TRUTH)
    =============================== */
    const trip = await Trip.create({
      tripId: `TRIP-${Date.now()}`,
      siteId,
      clientId,
      vehicleId: vehicle._id,
      vendorId,
      plateText: vehicleNumber,
      driverName,

      entryAt: entryTime ? new Date(entryTime) : new Date(),
      entryGate: "Main Gate",
      status: "INSIDE",

      purpose: materialType,
      loadStatus,

      entryMedia: {
        anprImage: media?.anprImage || "",
        frontView: media?.frontView || "",
        backView: media?.backView || "",
        driverView: media?.driverView || "",
        loadView: media?.loadView || "",
        video: media?.videoClip || "",
        challanImage: media?.challanImage || "",
      },

      notes,
      entryBy: supervisorId,
    });

    res.status(201).json({
      message: "Vehicle entry allowed successfully",
      tripId: trip.tripId,
      vehicleId: vehicle._id,
      entryAt: trip.entryAt,
    });
  } catch (err) {
    console.error("Allow Vehicle Entry Error:", err);
    next(err);
  }
};


// Socket.IO handler for ANPR events
export const handleAnprEvents = (io) => {
  io.on("connection", (socket) => {
    console.log("✅ Client connected:", socket.id);

    // Listen for ANPR events from the hardware/ANPR system
    socket.on("anpr:new-event", async (data) => {
      try {
        console.log("🚗 Received ANPR Event:", data);

        // Extract data from ANPR event
        const {
          numberPlate,
          vehicleType,
          cameraName,
          direction,
          speed,
          isEntry,
          timestamp,
          siteId,
          siteName,
          laneId,
          image,
          frame,
        } = data;

        // Validate required fields
        if (!numberPlate || !siteId) {
          console.error("❌ Missing required fields: numberPlate or siteId");
          socket.emit("anpr:error", {
            message: "Missing required fields: numberPlate or siteId",
          });
          return;
        }

        // Get site details
        const site = await Site.findById(siteId)
          .populate("clientId")
          .populate("defaultVendorId");

        if (!site) {
          console.error("❌ Site not found:", siteId);
          socket.emit("anpr:error", {
            message: "Site not found",
          });
          return;
        }

        // Find or create vehicle
        let vehicle = await Vehicle.findOne({
          vehicleNumber: numberPlate.toUpperCase(),
          siteId,
        });

        if (!vehicle) {
          console.log("📝 Creating new vehicle:", numberPlate);

          vehicle = await Vehicle.create({
            vehicleNumber: numberPlate.toUpperCase(),
            vehicleType: vehicleType || "OTHER",
            siteId,
            clientId: site.clientId._id,
            vendorId: site.defaultVendorId?._id || site.clientId._id,
            isInside: isEntry,
            lastDetectedAt: timestamp || new Date(),
            lastAnprImage: image || "",
          });
        } else {
          // Update existing vehicle
          vehicle.lastDetectedAt = timestamp || new Date();
          vehicle.lastAnprImage = image || "";
          vehicle.isInside = isEntry;
          
          if (isEntry) {
            vehicle.lastEntryAt = timestamp || new Date();
          } else {
            vehicle.lastExitAt = timestamp || new Date();
          }
          
          await vehicle.save();
        }

        // Handle Entry
        if (isEntry) {
          // Check if there's an open trip
          const existingTrip = await Trip.findOne({
            vehicleId: vehicle._id,
            siteId,
            status: { $in: ["INSIDE", "active"] },
          });

          if (existingTrip) {
            console.log("⚠️ Vehicle already has an open trip:", existingTrip.tripId);
            
            // Broadcast warning
            io.emit("anpr:duplicate-entry", {
              message: "Vehicle already inside",
              existingTrip,
              vehicle,
            });
          } else {
            // Get supervisor and project manager from site
            const supervisorId = site.supervisorId || site.createdBy;
            const projectManagerId = site.projectManagerId || site.createdBy;

            // Create new trip for entry
            const newTrip = await Trip.create({
              clientId: site.clientId._id,
              siteId,
              vehicleId: vehicle._id,
              vendorId: vehicle.vendorId,
              supervisorId,
              projectManagerId,
              plateText: numberPlate.toUpperCase(),
              status: "INSIDE",
              loadStatus: "FULL", // Default, can be updated later
              purpose: "Auto-detected Entry",
              entryAt: timestamp || new Date(),
              entryGate: cameraName || "Auto ANPR",
              entryMedia: {
                photos: image ? [image] : [],
                video: "",
                challanImage: image || frame || "",
              },
              anprImage: image || "",
              createdBy: supervisorId,
            });

            console.log("✅ Entry trip created:", newTrip.tripId);

            // Broadcast to all connected clients
            io.emit("anpr:trip-created", {
              trip: newTrip,
              vehicle,
              type: "ENTRY",
            });
          }
        }

        // Handle Exit
        if (!isEntry) {
          // Find the open trip for this vehicle
          const openTrip = await Trip.findOne({
            vehicleId: vehicle._id,
            siteId,
            status: { $in: ["INSIDE", "active"] },
          });

          if (openTrip) {
            // Update trip with exit details
            openTrip.status = "EXITED";
            openTrip.exitAt = timestamp || new Date();
            openTrip.exitGate = cameraName || "Auto ANPR";
            openTrip.exitMedia = {
              photos: image ? [image] : [],
              video: "",
              challanImage: image || frame || "",
            };

            await openTrip.save();

            const duration = openTrip.getDuration();
            console.log("✅ Trip closed:", openTrip.tripId, "Duration:", duration);

            // Broadcast to all connected clients
            io.emit("anpr:trip-completed", {
              trip: openTrip,
              vehicle,
              type: "EXIT",
              duration,
            });
          } else {
            console.log("⚠️ No open trip found for exit:", numberPlate);

            // Broadcast warning
            io.emit("anpr:exit-without-entry", {
              message: "No entry record found for this vehicle",
              vehicle,
              plateText: numberPlate,
            });
          }
        }

        // Broadcast the original event to all clients
        io.emit("anpr:new-event", data);

      } catch (error) {
        console.error("❌ Error processing ANPR event:", error);
        socket.emit("anpr:error", {
          message: "Failed to process ANPR event",
          error: error.message,
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });
};

// Manual entry endpoint
export const createManualEntry = async (req, res, next) => {
  try {
    const {
      numberPlate,
      vehicleType,
      cameraName,
      direction,
      speed,
      isEntry,
      timestamp,
      siteId,
      siteName,
      laneId,
      vehicleImage,
      frameImage,
      notes,
      driverName,
      driverPhone,
      purpose,
      loadStatus,
    } = req.body;

    // Validate required fields
    if (!numberPlate || !siteId) {
      return res.status(400).json({
        message: "Number plate and site ID are required",
      });
    }

    // Get site details
    const site = await Site.findById(siteId)
      .populate("clientId")
      .populate("defaultVendorId");

    if (!site) {
      return res.status(404).json({
        message: "Site not found",
      });
    }

    // Find or create vehicle
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
        vendorId: site.defaultVendorId?._id || site.clientId._id,
        driverName: driverName || "",
        driverPhone: driverPhone || "",
        isInside: isEntry,
        lastDetectedAt: timestamp || new Date(),
        lastAnprImage: vehicleImage || "",
        createdBy: req.user?._id,
      });
    } else {
      // Update vehicle info
      vehicle.lastDetectedAt = timestamp || new Date();
      vehicle.lastAnprImage = vehicleImage || "";
      vehicle.isInside = isEntry;
      vehicle.driverName = driverName || vehicle.driverName;
      vehicle.driverPhone = driverPhone || vehicle.driverPhone;
      
      if (isEntry) {
        vehicle.lastEntryAt = timestamp || new Date();
      } else {
        vehicle.lastExitAt = timestamp || new Date();
      }
      
      await vehicle.save();
    }

    // Create or update trip
    if (isEntry) {
      // Check for existing open trip
      const existingTrip = await Trip.findOne({
        vehicleId: vehicle._id,
        siteId,
        status: { $in: ["INSIDE", "active"] },
      });

      if (existingTrip) {
        return res.status(400).json({
          message: "Vehicle already has an open trip",
          trip: existingTrip,
        });
      }

      // Get supervisor and project manager
      const supervisorId = req.user?._id || site.supervisorId || site.createdBy;
      const projectManagerId = site.projectManagerId || site.createdBy;

      // Create new trip
      const newTrip = await Trip.create({
        clientId: site.clientId._id,
        siteId,
        vehicleId: vehicle._id,
        vendorId: vehicle.vendorId,
        supervisorId,
        projectManagerId,
        plateText: numberPlate.toUpperCase(),
        status: "INSIDE",
        loadStatus: loadStatus || "FULL",
        purpose: purpose || notes || "Manual Entry",
        notes: notes || "",
        entryAt: timestamp || new Date(),
        entryGate: cameraName || "Manual Entry",
        entryMedia: {
          photos: vehicleImage ? [vehicleImage] : [],
          video: "",
          challanImage: vehicleImage || frameImage || "",
        },
        anprImage: vehicleImage || "",
        createdBy: supervisorId,
      });

      return res.status(201).json({
        success: true,
        message: "Manual entry created successfully",
        data: {
          trip: newTrip,
          vehicle,
        },
      });
    } else {
      // Handle manual exit
      const openTrip = await Trip.findOne({
        vehicleId: vehicle._id,
        siteId,
        status: { $in: ["INSIDE", "active"] },
      });

      if (!openTrip) {
        return res.status(404).json({
          message: "No open trip found for this vehicle",
        });
      }

      // Update trip with exit details
      openTrip.status = "EXITED";
      openTrip.exitAt = timestamp || new Date();
      openTrip.exitGate = cameraName || "Manual Exit";
      openTrip.exitMedia = {
        photos: vehicleImage ? [vehicleImage] : [],
        video: "",
        challanImage: vehicleImage || frameImage || "",
      };
      
      if (notes) {
        openTrip.notes = openTrip.notes 
          ? `${openTrip.notes}\nExit Notes: ${notes}` 
          : notes;
      }

      await openTrip.save();

      const duration = openTrip.getDuration();

      return res.status(200).json({
        success: true,
        message: "Manual exit recorded successfully",
        data: {
          trip: openTrip,
          vehicle,
          duration,
        },
      });
    }
  } catch (error) {
    console.error("❌ Manual entry error:", error);
    next(error);
  }
};

// Get active vehicles (vehicles currently inside)
export const getActiveVehicles = async (req, res, next) => {
  try {
    const { siteId } = req.query;

    if (!siteId) {
      return res.status(400).json({
        message: "Site ID is required",
      });
    }

    const OVERSTAY_MINUTES = 240; // 4 hours

    const trips = await Trip.find({
      siteId,
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
        _id: t._id,
        tripId: t.tripId,
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
        loadStatus: t.loadStatus,
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
    console.error("❌ Get active vehicles error:", err);
    next(err);
  }
};

// Get trip history
export const getTripHistory = async (req, res, next) => {
  try {
    const { siteId, startDate, endDate, status, page = 1, limit = 50 } = req.query;

    if (!siteId) {
      return res.status(400).json({
        message: "Site ID is required",
      });
    }

    const query = { siteId };

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.entryAt = {};
      if (startDate) query.entryAt.$gte = new Date(startDate);
      if (endDate) query.entryAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [trips, total] = await Promise.all([
      Trip.find(query)
        .populate("vendorId", "name")
        .populate("vehicleId", "vehicleNumber vehicleType driverName driverPhone")
        .sort({ entryAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Trip.countDocuments(query),
    ]);

    const formatted = trips.map((t) => ({
      _id: t._id,
      tripId: t.tripId,
      vehicleNumber: t.vehicleId?.vehicleNumber || t.plateText,
      vehicleType: t.vehicleId?.vehicleType,
      vendor: t.vendorId?.name,
      driver: t.vehicleId?.driverName,
      status: t.status,
      loadStatus: t.loadStatus,
      entryAt: t.entryAt,
      exitAt: t.exitAt,
      duration: t.exitAt ? t.getDuration() : null,
      purpose: t.purpose,
      entryGate: t.entryGate,
      exitGate: t.exitGate,
    }));

    res.json({
      success: true,
      count: formatted.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: formatted,
    });
  } catch (err) {
    console.error("❌ Get trip history error:", err);
    next(err);
  }
};