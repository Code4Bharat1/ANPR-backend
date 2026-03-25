import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import Device from "../models/Device.model.js";
import Trip from "../models/Trip.model.js";
import AuditLog from "../models/AuditLog.model.js";
import SuperAdmin from "../models/superadmin.model.js";
import AppSettings from "../models/AppSettings.model.js";
import Notification from "../models/Notification.model.js";
import { PLANS } from "../config/plans.js"; 
import { comparePassword, hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import mongoose from "mongoose";
import { encrypt } from "../utils/encryption.util.js";
import { invalidateTenantCache } from "../config/tenantDB.js";
/* ======================================================
   DASHBOARD - Updated for Device Model with devicetype field
====================================================== */
export const dashboardOverview = async (req, res, next) => {
  try {
    const totalClients = await Client.countDocuments();
    const activeClients = await Client.countDocuments({ isActive: true });
    const expiredClients = await Client.countDocuments({
      packageEnd: { $lt: new Date() },
    });

    const totalSites = await Site.countDocuments();

    // 🔹 Total devices (ALL)
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isEnabled: true });

    // 🔹 ANPR stats
    const totalANPRDevices = await Device.countDocuments({ devicetype: "ANPR" });
    const onlineANPRDevices = await Device.countDocuments({
      devicetype: "ANPR",
      isOnline: true,
    });
    const offlineANPRCount = await Device.countDocuments({
      devicetype: "ANPR",
      isOnline: false,
    });

    const offlineANPRList = await Device.find(
      { devicetype: "ANPR", isOnline: false },
      { serialNo: 1, siteId: 1, lastActive: 1, ipAddress: 1 }
    ).populate("siteId", "name");

    // 🔹 BIOMETRIC stats ✅
    const totalBiometricDevices = await Device.countDocuments({
      devicetype: "BIOMETRIC",
    });
    const onlineBiometricDevices = await Device.countDocuments({
      devicetype: "BIOMETRIC",
      isOnline: true,
    });
    const offlineBiometricCount = await Device.countDocuments({
      devicetype: "BIOMETRIC",
      isOnline: false,
    });

    const offlineBiometricList = await Device.find(
      { devicetype: "BIOMETRIC", isOnline: false },
      { serialNo: 1, siteId: 1, lastActive: 1, ipAddress: 1 }
    ).populate("siteId", "name");

    // 🔹 Today trips
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTrips = await Trip.countDocuments({
      createdAt: { $gte: todayStart },
    });

    res.json({
      overview: {
        totalClients,
        activeClients,
        expiredClients,
        totalRevenue: null,
      },
      operations: {
        totalSites,
        totalDevices,
        activeDevices,
        totalANPRDevices,
        totalBiometricDevices,
        todayTrips,
      },
      deviceHealth: {
        online: onlineANPRDevices,
        offline: offlineANPRCount,
        offlineDevices: offlineANPRList,
      },
      biometricHealth: {
        online: onlineBiometricDevices,
        offline: offlineBiometricCount,
        offlineBiometricDevices: offlineBiometricList,
      },
      systemHealth: {
        server: "Operational",
        database: "Healthy",
        connectivity:
          offlineANPRCount > 0 || offlineBiometricCount > 0
            ? "Degraded"
            : "Operational",
      },
    });
  } catch (e) {
    next(e);
  }
};


/* ======================================================
   ANALYTICS - FIXED VERSION
====================================================== */

/* ======================================================
   ANALYTICS - FIXED VERSION
====================================================== */

export const analyticsSummary = async (req, res, next) => {
  try {
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);
    const previousPeriod = getPreviousDateRange(period);

    // Parallel queries for better performance
    const [
      totalTrips,
      totalClients,
      totalSites,
      totalDevices,
      previousTrips,
      previousClients
    ] = await Promise.all([
      Trip.countDocuments({ 
        createdAt: { $gte: from, $lte: to } 
      }),
      Client.countDocuments({ 
        createdAt: { $lte: to },
        isActive: true 
      }),
      Site.countDocuments({ 
        createdAt: { $lte: to } 
      }),
      Device.countDocuments({ 
        createdAt: { $lte: to } 
      }),
      Trip.countDocuments({ 
        createdAt: { 
          $gte: previousPeriod.from, 
          $lte: previousPeriod.to 
        } 
      }),
      Client.countDocuments({ 
        createdAt: { $lte: previousPeriod.to },
        isActive: true 
      })
    ]);

    // Top clients with proper aggregation
    const topClients = await Client.aggregate([
      {
        $lookup: {
          from: "trips",
          localField: "_id",
          foreignField: "clientId",
          as: "clientTrips",
          pipeline: [
            {
              $match: {
                createdAt: { $gte: from, $lte: to }
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: "sites",
          localField: "_id",
          foreignField: "clientId",
          as: "clientSites"
        }
      },
      {
        $lookup: {
          from: "devices",
          localField: "_id",
          foreignField: "clientId",
          as: "clientDevices"
        }
      },
      {
        $addFields: {
          trips: { $size: "$clientTrips" },
          sites: { $size: "$clientSites" },
          devices: { $size: "$clientDevices" }
        }
      },
      { $sort: { trips: -1 } },
      { $limit: 5 },
      {
        $project: {
          name: { $ifNull: ["$clientname", "Unknown Client"] },
          trips: 1,
          sites: 1,
          devices: 1,
          packageType: { $ifNull: ["$packageType", "Not Specified"] }
        }
      }
    ]);

    // Calculate growth percentages
    const tripsGrowth = calculateGrowth(totalTrips, previousTrips);
    const clientsGrowth = calculateGrowth(totalClients, previousClients);

    res.json({
      totalTrips,
      totalClients,
      totalSites,
      totalDevices,
      totalRevenue: 0,
      growth: { 
        trips: tripsGrowth,
        clients: clientsGrowth
      },
      topClients,
      period: { from, to }
    });
  } catch (e) {
    console.error('Analytics summary error:', e);
    next(e);
  }
};

// Helper function for growth calculation
const calculateGrowth = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
};

// Fix date range function
const getDateRange = (period = "7d") => {
  const now = new Date();
  const to = new Date(now); // End date is current time
  
  let from = new Date(now);
  
  // Set to date to end of day
  to.setHours(23, 59, 59, 999);

  switch (period) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(now.getDate() - 6); // Including today
      from.setHours(0, 0, 0, 0);
      break;
    case "30d":
      from.setDate(now.getDate() - 29); // Including today
      from.setHours(0, 0, 0, 0);
      break;
    case "90d":
      from.setDate(now.getDate() - 89); // Including today
      from.setHours(0, 0, 0, 0);
      break;
    default:
      from.setDate(now.getDate() - 6);
      from.setHours(0, 0, 0, 0);
  }

  return { from, to };
};

// Fix previous date range
const getPreviousDateRange = (period = "7d") => {
  const now = new Date();
  let to = new Date(now);
  let from = new Date(now);

  switch (period) {
    case "today":
      from.setDate(now.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setDate(now.getDate() - 1);
      to.setHours(23, 59, 59, 999);
      break;
    case "7d":
      from.setDate(now.getDate() - 13); // Previous 7 days
      from.setHours(0, 0, 0, 0);
      to.setDate(now.getDate() - 7);
      to.setHours(23, 59, 59, 999);
      break;
    case "30d":
      from.setDate(now.getDate() - 59);
      from.setHours(0, 0, 0, 0);
      to.setDate(now.getDate() - 30);
      to.setHours(23, 59, 59, 999);
      break;
    case "90d":
      from.setDate(now.getDate() - 179);
      from.setHours(0, 0, 0, 0);
      to.setDate(now.getDate() - 90);
      to.setHours(23, 59, 59, 999);
      break;
    default:
      from.setDate(now.getDate() - 13);
      from.setHours(0, 0, 0, 0);
      to.setDate(now.getDate() - 7);
      to.setHours(23, 59, 59, 999);
  }

  return { from, to };
};

export const tripVolumeDaily = async (req, res, next) => {
  try {
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);

    // Determine format based on period
    let format;
    if (period === "today") {
      format = "%H:00";
    } else if (period === "7d" || period === "30d") {
      format = "%Y-%m-%d";
    } else {
      format = "%Y-%m-%d"; // Default for longer periods
    }

    const data = await Trip.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt", timezone: "Asia/Kolkata" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(data.map(d => ({ date: d._id, trips: d.count || 0 })));
  } catch (e) {
    console.error('Trip volume error:', e);
    next(e);
  }
};

export const clientDistribution = async (req, res, next) => {
  try {
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);

    const dist = await Client.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { 
        $group: { 
          _id: { 
            $ifNull: ["$packageType", "Not Specified"] 
          }, 
          count: { $sum: 1 } 
        } 
      }
    ]);

    const total = dist.reduce((a, b) => a + b.count, 0) || 1;

    res.json(
      dist.map(d => ({
        label: d._id,
        count: d.count,
        percent: Math.round((d.count / total) * 100)
      }))
    );
  } catch (e) {
    console.error('Client distribution error:', e);
    next(e);
  }
};


// Add revenue analytics endpoint
export const revenueAnalytics = async (req, res, next) => {
  try {
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);

    const revenueData = await Trip.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          trips: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(revenueData.map(d => ({ 
      date: d._id, 
      revenue: d.revenue || 0,
      trips: d.trips 
    })));
  } catch (e) {
    next(e);
  }
};





/* ======================================================
   AUDIT LOGS
====================================================== */
export const getAuditLogs = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const from = new Date(Date.now() - Number(days) * 86400000);

    const logs = await AuditLog.find({
      createdAt: { $gte: from },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(logs);
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   CLIENT MANAGEMENT
====================================================== */
export const createClient = async (req, res, next) => {
  try {
    const {
      clientname,          // ✅ client name
      companyName,
      email,
      phone,
      password,
      packageType,
      packageStart,
      packageEnd,
      address,
    } = req.body;

    // 📦 Validate package
    const plan = PLANS[packageType];
    if (!plan) {
      return res.status(400).json({ message: "Invalid package" });
    }

    // 🔐 Generate password if not sent
    const finalPassword =
      password || Math.random().toString(36).slice(-8);

    const client = await Client.create({
      clientname,                 // ✅ FIXED
      companyName,
      email,
      phone,
      password: finalPassword,
      packageType,
      packageStart,
      packageEnd,
      location: address,
      address,                    // ✅ FIXED

      // ✅ Correct limits mapping
      userLimits: {
        pm: plan.limits.pm,
        supervisor: plan.limits.supervisor,
      },
      deviceLimits: plan.limits.devices,

      createdBy: req.user.id,
      isActive: true,
    });

    res.status(201).json({
      message: "Client created successfully",
      data: client,
      tempPassword: password ? undefined : finalPassword, // optional
    });

  } catch (e) {
    next(e);
  }
};


export const listClients = async (req, res, next) => {
  try {
    const clients = await Client.find()
      .sort({ createdAt: -1 })
      .lean();

    const clientIds = clients.map(c => c._id);

    const sites = await Site.find({ clientId: { $in: clientIds } })
      .select("_id name clientId")
      .lean();

    const clientsWithSites = clients.map(client => ({
      ...client,
      sites: sites.filter(
        site => String(site.clientId) === String(client._id)
      ),
      siteCount: sites.filter(
        site => String(site.clientId) === String(client._id)
      ).length
    }));

    res.json(clientsWithSites);
  } catch (e) {
    next(e);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const old = await Client.findById(clientId);
    if (!old) {
      return res.status(404).json({ message: "Client not found" });
    }

    let updateData = { ...req.body };

    /* 🔁 PACKAGE CHANGE HANDLING */
    if (req.body.packageType && req.body.packageType !== old.packageType) {
      const plan = PLANS[req.body.packageType];
      if (!plan) {
        return res.status(400).json({ message: "Invalid package type" });
      }

      updateData.userLimits = {
        pm: plan.limits.pm,
        supervisor: plan.limits.supervisor,
      };
      updateData.deviceLimits = plan.limits.devices;
    }

    const updated = await Client.findByIdAndUpdate(
      clientId,
      updateData,
      { new: true }
    );

    await logAudit({
      req,
      action: "UPDATE",
      module: "CLIENT",
      oldValue: old,
      newValue: updated,
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};


export const deactivateClient = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const clientId = req.params.id;

    const client = await Client.findById(clientId).session(session);
    if (!client) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Client not found" });
    }

    // 🚫 Already deactivated
    if (!client.isActive) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Client is already deactivated",
      });
    }

    /* =====================
       DEACTIVATE CLIENT
    ===================== */
    client.isActive = false;
    client.deactivatedAt = new Date();
    await client.save({ session });

    /* =====================
       DISABLE ALL DEVICES
    ===================== */
    await Device.updateMany(
      { clientId },
      { $set: { isEnabled: false, isOnline: false } },
      { session }
    );

    /* =====================
       LOGOUT ALL USERS
    ===================== */
    await RefreshToken.deleteMany(
      { clientId },
      { session }
    );

    /* =====================
       AUDIT LOG
    ===================== */
    await logAudit({
      req,
      action: "DEACTIVATE",
      module: "CLIENT",
      newValue: client,
    });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Client deactivated successfully",
    });

  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    next(e);
  }
};

/* ======================================================
   DEVICE MANAGEMENT
====================================================== */
export const createDevice = async (req, res) => {
  try {
    const {
      clientId,
      deviceName,
      siteId,
      deviceType,
      serialNumber,
      ipAddress,
      notes,
      role,
      gateId,
      lane,
    } = req.body;

    if (!clientId || !deviceType || !deviceName || !serialNumber || !ipAddress || !siteId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const normalizedType = deviceType.toUpperCase();

    const client = await Client.findById(clientId);
    if (!client || !client.isActive) {
      return res.status(403).json({ message: "Client inactive or not found" });
    }

    const site = await Site.findOne({ _id: siteId, clientId });
    if (!site) {
      return res.status(404).json({ message: "Site not found for this client" });
    }

    if (await Device.findOne({ serialNo: serialNumber })) {
      return res.status(409).json({ message: "Serial number already exists" });
    }

    if (await Device.findOne({ ipAddress, clientId })) {
      return res.status(409).json({ message: "IP already used for this client" });
    }

    // Validate gateId if provided
    if (gateId) {
      const gateExists = site.gates.some(g => g._id.toString() === gateId);
      if (!gateExists) {
        return res.status(400).json({ message: "gateId does not exist on this site" });
      }
    }

    const device = await Device.create({
      clientId,
      siteId,
      deviceName,
      devicetype: normalizedType,
      serialNo: serialNumber,
      ipAddress,
      notes,
      role: role ? role.toUpperCase() : null,
      gateId: gateId || null,
      lane: lane || null,
      isEnabled: true,
      isOnline: false,
    });

    await Site.findByIdAndUpdate(siteId, { $addToSet: { assignedDevices: device._id } });

    // Sync gate device arrays
    if (gateId) {
      const arrayFields = [];
      if (normalizedType === "TOP_CAMERA") arrayFields.push("topCameraDevices");
      if (normalizedType === "ANPR") {
        const r = role?.toUpperCase();
        if (r === "ENTRY")      arrayFields.push("entryDevices");
        if (r === "EXIT")       arrayFields.push("exitDevices");
        if (r === "ENTRY_EXIT") arrayFields.push("entryDevices", "exitDevices");
      }
      if (arrayFields.length) {
        const pushOps = {};
        arrayFields.forEach(f => { pushOps[`gates.$.${f}`] = device._id; });
        await Site.updateOne(
          { _id: siteId, "gates._id": gateId },
          { $addToSet: pushOps }
        );
      }
    }

    res.status(201).json({ success: true, message: "Device created successfully", data: device });
  } catch (err) {
    console.error("CREATE DEVICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const deviceStats = async (req, res, next) => {
  try {
    const total = await Device.countDocuments();
    const online = await Device.countDocuments({ isOnline: true });
    const offline = await Device.countDocuments({ isOnline: false });
    res.json({ total, online, offline });
  } catch (e) {
    next(e);
  }
};

export const listDevices = async (req, res) => {
  try {
    const devices = await Device.find()
      .populate("clientId", "companyName")
      .populate("siteId", "name")
      .lean();

    const formatted = devices.map(d => ({
      _id: d._id,
      name: d.deviceName || d.serialNo, // ✅ Yeh line change karein
      deviceId: d.serialNo,
      type: d.devicetype,
      status: d.isOnline ? "online" : "offline",

      clientId: d.clientId?._id,
      siteId: d.siteId?._id,

      clientName: d.clientId?.companyName || "Not Assigned",
      siteName: d.siteId?.name || "Not Assigned",

      lastActive: d.updatedAt
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch devices" });
  }
};

export const toggleDevice = async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.id);
    device.isEnabled = !device.isEnabled;
    device.isOnline = device.isEnabled;
    await device.save();

    await logAudit({ req, action: "TOGGLE", module: "DEVICE", newValue: device });

    const formatted = {
      _id: device._id,
        name: device.deviceName || device.serialNo, // ✅ Change
      deviceId: device.serialNo,
      type: device.devicetype,
      status: device.isOnline ? "online" : "offline",
      isEnabled: device.isEnabled,
      isOnline: device.isOnline
    };

    res.json(formatted);
  } catch (e) {
    next(e);
  }
};

export const getDeviceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const device = await Device.findById(id)
      .populate("clientId", "name")
      .populate("siteId", "name");

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const formattedDevice = {
      _id: device._id,
        name: device.deviceName || device.serialNo, // ✅ Change
      deviceId: device.serialNo,
      type: device.devicetype,
      status: device.isOnline ? "online" : "offline",
      clientName: device.clientId?.name || "Not Assigned",
      siteName: device.siteId?.name || "Not Assigned",
      lastActive: device.updatedAt,
    };

    res.json(formattedDevice);
  } catch (e) {
    next(e);
  }
};

export const updateDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deviceType, serialNumber, clientId, siteId, ipAddress, notes } = req.body;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const oldValue = device.toObject();

    // 🔥 Track old site BEFORE change
    const oldSiteId = device.siteId?.toString() || null;

    // ---- DEVICE FIELD UPDATES ----
    if (deviceType) device.devicetype = deviceType.toUpperCase();
    if (serialNumber) device.serialNo = serialNumber;

    if (clientId === "") device.clientId = null;
    else if (clientId) device.clientId = clientId;

    if (siteId === "") device.siteId = null;
    else if (siteId) device.siteId = siteId;

    if (ipAddress !== undefined) device.ipAddress = ipAddress;
    if (notes !== undefined) device.notes = notes;

    await device.save();

    // 🔥 Track new site AFTER save
    const newSiteId = device.siteId?.toString() || null;

    // ---- 🔥 SITE SYNC LOGIC ----

    // 1️⃣ Remove from OLD site
    if (oldSiteId && oldSiteId !== newSiteId) {
      await Site.findByIdAndUpdate(
        new mongoose.Types.ObjectId(oldSiteId),
        { $pull: { assignedDevices: device._id } }
      );
    }

    // 2️⃣ Add to NEW site
    if (newSiteId && oldSiteId !== newSiteId) {
      await Site.findByIdAndUpdate(
        new mongoose.Types.ObjectId(newSiteId),
        { $addToSet: { assignedDevices: device._id } }
      );
    }

    // ---- RESPONSE ----
    const populatedDevice = await Device.findById(device._id)
      .populate("clientId", "companyName")
      .populate("siteId", "name");

    await logAudit({
      req,
      action: "UPDATE",
      module: "DEVICE",
      oldValue,
      newValue: populatedDevice.toObject(),
    });

    res.json({
      _id: populatedDevice._id,
      name: populatedDevice.deviceName || populatedDevice.serialNo,
      deviceId: populatedDevice.serialNo,
      type: populatedDevice.devicetype,
      status: populatedDevice.isOnline ? "online" : "offline",

      clientId: populatedDevice.clientId?._id,
      siteId: populatedDevice.siteId?._id,

      clientName: populatedDevice.clientId?.companyName || "Not Assigned",
      siteName: populatedDevice.siteId?.name || "Not Assigned",

      lastActive: populatedDevice.updatedAt,
    });

  } catch (e) {
    next(e);
  }
};

// ✅ DELETE DEVICE FUNCTION
export const deleteDevice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const device = await Device.findById(id)
      .populate("clientId", "companyName")
      .populate("siteId", "name");

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device not found"
      });
    }

    const deletedDevice = device.toObject();

    await Device.findByIdAndDelete(id);

    await logAudit({
      req,
      action: "DELETE",
      module: "DEVICE",
      oldValue: deletedDevice,
      newValue: null
    });

    res.json({
      success: true,
      message: "Device deleted successfully",
      data: {
        _id: deletedDevice._id,
        name: deletedDevice.serialNo,
        deviceId: deletedDevice.serialNo,
        type: deletedDevice.devicetype
      }
    });

  } catch (e) {
    console.error("Error deleting device:", e);
    next(e);
  }
};

/* ======================================================
   PROFILE
====================================================== */
export const getProfile = async (req, res, next) => {
  try {
    const me = await SuperAdmin.findById(req.user.id).select("-password");
    res.json(me);
  } catch (e) {
    next(e);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { fullName, phone, location } = req.body;

    const admin = await SuperAdmin.findByIdAndUpdate(
      req.user.id,
      { fullName, phone, location },
      { new: true }
    ).select("-password");

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: admin,
    });
  } catch (e) {
    next(e);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const admin = await SuperAdmin.findById(req.user.id).select("+password");
    if (!admin) {
      return res.status(404).json({ message: "SuperAdmin not found" });
    }

    const isMatch = await comparePassword(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    admin.password = await hashPassword(newPassword);
    await admin.save();

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   GET SETTINGS
====================================================== */
export const getSettings = async (req, res, next) => {
  try {
    let settings = await AppSettings.findOne();

    if (!settings) {
      settings = await AppSettings.create({});
    }

    res.json({
      success: true,
      data: {
        maintenanceMode: settings.maintenanceMode,
        allowSuperAdminRegister: settings.allowSuperAdminRegister,
        defaultRetentionDays: settings.defaultRetentionDays,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   UPDATE SETTINGS
====================================================== */
export const updateSettings = async (req, res, next) => {
  try {
    let settings = await AppSettings.findOne();

    if (!settings) {
      settings = await AppSettings.create({});
    }

    const oldValue = settings.toObject();

    settings.maintenanceMode =
      req.body.maintenanceMode ?? settings.maintenanceMode;

    settings.allowSuperAdminRegister =
      req.body.allowSuperAdminRegister ?? settings.allowSuperAdminRegister;

    settings.defaultRetentionDays =
      req.body.defaultRetentionDays ?? settings.defaultRetentionDays;

    settings.supportEmail =
      req.body.supportEmail ?? settings.supportEmail;

    settings.supportPhone =
      req.body.supportPhone ?? settings.supportPhone;

    await settings.save();

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   NOTIFICATIONS
====================================================== */
export const listNotifications = async (req, res, next) => {
  try {
    const list = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   FR-9.4: PER-CLIENT PLAN OVERRIDE
   PATCH /api/superadmin/clients/:id/plan-override
   Body: {
     featuresOverride: { barrierAutomation: true, biometricOpening: false, ... },
     deviceLimits:     { ANPR: 3, BARRIER: 2, ... },
     userLimits:       { pm: 5, supervisor: 10 },
     siteLimits:       7
   }
====================================================== */
export const updatePlanOverride = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { featuresOverride, deviceLimits, userLimits, siteLimits } = req.body;

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    const oldValue = client.toObject();
    const updateData = {};

    // Feature flag overrides (FR-9.4)
    if (featuresOverride && typeof featuresOverride === "object") {
      const validKeys = ["barrierAutomation", "biometricOpening", "topCamera", "aiAnalytics", "dedicatedDB"];
      const sanitized = {};
      for (const key of validKeys) {
        if (key in featuresOverride) sanitized[key] = Boolean(featuresOverride[key]);
      }
      updateData.featuresOverride = sanitized;
    }

    // Device limit overrides
    if (deviceLimits && typeof deviceLimits === "object") {
      const validTypes = ["ANPR", "BARRIER", "BIOMETRIC", "TOP_CAMERA", "OVERVIEW"];
      const sanitized = {};
      for (const type of validTypes) {
        if (type in deviceLimits) sanitized[type] = Number(deviceLimits[type]);
      }
      updateData.deviceLimits = { ...client.deviceLimits?.toObject?.() ?? {}, ...sanitized };
    }

    // User limit overrides
    if (userLimits && typeof userLimits === "object") {
      updateData.userLimits = {
        pm:         userLimits.pm         != null ? Number(userLimits.pm)         : client.userLimits?.pm,
        supervisor: userLimits.supervisor != null ? Number(userLimits.supervisor) : client.userLimits?.supervisor,
      };
    }

    // Site limit override
    if (siteLimits != null) {
      updateData.siteLimits = Number(siteLimits);
    }

    const updated = await Client.findByIdAndUpdate(id, updateData, { new: true });

    await logAudit({
      req,
      action: "PLAN_OVERRIDE",
      module: "CLIENT",
      oldValue,
      newValue: updated.toObject(),
    });

    res.json({
      success: true,
      message: "Plan override updated successfully",
      data: {
        clientId: updated._id,
        packageType: updated.packageType,
        featuresOverride: updated.featuresOverride,
        deviceLimits: updated.deviceLimits,
        userLimits: updated.userLimits,
        siteLimits: updated.siteLimits,
      },
    });
  } catch (err) {
    next(err);
  }
};


/* ======================================================
   PROVISION DEDICATED DB
   POST /api/superadmin/clients/:id/provision-db
   Body: { connectionString: "mongodb+srv://...", dbName: "client_xyz" }
   Auth: superadmin only

   Encrypts the connection string and stores it on the client.
   Sets dbConfig.mode = "dedicated".
   The TenantConnectionManager will pick this up on the next request.
====================================================== */


export const provisionDedicatedDB = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { connectionString, dbName } = req.body;

    if (!connectionString) {
      return res.status(400).json({ message: "connectionString is required" });
    }

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    if (client.packageType !== "ENTERPRISE") {
      return res.status(403).json({
        message: "Dedicated DB is only available for ENTERPRISE clients",
        code: "FEATURE_NOT_IN_PLAN",
      });
    }

    // Encrypt before storing (NFR-S8)
    const encryptedURI = encrypt(connectionString);

    await Client.findByIdAndUpdate(id, {
      "dbConfig.mode": "dedicated",
      "dbConfig.connectionString": encryptedURI,
      "dbConfig.dbName": dbName || null,
    });

    await logAudit({
      req,
      action: "PROVISION_DB",
      module: "CLIENT",
      newValue: { clientId: id, mode: "dedicated", dbName: dbName || null },
    });

    invalidateTenantCache(id);

    return res.json({
      success: true,
      message: "Dedicated DB provisioned successfully",
      data: { mode: "dedicated", dbName: dbName || null },
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   DEPROVISION DEDICATED DB
   DELETE /api/superadmin/clients/:id/provision-db
   Reverts client back to shared DB mode.
====================================================== */
export const deprovisionDedicatedDB = async (req, res, next) => {
  try {
    const { id } = req.params;

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    await Client.findByIdAndUpdate(id, {
      "dbConfig.mode": "shared",
      "dbConfig.connectionString": null,
      "dbConfig.dbName": null,
    });

    await logAudit({
      req,
      action: "DEPROVISION_DB",
      module: "CLIENT",
      newValue: { clientId: id, mode: "shared" },
    });

    invalidateTenantCache(id);

    return res.json({
      success: true,
      message: "Client reverted to shared DB",
    });
  } catch (err) {
    next(err);
  }
};
