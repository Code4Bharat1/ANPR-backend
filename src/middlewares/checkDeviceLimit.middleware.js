import mongoose from 'mongoose';
import Client from '../models/Client.model.js';
import Device from '../models/Device.model.js';

export const checkDeviceLimit = async (req, res, next) => {
  try {
    const { deviceType, siteId, clientId } = req.body;

    if (!deviceType || !siteId || !clientId) {
      return res.status(400).json({
        message: "deviceType, siteId, and clientId are required"
      });
    }

    const normalizedType = deviceType.toUpperCase();

    const client = await Client.findById(clientId);
    if (!client || !client.isActive) {
      return res.status(403).json({ message: "Client inactive or not found" });
    }

    const allowedLimit = Number(client.deviceLimits?.[normalizedType] ?? 0);

    if (allowedLimit === 0) {
      return res.status(403).json({
        message: `${normalizedType} not allowed in ${client.packageType}`,
        code: "DEVICE_TYPE_NOT_ALLOWED"
      });
    }

    const clientCount = await Device.countDocuments({
      clientId,
      devicetype: normalizedType,
      isEnabled: true
    });

    if (clientCount >= allowedLimit) {
      return res.status(403).json({
        message: `${normalizedType} limit exceeded`,
        code: "CLIENT_DEVICE_LIMIT_EXCEEDED"
      });
    }

    const siteCount = await Device.countDocuments({
      clientId,
      siteId,
      devicetype: normalizedType,
      isEnabled: true
    });

    if (siteCount >= allowedLimit) {
      return res.status(403).json({
        message: `${normalizedType} limit exceeded for this site`,
        code: "SITE_DEVICE_LIMIT_EXCEEDED"
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: "Device limit validation failed" });
  }
};


// For device toggling/enabling
export const checkDeviceLimitForToggle = async (req, res, next) => {
  try {
    const deviceId = req.params.id;
    
    // Get device details
    const device = await Device.findById(deviceId)
      .populate('clientId', 'companyName packageType deviceLimits isActive');
    
    if (!device) {
      return res.status(404).json({ 
        message: "Device not found" 
      });
    }

    // Only check limits when ENABLING a device
    if (!device.isEnabled) {
      const client = device.clientId;
      
      if (!client || !client.isActive) {
        return res.status(403).json({ 
          message: "Client is inactive or not found" 
        });
      }

      const allowedLimit = Number(client.deviceLimits?.[device.devicetype] ?? 0);
      
      if (allowedLimit === 0) {
        return res.status(403).json({
          message: `${device.devicetype} devices are not allowed in current package`,
          code: "DEVICE_TYPE_NOT_ALLOWED"
        });
      }

      // Count enabled devices of this type for the client
      const enabledCount = await Device.countDocuments({
        clientId: device.clientId,
        devicetype: device.devicetype,
        isEnabled: true,
        _id: { $ne: deviceId } // Exclude current device
      });

      if (enabledCount >= allowedLimit) {
        return res.status(403).json({
          message: `Cannot enable ${device.devicetype} device. Client limit reached`,
          details: {
            current: enabledCount,
            limit: allowedLimit,
            remaining: 0
          },
          code: "DEVICE_LIMIT_EXCEEDED"
        });
      }

      // Optional: Check site-wise limit
      if (device.siteId) {
        const siteEnabledCount = await Device.countDocuments({
          clientId: device.clientId,
          siteId: device.siteId,
          devicetype: device.devicetype,
          isEnabled: true,
          _id: { $ne: deviceId }
        });

        if (siteEnabledCount >= allowedLimit) {
          return res.status(403).json({
            message: `Cannot enable ${device.devicetype} device. Site limit reached`,
            siteId: device.siteId,
            code: "SITE_DEVICE_LIMIT_EXCEEDED"
          });
        }
      }
    }

    next();
  } catch (error) {
    console.error("Toggle device limit check error:", error);
    res.status(500).json({ 
      message: "Server error" 
    });
  }
};

// For device updates (changing site)
export const checkDeviceLimitForUpdate = async (req, res, next) => {
  try {
    const deviceId = req.params.id;
    const { siteId } = req.body;
    
    // If not changing site, skip check
    if (!siteId) return next();

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ 
        message: "Device not found" 
      });
    }

    const client = await Client.findById(device.clientId);
    if (!client || !client.isActive) {
      return res.status(403).json({ 
        message: "Client is inactive or not found" 
      });
    }

    // Check if device is being moved to a new site
    if (siteId !== device.siteId?.toString()) {
      const allowedLimit = Number(client.deviceLimits?.[device.devicetype] ?? 0);
      
      // Check limit at new site
      const newSiteCount = await Device.countDocuments({
        clientId: device.clientId,
        siteId: new mongoose.Types.ObjectId(siteId),
        devicetype: device.devicetype,
        isEnabled: true
      });

      if (newSiteCount >= allowedLimit) {
        return res.status(403).json({
          message: `Cannot move device to this site. ${device.devicetype} limit reached`,
          siteId: siteId,
          currentCount: newSiteCount,
          limit: allowedLimit,
          code: "SITE_DEVICE_LIMIT_EXCEEDED"
        });
      }
    }

    next();
  } catch (error) {
    console.error("Update device limit check error:", error);
    res.status(500).json({ 
      message: "Server error" 
    });
  }
};