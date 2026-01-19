import Device from "../models/Device.model.js";
import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const registerDevice = async (req, res, next) => {
  try {
    // console.log("📥 Received device registration request:", req.body); // Add debug
    
    const { serialNumber, deviceName, deviceType, clientId, siteId, ipAddress, notes } = req.body;

    // Validate required fields
    if (!serialNumber || !deviceType) {
      return res.status(400).json({ 
        message: "serialNumber and deviceType are required",
        received: req.body 
      });
    }

    // If deviceName is empty, use serial number as default
    const finalDeviceName = deviceName || `Device_${serialNumber}`;

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

    // ✅ FIX: Add deviceName field
    const device = await Device.create({ 
      deviceName: finalDeviceName, // ✅ Add this line
      devicetype: deviceType,
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
    console.error("❌ Device registration error:", e);
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

    // Debug: Check what data is coming from database
    // console.log("🔍 Database devices raw data:", devices.length, "devices found");
    // if (devices.length > 0) {
    //   console.log("First device raw data:", {
    //     _id: devices[0]._id,
    //     deviceName: devices[0].deviceName,
    //     serialNo: devices[0].serialNo,
    //     devicetype: devices[0].devicetype
    //   });
    // }

    const formattedDevices = devices.map(device => formatDeviceResponse(device));

    // Debug: Check formatted data
    console.log("📋 Formatted devices first item:", formattedDevices[0]);

    res.json(formattedDevices);
  } catch (e) {
    console.error("❌ Error in listDevices:", e);
    next(e);
  }
};
export const getDevices = async (req, res) => {
  try {
    // Populate both client and site information
    const devices = await Device.find({ clientId: req.user.clientId })
      .populate('clientId', 'companyName name')  // Populate client
      .populate('siteId', 'name address')        // Populate site
      .select('-__v')  // Exclude version key
      .lean();  // Convert to plain JavaScript objects

    // Format the response properly
    const formattedDevices = devices.map(device => ({
      _id: device._id,
      serialNo: device.serialNo,
      deviceName: device.deviceName,
      devicetype: device.devicetype,
      type: device.devicetype, // Alias for frontend compatibility
      isOnline: device.isOnline,
      status: device.isOnline ? 'online' : 'offline',
      lastActive: device.lastActive,
      updatedAt: device.updatedAt,
      createdAt: device.createdAt,
      ipAddress: device.ipAddress,
      notes: device.notes,
      
      // Client information (populated)
      clientId: device.clientId?._id,
      clientName: device.clientId?.companyName || device.clientId?.name,
      
      // Site information (populated - THIS IS WHAT YOU NEED!)
      siteId: device.siteId?._id,
      siteName: device.siteId?.name,  // This will now have the actual site name
      site: device.siteId?.name,      // Alias for frontend
      siteAddress: device.siteId?.address
    }));

    res.json(formattedDevices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ message: 'Failed to fetch devices', error: error.message });
  }
};

// Helper function to format device response
// Add this function if it doesn't exist, or update your existing one
const formatDeviceResponse = (device) => {
  return {
    _id: device._id,
    name: device.deviceName || device.serialNo, // Make sure this exists
    deviceName: device.deviceName, // ✅ Add this line to return deviceName
    deviceId: device.serialNo,
    type: device.devicetype,
    status: device.isOnline ? "online" : "offline",
    clientId: device.clientId?._id,
    siteId: device.siteId?._id,
    clientName: device.clientId?.companyName || device.clientId?.name || "Not Assigned",
    siteName: device.siteId?.name || "Not Assigned",
    ipAddress: device.ipAddress,
    notes: device.notes,
    lastActive: device.lastActive || device.updatedAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt
  };
};