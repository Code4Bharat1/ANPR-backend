import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import Device from "../models/Device.model.js";
import Trip from "../models/Trip.model.js";
import AuditLog from "../models/AuditLog.model.js";
import SuperAdmin from "../models/superadmin.model.js";
import AppSettings from "../models/AppSettings.model.js";
import Notification from "../models/Notification.model.js";

import { comparePassword, hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/* ======================================================
   DASHBOARD
====================================================== */
export const dashboardOverview = async (req, res, next) => {
  try {
    const totalClients = await Client.countDocuments();
    const activeClients = await Client.countDocuments({ isActive: true });
    const expiredClients = await Client.countDocuments({
      packageEnd: { $lt: new Date() },
    });

    const totalSites = await Site.countDocuments();
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isEnabled: true });
    const onlineDevices = await Device.countDocuments({ isOnline: true });
    const offlineDevices = await Device.countDocuments({ isOnline: false });

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
        todayTrips,
      },
      deviceHealth: {
        online: onlineDevices,
        offline: offlineDevices,
      },
      systemHealth: {
        server: "Operational",
        database: "Healthy",
        connectivity: offlineDevices > 0 ? "Degraded" : "Operational",
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   ANALYTICS
====================================================== */
export const analyticsSummary = async (req, res, next) => {
  try {
    const totalTrips = await Trip.countDocuments();
    const activeClients = await Client.countDocuments({ isActive: true });

    res.json({
      totalTrips,
      revenue: 0,
      activeClients,
      growth: { trips: 12, revenue: 8, clients: 0 },
    });
  } catch (e) {
    next(e);
  }
};

export const tripVolumeDaily = async (req, res, next) => {
  try {
    const days = 7;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Trip.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
    ]);

    res.json(
      data.map((x) => ({
        date: `${x._id.y}-${x._id.m}-${x._id.d}`,
        trips: x.count,
      }))
    );
  } catch (e) {
    next(e);
  }
};

export const clientDistribution = async (req, res, next) => {
  try {
    const dist = await Client.aggregate([
      { $group: { _id: "$packageType", count: { $sum: 1 } } },
    ]);

    const total = dist.reduce((a, b) => a + b.count, 0) || 1;

    res.json(
      dist.map((d) => ({
        label: d._id || "Others",
        percent: Math.round((d.count / total) * 100),
      }))
    );
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
    const client = await Client.create({
      ...req.body,
      createdBy: req.user.id,
      isActive: true,
    });

    await logAudit({ req, action: "CREATE", module: "CLIENT", newValue: client });
    res.status(201).json(client);
  } catch (e) {
    next(e);
  }
};

export const listClients = async (req, res, next) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (e) {
    next(e);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const old = await Client.findById(req.params.id);
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });

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
  try {
    const client = await Client.findById(req.params.id);
    client.isActive = false;
    await client.save();

    await logAudit({ req, action: "DEACTIVATE", module: "CLIENT", newValue: client });
    res.json(client);
  } catch (e) {
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
      siteId,
      deviceType,
      serialNumber,
    } = req.body;

    if (!clientId || !deviceType || !serialNumber) {
      return res.status(400).json({
        message: "clientId, deviceType and serialNumber are required"
      });
    }

    const device = await Device.create({
      clientId,
      siteId,
      devicetype: deviceType.toUpperCase(), // ✅ FIX
      serialNo: serialNumber,               // ✅ FIX
    });

    res.status(201).json({
      message: "Device created successfully",
      device
    });
  } catch (error) {
    console.error("Create device error:", error);
    res.status(500).json({ message: "Failed to create device" });
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
      .populate("clientId", "name")
      .lean();

    const formatted = devices.map(d => ({
      _id: d._id,
      name: d.serialNo,                  // 👈 UI needs name
      deviceId: d.serialNo,              // 👈 UI uses deviceId
      type: d.devicetype,                // 👈 UI uses type
      status: d.isOnline ? "online" : "offline",
      clientName: d.clientId?.name || "Not Assigned",
      siteName: "Not Assigned",
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
    await device.save();

    await logAudit({ req, action: "TOGGLE", module: "DEVICE", newValue: device });
    res.json(device);
  } catch (e) {
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

export const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const me = await SuperAdmin.findById(req.user.id);

    const ok = await comparePassword(oldPassword, me.password);
    if (!ok) return res.status(400).json({ message: "Wrong old password" });

    me.password = await hashPassword(newPassword);
    await me.save();

    await logAudit({ req, action: "CHANGE_PASSWORD", module: "PROFILE" });
    res.json({ message: "Password changed" });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   SETTINGS
====================================================== */
export const getSettings = async (req, res, next) => {
  try {
    let s = await AppSettings.findOne();
    if (!s) s = await AppSettings.create({});
    res.json(s);
  } catch (e) {
    next(e);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    let s = await AppSettings.findOne();
    const old = s.toObject();
    Object.assign(s, req.body);
    await s.save();

    await logAudit({ req, action: "UPDATE", module: "SETTINGS", oldValue: old, newValue: s });
    res.json(s);
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
