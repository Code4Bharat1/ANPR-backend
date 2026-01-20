// controllers/trip.controller.js
import Trip from "../models/Trip.model.js";
import Vehicle from "../models/Vehicle.model.js";
import Site from "../models/Site.model.js";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import VendorModel from "../models/Vendor.model.js";

/**
 * @desc   Get trip history with filters
 * @route  GET /api/trips/history
 * @access Supervisor, PM, Admin, Client
 */
export const getTripHistory = async (req, res) => {
  try {
    const { period, status, vehicleNumber, vendorId, startDate, endDate } =
      req.query;
    const siteId = req.user?.siteId || req.query.siteId;
    const clientId = req.user?.clientId;

    // console.log("🚗 Get trip history request:", {
    //   siteId,
    //   period,
    //   userId: req.user?._id,
    //   userRole: req.user?.role,
    //   filters: { status, vehicleNumber, vendorId, startDate, endDate },
    // });

    if (!siteId && !clientId) {
      return res.status(400).json({
        success: false,
        message: "Site ID or Client ID is required.",
      });
    }

    // Build query
    const query = {};

    if (siteId) {
      query.siteId = new mongoose.Types.ObjectId(siteId);
    } else if (clientId) {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    }

    // Apply filters
    if (status) query.status = status;
    if (vehicleNumber)
      query.$or = [
        { plateText: { $regex: vehicleNumber, $options: "i" } },
        { "vehicleId.vehicleNumber": { $regex: vehicleNumber, $options: "i" } },
      ];
    if (vendorId) query.vendorId = new mongoose.Types.ObjectId(vendorId);

    // Date range filtering
    let dateFilter = {};
    if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFilter.entryAt = { $gte: today };
    } else if (period === "last7days") {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      dateFilter.entryAt = { $gte: startDate };
    } else if (period === "last30days") {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      dateFilter.entryAt = { $gte: startDate };
    } else if (startDate && endDate) {
      dateFilter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else {
      // Default to last 7 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      dateFilter.entryAt = { $gte: startDate };
    }

    Object.assign(query, dateFilter);

    // console.log("🔍 Querying trips with:", query);

    // Query trips with proper population
    const trips = await Trip.find(query)
      .populate("vendorId", "name companyName")
      .populate("vehicleId", "vehicleNumber plateNumber driverName vehicleType")
      .populate("siteId", "name address")
      .populate("supervisorId", "name email")
      .sort({ entryAt: -1 })
      .lean();

    // console.log('📊 Raw trips from DB:', {
    //   count: trips.length,
    //   sampleTrip: trips[0] ? {
    //     tripId: trips[0].tripId,
    //     entryAt: trips[0].entryAt,
    //     exitAt: trips[0].exitAt,
    //     vehicleId: trips[0].vehicleId,
    //     vendorId: trips[0].vendorId
    //   } : null
    // }
    // );

    // Helper function to safely format dates
    const formatDate = (dateValue) => {
      if (!dateValue) return null;

      try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
          console.error("Invalid date value:", dateValue);
          return "Invalid Date";
        }

        return date.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        });
      } catch (error) {
        console.error("Error formatting date:", dateValue, error);
        return "Invalid Date";
      }
    };

    // Helper function to calculate duration
    const calculateDuration = (entryTime, exitTime) => {
      if (!entryTime || !exitTime) return null;

      try {
        const entry = new Date(entryTime);
        const exit = new Date(exitTime);

        if (isNaN(entry.getTime()) || isNaN(exit.getTime())) {
          return null;
        }

        const diff = exit - entry;
        if (diff < 0) return "0h 0m";

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
      } catch (error) {
        console.error("Error calculating duration:", error);
        return null;
      }
    };

    // Format trips for frontend
    const formattedTrips = trips.map((trip) => {
      // Get vehicle number from multiple possible sources
      const vehicleNumber =
        trip.vehicleId?.vehicleNumber ||
        trip.vehicleId?.plateNumber ||
        trip.plateText ||
        "N/A";

      // Get vendor name from multiple possible sources
      const vendorName =
        trip.vendorId?.name || trip.vendorId?.companyName || "N/A";

      // Format entry and exit times
      const entryTime = formatDate(trip.entryAt);
      const exitTime = trip.exitAt ? formatDate(trip.exitAt) : null;

      // Calculate duration
      const duration = trip.exitAt
        ? calculateDuration(trip.entryAt, trip.exitAt)
        : "Ongoing";

      // Determine status
      let status = "active";
      if (trip.status === "EXITED" || trip.exitAt) {
        status = "completed";
      } else if (trip.status === "INSIDE") {
        status = "active";
      } else if (trip.status === "DENIED") {
        status = "denied";
      } else {
        status = trip.status?.toLowerCase() || "active";
      }

      return {
        _id: trip._id,
        tripId: trip.tripId || "N/A",
        vehicleNumber,
        vendor: vendorName,
        driver: trip.vehicleId?.driverName || "N/A",
        materialType: trip.loadStatus || "N/A",
        entryTime: entryTime || "N/A",
        exitTime: exitTime || "--",
        duration: duration || "N/A",
        status,
        site: trip.siteId?.name || "N/A",
        supervisor: trip.supervisorId?.name || "N/A",
        purpose: trip.purpose || "",
        entryGate: trip.entryGate || "N/A",
        exitGate: trip.exitGate || "N/A",
        loadStatus: trip.loadStatus || "N/A",
      };
    });

    // console.log("✅ Trip history formatted:", {
    //   count: formattedTrips.length,
    //   sample: formattedTrips[0],
    // });

    res.json({
      success: true,
      data: formattedTrips,
      count: formattedTrips.length,
      period,
      siteId,
    });
  } catch (error) {
    console.error("❌ Error fetching trip history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trip history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc   Get active vehicles (currently inside)
 * @route  GET /api/trips/active
 * @access Supervisor, PM, Admin, Client
 */
export const getActiveTrips = async (req, res) => {
  try {
    const siteId = req.query.siteId || req.user?.siteId;
    const clientId = req.user?.clientId;

    if (!siteId && !clientId) {
      return res.status(400).json({
        success: false,
        message: "Site ID or Client ID is required.",
      });
    }

    const OVERSTAY_MINUTES = 240;

    const query = {};
    if (siteId) {
      query.siteId = new mongoose.Types.ObjectId(siteId);
    } else {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    }

    query.status = { $in: ["INSIDE", "active"] };

    const trips = await Trip.find(query)
      .populate("vendorId", "name companyName")
      .populate(
        "vehicleId",
        "vehicleNumber plateNumber vehicleType driverName driverPhone",
      )
      .populate("siteId", "name")
      .sort({ entryAt: -1 })
      .lean();

    const now = Date.now();

    const formatted = trips.map((t) => {
      const entryTime = new Date(t.entryAt);
      const durationMinutes = Math.floor(
        (now - entryTime.getTime()) / (1000 * 60),
      );

      return {
        // 🔑 IDs
        _id: t._id.toString(), // Trip ID
        tripId: t.tripId || "N/A",
        vehicleId: t.vehicleId?._id?.toString(), // ✅ Vehicle ID (FIX)

        // Vehicle info
        vehicleNumber:
          t.vehicleId?.vehicleNumber ||
          t.vehicleId?.plateNumber ||
          t.plateText ||
          "Unknown",
        vehicleType: t.vehicleId?.vehicleType || "Unknown",

        // Relations
        vendor: t.vendorId?.name || t.vendorId?.companyName || "Unknown",
        site: t.siteId?.name || "N/A",

        // Driver
        driver: t.vehicleId?.driverName || "N/A",
        driverPhone: t.vehicleId?.driverPhone || "N/A",

        // Time
        entryTimeUTC: entryTime.toISOString(),
        entryTimeIST: entryTime.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),

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
        notes: t.notes || "",
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      siteId: siteId || null,
      clientId: clientId || null,
      data: formatted,
    });
  } catch (err) {
    console.error("❌ Get active vehicles error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active vehicles",
    });
  }
};

/**
 * @desc   Get single trip by ID
 * @route  GET /api/trips/:id
 * @access Supervisor, PM, Admin, Client
 */
export const getTripById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip ID",
      });
    }

    const trip = await Trip.findById(id)
      .populate("vendorId", "name companyName phone email")
      .populate(
        "vehicleId",
        "vehicleNumber plateNumber vehicleType driverName driverPhone",
      )
      .populate("siteId", "name address")
      .populate("supervisorId", "name email")
      .populate("projectManagerId", "name email")
      .lean();

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    // Check authorization
    const userSiteId = req.user?.siteId?.toString();
    const userClientId = req.user?.clientId?.toString();
    const tripSiteId = trip.siteId?._id?.toString();
    const tripClientId = trip.clientId?.toString();

    if (req.user?.role !== "admin") {
      if (userSiteId && tripSiteId && userSiteId !== tripSiteId) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
      if (userClientId && tripClientId && userClientId !== tripClientId) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    // Format trip data
    const formattedTrip = {
      _id: trip._id,
      tripId: trip.tripId || "N/A",
      vehicleNumber: trip.vehicleId?.vehicleNumber || trip.plateText || "N/A",
      vehicleType: trip.vehicleId?.vehicleType || "N/A",
      driverName: trip.vehicleId?.driverName || "N/A",
      driverPhone: trip.vehicleId?.driverPhone || "N/A",
      vendor: trip.vendorId?.name || trip.vendorId?.companyName || "N/A",
      site: trip.siteId?.name || "N/A",
      supervisor: trip.supervisorId?.name || "N/A",
      projectManager: trip.projectManagerId?.name || "N/A",
      entryTime: trip.entryAt
        ? new Date(trip.entryAt).toLocaleString("en-IN")
        : "N/A",
      exitTime: trip.exitAt
        ? new Date(trip.exitAt).toLocaleString("en-IN")
        : "--",
      status: trip.status,
      purpose: trip.purpose || "N/A",
      loadStatus: trip.loadStatus || "N/A",
      entryGate: trip.entryGate || "N/A",
      exitGate: trip.exitGate || "N/A",
      notes: trip.notes || "",
      entryMedia: trip.entryMedia || {},
      exitMedia: trip.exitMedia || {},
    };

    res.json({
      success: true,
      data: formattedTrip,
    });
  } catch (error) {
    console.error("❌ Error fetching trip by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trip details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// /**
//  * @desc   Update trip status or details
//  * @route  PUT /api/trips/:id
//  * @access Supervisor, PM, Admin
//  */
// export const updateTrip = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const updates = req.body;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid trip ID"
//       });
//     }

//     const trip = await Trip.findById(id);
//     if (!trip) {
//       return res.status(404).json({
//         success: false,
//         message: "Trip not found"
//       });
//     }

//     // Check authorization
//     const userSiteId = req.user?.siteId?.toString();
//     const tripSiteId = trip.siteId?.toString();

//     if (req.user?.role !== 'admin') {
//       if (userSiteId && tripSiteId && userSiteId !== tripSiteId) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied"
//         });
//       }
//     }

//     // Allowed updates
//     const allowedUpdates = [
//       'status', 'purpose', 'loadStatus', 'notes',
//       'exitAt', 'exitGate', 'exitMedia', 'entryMedia'
//     ];

//     const updateData = {};
//     allowedUpdates.forEach(field => {
//       if (updates[field] !== undefined) {
//         updateData[field] = updates[field];
//       }
//     });

//     // If marking as exited, update vehicle status
//     if (updates.status === 'EXITED' && !trip.exitAt) {
//       updateData.exitAt = updates.exitAt || new Date();

//       // Update vehicle status
//       await Vehicle.findByIdAndUpdate(trip.vehicleId, {
//         isInside: false,
//         lastExitAt: updateData.exitAt
//       });
//     }

//     const updatedTrip = await Trip.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate('vendorId', 'name')
//       .populate('vehicleId', 'vehicleNumber')
//       .lean();

//     res.json({
//       success: true,
//       message: "Trip updated successfully",
//       data: updatedTrip
//     });
//   } catch (error) {
//     console.error('❌ Error updating trip:', error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update trip",
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };
/**
 * @desc   Exit vehicle (close active trip)
 * @route  POST /api/supervisor/vehicles/exit
 * @access Supervisor
 */
export const exitVehicle = async (req, res) => {
  try {
    const {
      vehicleId,
      exitTime,
      exitMedia,
      exitNotes,
      exitLoadStatus,
      returnMaterialType,
      papersVerified,
      physicalInspection,
      materialMatched,
    } = req.body;

    // 1️⃣ Validate vehicleId
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vehicleId",
      });
    }

    const vehicle = await Trip.findById({ _id : vehicleId});

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    if (vehicle.isInside) {
      return res.json({
        success: true,
        message: "Vehicle already exited",
        data: {
          vehicleId,
          exitedAt: vehicle.lastExitAt,
        },
      });
    }

    const trip = await Trip.findOne({
      _id : vehicleId,
      status: { $ne: "EXITED" },
    }).sort({ entryAt: -1 });

    if (!trip) {
      console.warn("⚠️ Recovering missing trip for vehicle:", vehicleId);

      const recoveredTrip = await Trip.create({
        clientId: vehicle.clientId,
        siteId: vehicle.siteId,
        vendorId: vehicle.vendorId,
        vehicleId: vehicle._id,
        plateText: vehicle.vehicleNumber,
        entryAt: vehicle.lastEntryAt || new Date(),
        entryGate: "Recovered Entry",
        entryMedia: { photos: [] },
        status: "INSIDE",
        createdBy: req.user._id,
      });

      const exitAt = exitTime ? new Date(exitTime) : new Date();

      const formattedExitMedia = {
        photos: exitMedia?.photos ? Object.values(exitMedia.photos) : [],
        video: exitMedia?.video || "",
      };

      recoveredTrip.status = "EXITED";
      recoveredTrip.exitAt = exitAt;
      recoveredTrip.exitGate = "Manual Exit (Recovered)";
      recoveredTrip.exitMedia = formattedExitMedia;
      recoveredTrip.notes = exitNotes || "";
      await recoveredTrip.save();

      vehicle.isInside = false;
      vehicle.lastExitAt = exitAt;
      await vehicle.save();

      return res.json({
        success: true,
        message: "Vehicle exited successfully (recovered)",
        data: {
          tripId: recoveredTrip.tripId,
          exitAt,
        },
      });
    }

    const exitAt = exitTime ? new Date(exitTime) : new Date();

    const formattedExitMedia = {
      anprImage: exitMedia?.anprImage || null,
      photos: {
        frontView: exitMedia?.photos?.frontView || null,
        backView: exitMedia?.photos?.backView || null,
        loadView: exitMedia?.photos?.loadView || null,
        driverView: exitMedia?.photos?.driverView || null,
      },
      video: exitMedia?.video || null,
      challanImage: exitMedia?.challanImage || null,
    };

    trip.status = "EXITED";
    trip.exitAt = exitAt;
    trip.exitGate = trip.exitGate || "Manual Exit";
    trip.exitMedia = formattedExitMedia;
    trip.notes = exitNotes || "";

    // 8️⃣ Save exit checklist (frontend fields)
    trip.exitChecklist = {
      exitLoadStatus,
      returnMaterialType,
      papersVerified,
      physicalInspection,
      materialMatched,
    };

    await trip.save();

    // 9️⃣ Update vehicle
    vehicle.isInside = false;
    vehicle.lastExitAt = exitAt;
    await vehicle.save();

    return res.json({
      success: true,
      message: "Vehicle exited successfully",
      data: {
        tripId: trip._id,
        exitAt,
      },
    });
  } catch (error) {
    console.error("❌ Exit error:", error);
    return res.status(500).json({
      success: false,
      message: "Exit failed",
    });
  }
};

/**
 * @desc   Create manual trip entry
 * @route  POST /api/trips/manual
 * @access Supervisor, PM, Admin
 */
// export const createManualTrip = async (req, res) => {
//   try {
//     const supervisorId = req.user._id;
//     const { siteId, clientId } = req.user;

//     if (!siteId || !clientId) {
//       return res.status(400).json({
//         success: false,
//         message: "User not properly configured (missing siteId or clientId)",
//       });
//     }

//     const {
//       vehicleNumber,
//       vehicleType,
//       driverName,
//       driverPhone,
//       vendorId,
//       entryTime,
//       purpose,
//       loadStatus,
//       entryGate,
//       notes,
//       media,
//     } = req.body;

//     if (!vehicleNumber || !vendorId) {
//       return res.status(400).json({
//         success: false,
//         message: "vehicleNumber and vendorId are required",
//       });
//     }

//     // Find or create vehicle
//     let vehicle = await Vehicle.findOne({
//       vehicleNumber: vehicleNumber.toUpperCase(),
//       siteId,
//     });

//     console.log(vehicle);
    

//     if (vehicle?.isInside) {
//       return res.status(409).json({
//         success: false,
//         message: "Vehicle is already inside the site",
//       });
//     }

//     if (!vehicle) {
//       vehicle = await Vehicle.create({
//         vehicleNumber: vehicleNumber.toUpperCase(),
//         vehicleType: vehicleType || "TRUCK",
//         driverName: driverName || "",
//         driverPhone: driverPhone || "",
//         vendorId,
//         siteId,
//         clientId,
//         isInside: true,
//         lastEntryAt: entryTime ? new Date(entryTime) : new Date(),
//         createdBy: supervisorId,
//       });
//     } else {
//       vehicle.driverName = driverName || vehicle.driverName;
//       vehicle.driverPhone = driverPhone || vehicle.driverPhone;
//       vehicle.vehicleType = vehicleType || vehicle.vehicleType;
//       vehicle.vendorId = vendorId;
//       vehicle.isInside = true;
//       vehicle.lastEntryAt = entryTime ? new Date(entryTime) : new Date();
//       await vehicle.save();
//     }

//     // Get site details
//     const site = await Site.findById(siteId);

//     // 🔥 FIX: Structure entryMedia properly
//     // Handle both old array format and new object format
//     let photosObject = {
//       frontView: null,
//       backView: null,
//       loadView: null,
//       driverView: null,
//     };

//     if (media?.photos) {
//       if (Array.isArray(media.photos)) {
//         // 🔥 OLD FORMAT: Convert array to object
//         console.warn(
//           "⚠️ Received photos as array (old format), converting to object",
//         );
//         const photoKeys = ["frontView", "backView", "loadView", "driverView"];
//         media.photos.forEach((photoUrl, index) => {
//           if (photoUrl && photoKeys[index]) {
//             photosObject[photoKeys[index]] = photoUrl;
//           }
//         });
//       } else if (typeof media.photos === "object") {
//         // 🔥 NEW FORMAT: Already an object with keys
//         // console.log('✅ Received photos as object (new format)');
//         photosObject = {
//           frontView: media.photos.frontView || null,
//           backView: media.photos.backView || null,
//           loadView: media.photos.loadView || null,
//           driverView: media.photos.driverView || null,
//         };
//       }
//     }

//     // 🔥 Validate that photo keys are file paths, not MongoDB IDs
//     Object.entries(photosObject).forEach(([key, value]) => {
//       if (value) {
//         if (value.length === 24 && !value.includes("/")) {
//           console.error(`❌ INVALID ${key}: Looks like MongoDB ID: ${value}`);
//           console.error(
//             "   Expected format: vehicles/entry/photos/123-front.jpg",
//           );
//           photosObject[key] = null; // Reset invalid values
//         } else if (!value.includes("/")) {
//           console.error(`❌ INVALID ${key}: Missing folder path: ${value}`);
//           photosObject[key] = null;
//         } else {
//           // console.log(`✅ ${key}: ${value}`);
//         }
//       }
//     });

//     const entryMedia = {
//       anprImage: media?.anprImage || null,
//       photos: photosObject, // 🔥 Object with keys, not array
//       video: media?.video || null,
//       challanImage: media?.challanImage || null,
//     };

//     // console.log('📸 Structured entryMedia:', JSON.stringify(entryMedia, null, 2));

//     // Create trip
//     const trip = await Trip.create({
//       clientId,
//       siteId,
//       vehicleId: vehicle._id,
//       vendorId,
//       supervisorId: supervisorId,
//       projectManagerId: site?.projectManagerId || clientId,
//       plateText: vehicleNumber.toUpperCase(),
//       driverName: driverName || "",
//       entryAt: entryTime ? new Date(entryTime) : new Date(),
//       entryGate: entryGate || "Manual Entry",
//       status: "INSIDE",
//       purpose: purpose || "Manual Entry",
//       loadStatus: loadStatus || "FULL",
//       entryMedia: entryMedia, // 🔥 Properly structured media
//       notes: notes || "",
//       createdBy: supervisorId,
//     });

//     res.status(201).json({
//       success: true,
//       message: "Manual trip entry created successfully",
//       data: {
//         tripId: trip.tripId,
//         vehicleId: vehicle._id,
//         entryAt: trip.entryAt,
//         entryMedia: trip.entryMedia, // 🔥 Return for verification
//       },
//     });
//   } catch (error) {
//     console.error("❌ Error creating manual trip:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to create manual trip entry",
//       error: process.env.NODE_ENV === "development" ? error.message : undefined,
//     });
//   }
// };

export const createManualTrip = async (req, res) => {
  try {
    const supervisorId = req.user._id;
    const { siteId, clientId } = req.user;

    const {
      vehicleNumber,
      vehicleType,
      driverName,
      driverPhone,
      vendorId,
      entryTime,
      purpose,
      loadStatus,
      entryGate,
      notes,
      media,
    } = req.body;

    if (!vehicleNumber || !vendorId) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    const plate = vehicleNumber.toUpperCase();

    let vehicle = await Vehicle.findOne({ vehicleNumber: plate, siteId });

    if (vehicle?.isInside) {
      return res.status(409).json({ message: "Vehicle already inside" });
    }

    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleNumber: plate,
        vehicleType: vehicleType || "TRUCK",
        driverName,
        driverPhone,
        vendorId,
        siteId,
        clientId,
        isInside: true,
        lastEntryAt: new Date(),
        createdBy: supervisorId,
      });
    } else {
      Object.assign(vehicle, {
        driverName,
        driverPhone,
        vehicleType,
        vendorId,
        isInside: true,
        lastEntryAt: new Date(),
      });
      await vehicle.save();
    }

    const entryMedia = {
      anprImage: isValidMediaKey(media?.anprImage),
      photos: {
        frontView: isValidMediaKey(media?.photos?.frontView),
        backView: isValidMediaKey(media?.photos?.backView),
        loadView: isValidMediaKey(media?.photos?.loadView),
        driverView: isValidMediaKey(media?.photos?.driverView),
      },
      video: isValidMediaKey(media?.video),
      challanImage: isValidMediaKey(media?.challanImage),
    };

    const site = await Site.findById(siteId);

    const trip = await Trip.create({
      clientId,
      siteId,
      vehicleId: vehicle._id,
      vendorId,
      supervisorId,
      projectManagerId: site?.projectManagerId || clientId,
      plateText: plate,
      driverName,
      entryAt: entryTime ? new Date(entryTime) : new Date(),
      entryGate: entryGate || "Manual Entry",
      status: "INSIDE",
      purpose,
      loadStatus,
      entryMedia,
      notes,
      createdBy: supervisorId,
    });

    res.status(201).json({
      success: true,
      tripId: trip.tripId,
      entryMedia,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed" });
  }
};





/**
 * @desc   Create manual trip entry (Mobile)
 * @route  POST /api/mobile/trips/manual
 * @access Guard, Supervisor
 */
// export const createManualTripMobile = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const { siteId, clientId } = req.user;

//     if (!siteId || !clientId) {
//       return res.status(403).json({
//         success: false,
//         message: "User not assigned to site or client",
//       });
//     }

//     const {
//       vehicleNumber,
//       vehicleType,
//       driverName,
//       driverPhone,
//       vendorId,
//       entryTime,
//       purpose,
//       loadStatus,
//       entryGate,
//       notes,
//       media,
//     } = req.body;

//     // 🔥 FIX: Make vendorId optional for certain vehicle types (like personal vehicles/bikes)
//     if (!vehicleNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "Vehicle number is required",
//       });
//     }

//     // If vehicle is a personal vehicle type, allow vendorId to be optional
//     const personalVehicleTypes = [
//       "BIKE",
//       "CAR",
//       "SCOOTER",
//       "MOTORCYCLE",
//       "PERSONAL",
//     ];
//     const isPersonalVehicle = personalVehicleTypes.includes(
//       (vehicleType || "").toUpperCase(),
//     );

//     if (!isPersonalVehicle && !vendorId) {
//       return res.status(400).json({
//         success: false,
//         message: "Vendor ID is required for commercial vehicles",
//         field: "vendorId",
//         validVehicleTypes: ["BIKE", "CAR", "SCOOTER", "MOTORCYCLE", "PERSONAL"],
//       });
//     }

//     const normalizedVehicleNumber = vehicleNumber.toUpperCase();

//     // Find existing vehicle
//     let vehicle = await Vehicle.findOne({
//       vehicleNumber: normalizedVehicleNumber,
//       siteId,
//     });

//     if (vehicle?.isInside) {
//       return res.status(409).json({
//         success: false,
//         message: "Vehicle is already inside the site",
//       });
//     }

//     // Create or update vehicle
//     if (!vehicle) {
//       vehicle = await Vehicle.create({
//         vehicleNumber: normalizedVehicleNumber,
//         vehicleType: vehicleType || "TRUCK",
//         driverName: driverName || "",
//         driverPhone: driverPhone || "",
//         vendorId: vendorId || null, // Allow null for personal vehicles
//         siteId,
//         clientId,
//         isInside: true,
//         lastEntryAt: entryTime ? new Date(entryTime) : new Date(),
//         createdBy: userId,
//         isPersonalVehicle: isPersonalVehicle,
//       });
//     } else {
//       vehicle.driverName = driverName || vehicle.driverName;
//       vehicle.driverPhone = driverPhone || vehicle.driverPhone;
//       vehicle.vehicleType = vehicleType || vehicle.vehicleType;
//       vehicle.vendorId = vendorId || vehicle.vendorId;
//       vehicle.isInside = true;
//       vehicle.lastEntryAt = entryTime ? new Date(entryTime) : new Date();
//       vehicle.isPersonalVehicle = isPersonalVehicle;
//       await vehicle.save();
//     }

//     // Fetch site for PM assignment
//     const site = await Site.findById(siteId);

//     // 🔥 FIX: Structure entryMedia properly
//     // Handle both old array format and new object format
//     let photosObject = {
//       frontView: null,
//       backView: null,
//       loadView: null,
//       driverView: null,
//     };

//     if (media?.photos) {
//       if (Array.isArray(media.photos)) {
//         // 🔥 OLD FORMAT: Convert array to object
//         console.warn(
//           "⚠️ Received photos as array (old format), converting to object",
//         );
//         const photoKeys = ["frontView", "backView", "loadView", "driverView"];
//         media.photos.forEach((photoUrl, index) => {
//           if (photoUrl && photoKeys[index]) {
//             photosObject[photoKeys[index]] = photoUrl;
//           }
//         });
//       } else if (typeof media.photos === "object") {
//         // 🔥 NEW FORMAT: Already an object with keys
//         // console.log('✅ Received photos as object (new format)');
//         photosObject = {
//           frontView: media.photos.frontView || null,
//           backView: media.photos.backView || null,
//           loadView: media.photos.loadView || null,
//           driverView: media.photos.driverView || null,
//         };
//       }
//     }

//     // 🔥 Validate that photo keys are file paths, not MongoDB IDs
//     Object.entries(photosObject).forEach(([key, value]) => {
//       if (value) {
//         if (value.length === 24 && !value.includes("/")) {
//           console.error(`❌ INVALID ${key}: Looks like MongoDB ID: ${value}`);
//           console.error(
//             "   Expected format: vehicles/entry/photos/123-front.jpg",
//           );
//           photosObject[key] = null; // Reset invalid values
//         } else if (!value.includes("/")) {
//           console.error(`❌ INVALID ${key}: Missing folder path: ${value}`);
//           photosObject[key] = null;
//         } else {
//           // console.log(`✅ ${key}: ${value}`);
//         }
//       }
//     });

//     const entryMedia = {
//       anprImage: media?.anprImage || null,
//       photos: photosObject, // 🔥 Object with keys, not array
//       video: media?.video || null,
//       challanImage: media?.challanImage || null,
//     };

//     // console.log('📸 Structured entryMedia:', JSON.stringify(entryMedia, null, 2));

//     // Create trip
//     const trip = await Trip.create({
//       clientId,
//       siteId,
//       vehicleId: vehicle._id,
//       vendorId: vendorId || null, // Allow null for personal vehicles
//       supervisorId: userId,
//       projectManagerId: site?.projectManagerId || clientId,
//       plateText: normalizedVehicleNumber,
//       driverName: driverName || "",
//       entryAt: entryTime ? new Date(entryTime) : new Date(),
//       entryGate: entryGate || "Mobile Manual Entry",
//       status: "INSIDE",
//       purpose: purpose || "Manual Entry",
//       loadStatus: loadStatus || "FULL",
//       entryMedia: entryMedia, // 🔥 Properly structured media
//       notes: notes || "",
//       createdBy: userId,
//       source: "MOBILE",
//       isPersonalVehicle: isPersonalVehicle,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Manual trip entry created successfully (mobile)",
//       data: {
//         tripId: trip.tripId,
//         vehicleId: vehicle._id,
//         entryAt: trip.entryAt,
//         entryMedia: trip.entryMedia, // 🔥 Return for verification
//       },
//     });
//   } catch (error) {
//     console.error("❌ Mobile manual trip error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to create manual trip entry",
//       error: process.env.NODE_ENV === "development" ? error.message : undefined,
//     });
//   }
// };


export const createManualTripMobile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { siteId, clientId } = req.user;

    const {
      vehicleNumber,
      vehicleType,
      driverName,
      driverPhone,
      vendorId,
      purpose,
      loadStatus,
      entryGate,
      notes,
      media,
    } = req.body;

    if (!vehicleNumber) {
      return res.status(400).json({ message: "Vehicle number required" });
    }

    const plate = vehicleNumber.toUpperCase();
    const personalTypes = ["BIKE", "CAR", "SCOOTER", "PERSONAL"];
    const isPersonal = personalTypes.includes((vehicleType || "").toUpperCase());

    let vehicle = await Vehicle.findOne({ vehicleNumber: plate, siteId });

    if (vehicle?.isInside) {
      return res.status(409).json({ message: "Already inside" });
    }

    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleNumber: plate,
        vehicleType,
        driverName,
        driverPhone,
        vendorId: isPersonal ? null : vendorId,
        siteId,
        clientId,
        isInside: true,
        lastEntryAt: new Date(),
        createdBy: userId,
        isPersonalVehicle: isPersonal,
      });
    } else {
      Object.assign(vehicle, {
        driverName,
        driverPhone,
        vehicleType,
        vendorId: isPersonal ? null : vendorId,
        isInside: true,
        lastEntryAt: new Date(),
      });
      await vehicle.save();
    }

    const entryMedia = {
      photos: {
        frontView: isValidMediaKey(media?.photos?.frontView),
        backView: isValidMediaKey(media?.photos?.backView),
        loadView: isValidMediaKey(media?.photos?.loadView),
        driverView: isValidMediaKey(media?.photos?.driverView),
      },
      video: isValidMediaKey(media?.video),
    };

    const site = await Site.findById(siteId);

    const trip = await Trip.create({
      clientId,
      siteId,
      vehicleId: vehicle._id,
      vendorId: isPersonal ? null : vendorId,
      supervisorId: userId,
      projectManagerId: site?.projectManagerId || clientId,
      plateText: plate,
      driverName,
      entryAt: new Date(),
      entryGate: entryGate || "Mobile Manual Entry",
      status: "INSIDE",
      purpose,
      loadStatus,
      entryMedia,
      notes,
      source: "MOBILE",
      isPersonalVehicle: isPersonal,
    });

    res.status(201).json({ success: true, tripId: trip.tripId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};


/**
 * @desc   Export trip history
 * @route  GET /api/trips/export
 * @access Supervisor, PM, Admin, Client
 */
export const exportTripHistory = async (req, res) => {
  try {
    const siteId = req.user?.siteId || req.query.siteId;
    const clientId = req.user?.clientId;
    const { period = "last7days", format = "csv" } = req.query;

    if (!siteId && !clientId) {
      return res.status(400).json({
        success: false,
        message: "Site ID or Client ID is required",
      });
    }

    // Date filter
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
        startDate = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        );
        break;
    }

    const query = {};
    if (siteId) {
      query.siteId = new mongoose.Types.ObjectId(siteId);
    } else if (clientId) {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    }

    if (startDate) {
      query.entryAt = { $gte: startDate };
    }

    // Fetch trips
    const trips = await Trip.find(query)
      .populate("vendorId", "name companyName")
      .populate("vehicleId", "vehicleNumber vehicleType")
      .populate("siteId", "name")
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
        Trip_ID: t.tripId || "N/A",
        Vehicle_Number: t.vehicleId?.vehicleNumber || t.plateText || "Unknown",
        Vehicle_Type: t.vehicleId?.vehicleType || "Unknown",
        Vendor: t.vendorId?.name || t.vendorId?.companyName || "Unknown",
        Site: t.siteId?.name || "Unknown",
        Entry_Time: t.entryAt
          ? new Date(t.entryAt).toLocaleString("en-IN")
          : "N/A",
        Exit_Time: t.exitAt ? new Date(t.exitAt).toLocaleString("en-IN") : "--",
        Duration: duration,
        Status: t.status,
        Purpose: t.purpose || "",
        Load_Status: t.loadStatus || "FULL",
        Entry_Gate: t.entryGate || "N/A",
        Exit_Gate: t.exitGate || "N/A",
      };
    });

    // CSV Export
    if (format === "csv") {
      const parser = new Parser();
      const csv = parser.parse(rows);

      res.header("Content-Type", "text/csv");
      res.attachment(`trip-history-${Date.now()}.csv`);
      return res.send(csv);
    }

    // Excel Export
    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Trip History");

      if (rows.length > 0) {
        sheet.columns = Object.keys(rows[0]).map((key) => ({
          header: key.replace(/_/g, " "),
          key,
          width: 25,
        }));

        rows.forEach((row) => sheet.addRow(row));
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=trip-history-${Date.now()}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    res.status(400).json({
      success: false,
      message: "Invalid export format. Use 'csv' or 'excel'.",
    });
  } catch (error) {
    console.error("❌ Error exporting trip history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export trip history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc   Get trip statistics
 * @route  GET /api/trips/stats
 * @access Supervisor, PM, Admin, Client
 */
export const getTripStats = async (req, res) => {
  try {
    const siteId = req.user?.siteId || req.query.siteId;
    const clientId = req.user?.clientId;
    const { period = "today" } = req.query;

    if (!siteId && !clientId) {
      return res.status(400).json({
        success: false,
        message: "Site ID or Client ID is required",
      });
    }

    // Date range
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "yesterday":
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(startDate);
        yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
        break;
      case "last7days":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "last30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
    }

    const query = {};
    if (siteId) {
      query.siteId = new mongoose.Types.ObjectId(siteId);
    } else if (clientId) {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    }
    query.entryAt = { $gte: startDate };

    const [totalTrips, activeTrips, completedTrips, deniedTrips, avgDuration] =
      await Promise.all([
        Trip.countDocuments(query),
        Trip.countDocuments({ ...query, status: "INSIDE" }),
        Trip.countDocuments({ ...query, status: "EXITED" }),
        Trip.countDocuments({ ...query, status: "DENIED" }),
        Trip.aggregate([
          { $match: { ...query, status: "EXITED", exitAt: { $ne: null } } },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: { $subtract: ["$exitAt", "$entryAt"] } },
            },
          },
        ]),
      ]);

    const avgDurationMinutes = avgDuration[0]?.avgDuration
      ? Math.round(avgDuration[0].avgDuration / (1000 * 60))
      : 0;

    res.json({
      success: true,
      data: {
        totalTrips,
        activeTrips,
        completedTrips,
        deniedTrips,
        avgDuration: `${Math.floor(avgDurationMinutes / 60)}h ${avgDurationMinutes % 60}m`,
        period,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching trip stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trip statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
