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

    // Total devices (ANPR + BARRIER)
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isEnabled: true });

    // ANPR devices stats
    const totalANPRDevices = await Device.countDocuments({ devicetype: "ANPR" });
    const onlineANPRDevices = await Device.countDocuments({
      devicetype: "ANPR",
      isOnline: true
    });
    const offlineANPRCount = await Device.countDocuments({
      devicetype: "ANPR",
      isOnline: false
    });

    const offlineANPRList = await Device.find(
      { devicetype: "ANPR", isOnline: false },
      { serialNo: 1, siteId: 1, lastActive: 1, ipAddress: 1 }
    ).populate("siteId", "name");

    // BARRIER devices stats
    const totalBarriers = await Device.countDocuments({ devicetype: "BARRIER" });
    const onlineBarriers = await Device.countDocuments({
      devicetype: "BARRIER",
      isOnline: true
    });
    const offlineBarriersCount = await Device.countDocuments({
      devicetype: "BARRIER",
      isOnline: false
    });

    const offlineBarrierList = await Device.find(
      { devicetype: "BARRIER", isOnline: false },
      { serialNo: 1, siteId: 1, lastActive: 1, ipAddress: 1 }
    ).populate("siteId", "name");

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
        totalBarriers,
        todayTrips,
      },
      deviceHealth: {
        online: onlineANPRDevices,
        offline: offlineANPRCount,
        offlineDevices: offlineANPRList,
      },
      barrierHealth: {
        online: onlineBarriers,
        offline: offlineBarriersCount,
        offlineBarriers: offlineBarrierList,
      },
      systemHealth: {
        server: "Operational",
        database: "Healthy",
        connectivity:
          offlineANPRCount > 0 || offlineBarriersCount > 0
            ? "Degraded"
            : "Operational",
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
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);

    const [
      totalTrips,
      totalClients,
      totalSites,
      totalDevices
    ] = await Promise.all([
      Trip.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      Client.countDocuments({ isActive: true }),
      Site.countDocuments(),
      Device.countDocuments()
    ]);

    const topClients = await Trip.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$clientId", trips: { $sum: 1 } } },
      { $sort: { trips: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "clients",
          localField: "_id",
          foreignField: "_id",
          as: "client"
        }
      },
      { $unwind: "$client" },
      {
        $project: {
          name: "$client.name",
          trips: 1,
          sites: { $size: "$client.sites" },
          devices: 1
        }
      }
    ]);

    res.json({
      totalTrips,
      totalClients,
      totalSites,
      totalDevices,
      totalRevenue: 0,
      growth: { trips: 12, revenue: 8, clients: 0 },
      topClients
    });
  } catch (e) {
    next(e);
  }
};

export const tripVolumeDaily = async (req, res, next) => {
  try {
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);

    const format = period === "today" ? "%H:00" : "%Y-%m-%d";

    const data = await Trip.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(data.map(d => ({ date: d._id, trips: d.count })));
  } catch (e) {
    next(e);
  }
};

export const clientDistribution = async (req, res, next) => {
  try {
    const period = req.query.period || "7d";
    const { from, to } = getDateRange(period);

    const dist = await Client.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$packageType", count: { $sum: 1 } } }
    ]);

    const total = dist.reduce((a, b) => a + b.count, 0) || 1;

    res.json(
      dist.map(d => ({
        label: d._id || "Others",
        percent: Math.round((d.count / total) * 100)
      }))
    );
  } catch (e) {
    next(e);
  }
};

const getDateRange = (period = "7d") => {
  const now = new Date();
  let from = new Date();

  switch (period) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;

    case "7d":
      from.setDate(now.getDate() - 7);
      break;

    case "30d":
      from.setDate(now.getDate() - 30);
      break;

    case "90d":
      from.setDate(now.getDate() - 90);
      break;

    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    default:
      from.setDate(now.getDate() - 7);
  }

  return { from, to: now };
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
    const { packageType } = req.body;
    const plan = PLANS[packageType];

    if (!plan) {
      return res.status(400).json({ message: "Invalid package" });
    }

    const client = await Client.create({
      ...req.body,
      userLimits: plan.limits,
      deviceLimits: plan.limits.devices,
      createdBy: req.user.id,
      isActive: true,
    });

    res.status(201).json(client);
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

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    client.isActive = false;
    await client.save();

    // ✅ logout from all devices
    await RefreshToken.deleteMany({ userId: client._id });

    await logAudit({
      req,
      action: "DEACTIVATE",
      module: "CLIENT",
      newValue: client,
    });

    res.json({
      message: "Client deactivated successfully",
    });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   SUPER ADMIN - SITES MANAGEMENT
====================================================== */

// GET all sites (across all clients)
export const getAllSites = async (req, res, next) => {
  try {
    const sites = await Site.find()
      .populate('clientId', 'companyName clientname email clientCode')
      .sort({ createdAt: -1 });

    const sitesWithStats = await Promise.all(
      sites.map(async (site) => {
        const deviceCount = await Device.countDocuments({ siteId: site._id });
        const activeDeviceCount = await Device.countDocuments({
          siteId: site._id,
          isEnabled: true
        });
        const onlineDeviceCount = await Device.countDocuments({
          siteId: site._id,
          isOnline: true
        });

        return {
          _id: site._id,
          name: site.name,
          location: site.location,
          address: site.address,
          contactPerson: site.contactPerson,
          contactNumber: site.contactNumber,
          isActive: site.isActive,
          clientId: site.clientId?._id,
          clientName: site.clientId?.companyName || site.clientId?.clientname,
          clientEmail: site.clientId?.email,
          clientCode: site.clientId?.clientCode,
          deviceCount,
          activeDeviceCount,
          onlineDeviceCount,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
        };
      })
    );

    res.json({
      success: true,
      count: sitesWithStats.length,
      data: sitesWithStats,
    });
  } catch (e) {
    next(e);
  }
};

// GET single site by ID
export const getSiteById = async (req, res, next) => {
  try {
    const site = await Site.findById(req.params.id)
      .populate('clientId', 'companyName clientname email clientCode');

    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    const devices = await Device.find({ siteId: site._id })
      .select('serialNo devicetype isEnabled isOnline lastActive');

    res.json({
      success: true,
      data: {
        ...site.toObject(),
        clientName: site.clientId?.companyName || site.clientId?.clientname,
        devices,
      },
    });
  } catch (e) {
    next(e);
  }
};

// CREATE new site (Super Admin can create for any client)
export const createSite = async (req, res, next) => {
  try {
    const {
      name,
      clientId,
      location,
      address,
      contactPerson,
      contactNumber,
    } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
      });
    }

    const newSite = await Site.create({
      name,
      clientId,
      location,
      address,
      contactPerson,
      contactNumber,
      isActive: true,
    });

    const populatedSite = await Site.findById(newSite._id)
      .populate('clientId', 'companyName clientname email');

    res.status(201).json({
      success: true,
      message: 'Site created successfully',
      data: populatedSite,
    });
  } catch (e) {
    next(e);
  }
};

// UPDATE site
export const updateSite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      location,
      address,
      contactPerson,
      contactNumber,
      isActive,
    } = req.body;

    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    // Update fields
    if (name !== undefined) site.name = name;
    if (location !== undefined) site.location = location;
    if (address !== undefined) site.address = address;
    if (contactPerson !== undefined) site.contactPerson = contactPerson;
    if (contactNumber !== undefined) site.contactNumber = contactNumber;
    if (isActive !== undefined) site.isActive = isActive;

    await site.save();

    const updatedSite = await Site.findById(id)
      .populate('clientId', 'companyName clientname email');

    res.json({
      success: true,
      message: 'Site updated successfully',
      data: updatedSite,
    });
  } catch (e) {
    next(e);
  }
};

// DELETE site (soft delete by deactivating)
export const deleteSite = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    // Check if site has devices
    const deviceCount = await Device.countDocuments({ siteId: id });
    if (deviceCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete site. It has ${deviceCount} device(s) assigned. Please reassign or remove devices first.`,
      });
    }

    // Soft delete by deactivating
    site.isActive = false;
    await site.save();

    res.json({
      success: true,
      message: 'Site deactivated successfully',
    });
  } catch (e) {
    next(e);
  }
};

// ACTIVATE/DEACTIVATE site
export const toggleSiteStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    site.isActive = !site.isActive;
    await site.save();

    res.json({
      success: true,
      message: `Site ${site.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: site.isActive },
    });
  } catch (e) {
    next(e);
  }
};

// GET sites by client ID
export const getSitesByClient = async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
      });
    }

    const sites = await Site.find({ clientId })
      .sort({ createdAt: -1 });

    const sitesWithStats = await Promise.all(
      sites.map(async (site) => {
        const deviceCount = await Device.countDocuments({ siteId: site._id });
        const activeDeviceCount = await Device.countDocuments({
          siteId: site._id,
          isEnabled: true
        });

        return {
          ...site.toObject(),
          deviceCount,
          activeDeviceCount,
        };
      })
    );

    res.json({
      success: true,
      count: sitesWithStats.length,
      data: sitesWithStats,
    });
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
      devicetype: deviceType.toUpperCase(),
      serialNo: serialNumber,
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
      .populate("clientId", "companyName")
      .populate("siteId", "name")
      .lean();

    const formatted = devices.map(d => ({
      _id: d._id,
      name: d.serialNo,
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
      name: device.serialNo,
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
      name: device.serialNo,
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

    if (deviceType) device.devicetype = deviceType.toUpperCase();
    if (serialNumber) device.serialNo = serialNumber;

    if (clientId === "") device.clientId = null;
    else if (clientId) device.clientId = clientId;

    if (siteId === "") device.siteId = null;
    else if (siteId) device.siteId = siteId;

    if (ipAddress !== undefined) device.ipAddress = ipAddress;
    if (notes !== undefined) device.notes = notes;

    await device.save();

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
      name: populatedDevice.serialNo,
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
