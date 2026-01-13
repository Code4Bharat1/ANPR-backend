import Device from "../models/Device.model.js";
import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const registerDevice = async (req, res, next) => {
  try {
    const { serialNumber, deviceType, clientId, siteId, ipAddress, notes } = req.body;

    // Check if device with this serial number already exists
    const existingDevice = await Device.findOne({ serialNo: serialNumber });
    if (existingDevice) {
      return res.status(400).json({ message: "Device with this serial number already exists" });
    }

    // Validate client exists
    if (clientId) {
      const client = await Client.findById(clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
    }

    // Validate site exists
    if (siteId) {
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
    }

    const device = await Device.create({ 
      type: deviceType,
      serialNo: serialNumber,
      clientId,
      siteId,
      ipAddress,
      notes,
      isOnline: false,
      lastActive: new Date()
    });

    await logAudit({ 
      req, 
      action: "REGISTER", 
      module: "DEVICE", 
      newValue: device 
    });

    // Populate client and site names for response
    await device.populate([
      { path: 'clientId', select: 'companyName name' },
      { path: 'siteId', select: 'name' }
    ]);

    res.status(201).json({
      message: "Device registered successfully",
      data: formatDeviceResponse(device)
    });
  } catch (e) {
    next(e);
  }
};

export const updateDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deviceType, clientId, siteId, ipAddress, notes } = req.body;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const oldValue = { ...device.toObject() };

    // Validate client exists
    if (clientId) {
      const client = await Client.findById(clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      device.clientId = clientId;
    }

    // Validate site exists
    if (siteId) {
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
      device.siteId = siteId;
    }

    if (deviceType) device.type = deviceType;
    if (ipAddress !== undefined) device.ipAddress = ipAddress;
    if (notes !== undefined) device.notes = notes;

    await device.save();

    await logAudit({ 
      req, 
      action: "UPDATE", 
      module: "DEVICE", 
      oldValue, 
      newValue: device 
    });

    await device.populate([
      { path: 'clientId', select: 'companyName name' },
      { path: 'siteId', select: 'name' }
    ]);

    res.json({
      message: "Device updated successfully",
      data: formatDeviceResponse(device)
    });
  } catch (e) {
    next(e);
  }
};

export const deleteDevice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    await logAudit({ 
      req, 
      action: "DELETE", 
      module: "DEVICE", 
      oldValue: device 
    });

    await Device.findByIdAndDelete(id);

    res.json({ 
      message: "Device deleted successfully" 
    });
  } catch (e) {
    next(e);
  }
};

export const toggleDeviceStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const oldStatus = device.isOnline;
    device.isOnline = !device.isOnline;
    device.lastActive = new Date();
    
    await device.save();

    await logAudit({ 
      req, 
      action: "STATUS_TOGGLE", 
      module: "DEVICE", 
      oldValue: { isOnline: oldStatus },
      newValue: { isOnline: device.isOnline }
    });

    await device.populate([
      { path: 'clientId', select: 'companyName name' },
      { path: 'siteId', select: 'name' }
    ]);

    res.json({
      message: `Device turned ${device.isOnline ? 'online' : 'offline'} successfully`,
      data: formatDeviceResponse(device)
    });
  } catch (e) {
    next(e);
  }
};

export const assignDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clientId, siteId } = req.body;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const oldValue = { 
      clientId: device.clientId, 
      siteId: device.siteId 
    };

    if (clientId) {
      const client = await Client.findById(clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      device.clientId = clientId;
    }

    if (siteId) {
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
      device.siteId = siteId;
    }

    await device.save();

    await logAudit({ 
      req, 
      action: "ASSIGN", 
      module: "DEVICE", 
      oldValue, 
      newValue: { clientId: device.clientId, siteId: device.siteId }
    });

    await device.populate([
      { path: 'clientId', select: 'companyName name' },
      { path: 'siteId', select: 'name' }
    ]);

    res.json({
      message: "Device assigned successfully",
      data: formatDeviceResponse(device)
    });
  } catch (e) {
    next(e);
  }
};

export const listDevices = async (req, res, next) => {
  try {
    const query = {};
    
    // If user is not superadmin, filter by their clientId
    if (req.user.role !== 'superadmin' && req.user.clientId) {
      query.clientId = req.user.clientId;
    }

    const devices = await Device.find(query)
      .populate('clientId', 'companyName name')
      .populate('siteId', 'name')
      .sort({ createdAt: -1 });

    const formattedDevices = devices.map(device => formatDeviceResponse(device));

    res.json(formattedDevices);
  } catch (e) {
    next(e);
  }
};

// Helper function to format device response
function formatDeviceResponse(device) {
  return {
    _id: device._id,
    name: device.name || `${device.type}-${device.serialNo}`,
    deviceId: device.serialNo,
    type: device.type,
    status: device.isOnline ? 'online' : 'offline',
    clientId: device.clientId?._id || device.clientId,
    clientName: device.clientId?.companyName || device.clientId?.name,
    siteId: device.siteId?._id || device.siteId,
    siteName: device.siteId?.name,
    ipAddress: device.ipAddress,
    notes: device.notes,
    lastActive: device.lastActive,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt
  };
}