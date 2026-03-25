import Device from "../models/Device.model.js";
import Client from "../models/Client.model.js";
import Site from "../models/Site.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/* ======================================================
   HELPERS
====================================================== */

/**
 * Adds a device to the correct array inside a gate sub-document.
 * devicetype → gate array mapping:
 *   ANPR  + role ENTRY       → entryDevices
 *   ANPR  + role EXIT        → exitDevices
 *   ANPR  + role ENTRY_EXIT  → entryDevices AND exitDevices
 *   TOP_CAMERA               → topCameraDevices
 *   BIOMETRIC / OVERVIEW     → no gate array (site-level only)
 *
 * NOTE: BARRIER is not a registered device type. The barrier is
 * physically controlled by the ANPR camera via the on-site agent.
 */
async function addDeviceToGate(siteId, gateId, deviceId, devicetype, role) {
  if (!siteId || !gateId) return;

  const arrayFields = resolveGateArrays(devicetype, role);
  if (!arrayFields.length) return;

  const pushOps = {};
  arrayFields.forEach(f => { pushOps[`gates.$.${f}`] = deviceId; });

  await Site.updateOne(
    { _id: siteId, "gates._id": gateId },
    { $addToSet: pushOps }
  );
}

async function removeDeviceFromGate(siteId, gateId, deviceId, devicetype, role) {
  if (!siteId || !gateId) return;

  const arrayFields = resolveGateArrays(devicetype, role);
  if (!arrayFields.length) return;

  const pullOps = {};
  arrayFields.forEach(f => { pullOps[`gates.$.${f}`] = deviceId; });

  await Site.updateOne(
    { _id: siteId, "gates._id": gateId },
    { $pull: pullOps }
  );
}

function resolveGateArrays(devicetype, role) {
  if (devicetype === "TOP_CAMERA") return ["topCameraDevices"];
  if (devicetype === "ANPR") {
    if (role === "ENTRY")       return ["entryDevices"];
    if (role === "EXIT")        return ["exitDevices"];
    if (role === "ENTRY_EXIT")  return ["entryDevices", "exitDevices"];
  }
  return [];
}

/* ======================================================
   REGISTER DEVICE  (FR-4.1, FR-4.2)
====================================================== */
export const registerDevice = async (req, res, next) => {
  try {
    const {
      serialNumber,
      deviceName,
      deviceType,
      clientId,
      siteId,
      ipAddress,
      notes,
      role,
      gateId,
      lane,
    } = req.body;

    if (!serialNumber || !deviceType || !clientId || !siteId) {
      return res.status(400).json({
        message: "serialNumber, deviceType, clientId, siteId are required"
      });
    }

    const normalizedType = deviceType.toUpperCase();

    // Duplicate serial check
    if (await Device.findOne({ serialNo: serialNumber })) {
      return res.status(409).json({
        message: "Device with this serial number already exists"
      });
    }

    // If gateId provided, verify it belongs to the site
    if (gateId) {
      const site = await Site.findOne({ _id: siteId, "gates._id": gateId });
      if (!site) {
        return res.status(400).json({ message: "gateId does not exist on this site" });
      }
    }

    const finalDeviceName = deviceName || `Device_${serialNumber}`;

    const device = await Device.create({
      deviceName: finalDeviceName,
      devicetype: normalizedType,
      serialNo: serialNumber,
      clientId,
      siteId,
      ipAddress,
      notes,
      role: role ? role.toUpperCase() : null,
      gateId: gateId || null,
      lane: lane || null,
      isEnabled: true,
      isOnline: false,
    });

    // FR-4.3: Add to gate device array
    await addDeviceToGate(siteId, gateId, device._id, normalizedType, device.role);

    // Keep assignedDevices on Site in sync
    await Site.findByIdAndUpdate(siteId, { $addToSet: { assignedDevices: device._id } });

    await logAudit({ req, action: "REGISTER", module: "DEVICE", newValue: device });

    res.status(201).json({ message: "Device registered successfully", data: device });
  } catch (e) {
    console.error("❌ Device registration error:", e);
    next(e);
  }
};



/* ======================================================
   UPDATE DEVICE  (FR-4.1, FR-4.2)
====================================================== */
export const updateDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deviceType, clientId, siteId, ipAddress, notes, role, gateId, lane } = req.body;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const oldValue = device.toObject();
    const oldSiteId  = device.siteId?.toString()  || null;
    const oldGateId  = device.gateId || null;
    const oldRole    = device.role   || null;
    const oldType    = device.devicetype;

    if (deviceType) device.devicetype = deviceType.toUpperCase();
    if (clientId !== undefined) device.clientId = clientId || null;
    if (siteId   !== undefined) device.siteId   = siteId   || null;
    if (ipAddress !== undefined) device.ipAddress = ipAddress;
    if (notes     !== undefined) device.notes     = notes;
    if (role      !== undefined) device.role      = role ? role.toUpperCase() : null;
    if (gateId    !== undefined) device.gateId    = gateId || null;
    if (lane      !== undefined) device.lane      = lane   || null;

    const newSiteId = device.siteId?.toString() || null;
    const newGateId = device.gateId || null;
    const newRole   = device.role   || null;
    const newType   = device.devicetype;

    // Validate new gateId belongs to new site
    if (newGateId && newSiteId) {
      const site = await Site.findOne({ _id: newSiteId, "gates._id": newGateId });
      if (!site) {
        return res.status(400).json({ message: "gateId does not exist on this site" });
      }
    }

    await device.save();

    // FR-4.3: Sync gate device arrays
    const gateOrRoleChanged =
      oldGateId !== newGateId || oldRole !== newRole ||
      oldType   !== newType   || oldSiteId !== newSiteId;

    if (gateOrRoleChanged) {
      // Remove from old gate
      if (oldGateId && oldSiteId) {
        await removeDeviceFromGate(oldSiteId, oldGateId, device._id, oldType, oldRole);
      }
      // Add to new gate
      if (newGateId && newSiteId) {
        await addDeviceToGate(newSiteId, newGateId, device._id, newType, newRole);
      }
    }

    // Keep Site.assignedDevices in sync when site changes
    if (oldSiteId && oldSiteId !== newSiteId) {
      await Site.findByIdAndUpdate(oldSiteId, { $pull: { assignedDevices: device._id } });
    }
    if (newSiteId && oldSiteId !== newSiteId) {
      await Site.findByIdAndUpdate(newSiteId, { $addToSet: { assignedDevices: device._id } });
    }

    await logAudit({ req, action: "UPDATE", module: "DEVICE", oldValue, newValue: device });

    res.json({ message: "Device updated successfully", data: device });
  } catch (e) {
    next(e);
  }
};


/* ======================================================
   DELETE DEVICE
====================================================== */
export const deleteDevice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    // FR-4.3: Remove from gate arrays before deleting
    if (device.gateId && device.siteId) {
      await removeDeviceFromGate(
        device.siteId.toString(), device.gateId,
        device._id, device.devicetype, device.role
      );
    }
    // Remove from Site.assignedDevices
    if (device.siteId) {
      await Site.findByIdAndUpdate(device.siteId, { $pull: { assignedDevices: device._id } });
    }

    await logAudit({ req, action: "DELETE", module: "DEVICE", oldValue: device });
    await Device.findByIdAndDelete(id);

    res.json({ message: "Device deleted successfully" });
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
const formatDeviceResponse = (device) => {
  return {
    _id: device._id,
    name: device.deviceName || device.serialNo,
    deviceName: device.deviceName,
    deviceId: device.serialNo,
    type: device.devicetype,
    role: device.role || null,
    gateId: device.gateId || null,
    lane: device.lane || null,
    status: device.isOnline ? "online" : "offline",
    isOnline: device.isOnline,
    isEnabled: device.isEnabled,
    clientId: device.clientId?._id,
    siteId: device.siteId?._id,
    clientName: device.clientId?.companyName || device.clientId?.name || "Not Assigned",
    siteName: device.siteId?.name || "Not Assigned",
    ipAddress: device.ipAddress,
    notes: device.notes,
    lastActive: device.lastActive || device.updatedAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
};

/* ======================================================
   HEARTBEAT  (FR-4.4)
   PATCH /api/devices/:id/heartbeat
   Called by the hardware agent to mark a device online.
====================================================== */
export const heartbeat = async (req, res, next) => {
  try {
    const { id } = req.params;

    const device = await Device.findByIdAndUpdate(
      id,
      { isOnline: true, lastActive: new Date() },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    return res.json({ success: true, lastActive: device.lastActive });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   GET DEVICES BY GATE  (FR-4.5)
   GET /api/devices/by-gate/:siteId/:gateId
   Returns all devices assigned to a specific gate with their roles.
====================================================== */
export const getDevicesByGate = async (req, res, next) => {
  try {
    const { siteId, gateId } = req.params;

    const site = await Site.findOne(
      { _id: siteId, "gates._id": gateId },
      { "gates.$": 1 }
    )
      .populate("gates.entryDevices",    "deviceName devicetype role isOnline ipAddress lane")
      .populate("gates.exitDevices",     "deviceName devicetype role isOnline ipAddress lane")
      .populate("gates.topCameraDevices","deviceName devicetype role isOnline ipAddress lane")
      .lean();

    if (!site || !site.gates?.length) {
      return res.status(404).json({ message: "Gate not found" });
    }

    const gate = site.gates[0];

    return res.json({
      success: true,
      data: {
        gateId: gate._id,
        gateName: gate.gateName,
        isMainGate: gate.isMainGate,
        isActive: gate.isActive,
        entryDevices:     gate.entryDevices     || [],
        exitDevices:      gate.exitDevices      || [],
        topCameraDevices: gate.topCameraDevices || [],
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   ASSIGN DEVICE TO GATE  (FR-4.5)
   PATCH /api/devices/:id/assign-gate
   Body: { gateId, siteId }
   Moves a device to a different gate (or removes from gate if gateId is null).
====================================================== */
export const assignDeviceToGate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { gateId, siteId } = req.body;

    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const targetSiteId = siteId || device.siteId?.toString();

    // Validate new gate belongs to site
    if (gateId && targetSiteId) {
      const site = await Site.findOne({ _id: targetSiteId, "gates._id": gateId });
      if (!site) {
        return res.status(400).json({ message: "gateId does not exist on this site" });
      }
    }

    const oldGateId = device.gateId || null;
    const oldSiteId = device.siteId?.toString() || null;

    // Remove from old gate
    if (oldGateId && oldSiteId) {
      await removeDeviceFromGate(oldSiteId, oldGateId, device._id, device.devicetype, device.role);
    }

    device.gateId = gateId || null;
    if (siteId) device.siteId = siteId;
    await device.save();

    // Add to new gate
    if (device.gateId && targetSiteId) {
      await addDeviceToGate(targetSiteId, device.gateId, device._id, device.devicetype, device.role);
    }

    await logAudit({
      req,
      action: "ASSIGN",
      module: "DEVICE",
      oldValue: { gateId: oldGateId, siteId: oldSiteId },
      newValue: { gateId: device.gateId, siteId: device.siteId },
    });

    return res.json({ success: true, message: "Device assigned to gate", data: device });
  } catch (e) {
    next(e);
  }
};