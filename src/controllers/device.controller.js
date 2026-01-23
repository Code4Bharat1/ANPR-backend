import Device from "../models/Device.model.js";
import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const registerDevice = async (req, res, next) => {
  try {
    const {
      serialNumber,
      deviceName,
      deviceType,
      clientId,
      siteId,
      ipAddress,
      notes
    } = req.body;

    if (!serialNumber || !deviceType || !clientId || !siteId) {
      return res.status(400).json({
        message: "serialNumber, deviceType, clientId, siteId are required"
      });
    }

    // 🔁 Duplicate serial check
    if (await Device.findOne({ serialNo: serialNumber })) {
      return res.status(409).json({
        message: "Device with this serial number already exists"
      });
    }

    const finalDeviceName = deviceName || `Device_${serialNumber}`;

    const device = await Device.create({
      deviceName: finalDeviceName,
      devicetype: deviceType.toUpperCase(), // ✅ single field
      serialNo: serialNumber,
      clientId,
      siteId,
      ipAddress,
      notes,
      isEnabled: true,   // 🔐 counts for license
      isOnline: false
    });

    await logAudit({
      req,
      action: "REGISTER",
      module: "DEVICE",
      newValue: device
    });

    res.status(201).json({
      message: "Device registered successfully",
      data: device
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

    const oldValue = device.toObject();

    if (deviceType) {
      device.devicetype = deviceType.toUpperCase(); // ✅ FIXED
    }

    if (clientId) device.clientId = clientId;
    if (siteId) device.siteId = siteId;
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

    res.json({
      message: "Device updated successfully",
      data: device
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
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const oldValue = {
      isEnabled: device.isEnabled,
      isOnline: device.isOnline
    };

    device.isEnabled = !device.isEnabled;   // 🔐 license on/off
    device.isOnline = device.isEnabled;     // status follows enable
    device.lastActive = new Date();

    await device.save();

    await logAudit({
      req,
      action: "TOGGLE",
      module: "DEVICE",
      oldValue,
      newValue: {
        isEnabled: device.isEnabled,
        isOnline: device.isOnline
      }
    });

    res.json({
      message: `Device ${device.isEnabled ? "enabled" : "disabled"} successfully`,
      data: device
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

    if (clientId) device.clientId = clientId;
    if (siteId) device.siteId = siteId;

    await device.save();

    await logAudit({
      req,
      action: "ASSIGN",
      module: "DEVICE",
      oldValue,
      newValue: {
        clientId: device.clientId,
        siteId: device.siteId
      }
    });

    res.json({
      message: "Device assigned successfully",
      data: device
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
    // console.log("📋 Formatted devices first item:", formattedDevices[0]);

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