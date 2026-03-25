import mongoose from 'mongoose';
import Client from '../models/Client.model.js';
import Device from '../models/Device.model.js';
import { getPlanLimits } from '../utils/planFeatures.util.js';

export const checkDeviceLimit = async (req, res, next) => {
  try {
    const { deviceType, siteId, clientId } = req.body;

    if (!deviceType || !siteId || !clientId) {
      return res.status(400).json({
        message: "deviceType, siteId, and clientId are required"
      });
    }

    const normalizedType = deviceType.toUpperCase();

    const client = await Client.findById(clientId).lean();
    if (!client || !client.isActive) {
      return res.status(403).json({ message: "Client inactive or not found" });
    }

    // FR-9.4: getPlanLimits merges plan defaults with per-client overrides
    const limits = getPlanLimits(client);
    const allowedLimit = Number(limits.devices?.[normalizedType] ?? 0);

    if (allowedLimit === 0) {
      return res.status(403).json({
        success: false,
        code: "FEATURE_NOT_IN_PLAN",
        message: `${normalizedType} devices are not available in your ${client.packageType} plan`,
        plan: client.packageType,
      });
    }

    const clientCount = await Device.countDocuments({
      clientId,
      devicetype: normalizedType,
      isEnabled: true
    });

    if (clientCount >= allowedLimit) {
      return res.status(403).json({
        success: false,
        code: "DEVICE_LIMIT_EXCEEDED",
        message: `${normalizedType} device limit reached (${clientCount}/${allowedLimit})`,
        current: clientCount,
        limit: allowedLimit,
        plan: client.packageType,
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
    
    const device = await Device.findById(deviceId)
      .populate('clientId', 'companyName packageType deviceLimits userLimits siteLimits featuresOverride isActive');
    
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    // Only check limits when ENABLING a device
    if (!device.isEnabled) {
      const client = device.clientId;
      
      if (!client || !client.isActive) {
        return res.status(403).json({ message: "Client is inactive or not found" });
      }

      // FR-9.4: use getPlanLimits for override support
      const limits = getPlanLimits(client.toObject ? client.toObject() : client);
      const allowedLimit = Number(limits.devices?.[device.devicetype] ?? 0);
      
      if (allowedLimit === 0) {
        return res.status(403).json({
          success: false,
          code: "FEATURE_NOT_IN_PLAN",
          message: `${device.devicetype} devices are not available in your plan`,
        });
      }

      const enabledCount = await Device.countDocuments({
        clientId: device.clientId,
        devicetype: device.devicetype,
        isEnabled: true,
        _id: { $ne: deviceId }
      });

      if (enabledCount >= allowedLimit) {
        return res.status(403).json({
          success: false,
          code: "DEVICE_LIMIT_EXCEEDED",
          message: `Cannot enable ${device.devicetype} device. Limit reached (${enabledCount}/${allowedLimit})`,
          current: enabledCount,
          limit: allowedLimit,
        });
      }
    }

    next();
  } catch (error) {
    console.error("Toggle device limit check error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// For device updates (changing site)
export const checkDeviceLimitForUpdate = async (req, res, next) => {
  try {
    const deviceId = req.params.id;
    const { siteId } = req.body;
    
    if (!siteId) return next();

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const client = await Client.findById(device.clientId).lean();
    if (!client || !client.isActive) {
      return res.status(403).json({ message: "Client is inactive or not found" });
    }

    if (siteId !== device.siteId?.toString()) {
      // FR-9.4: use getPlanLimits for override support
      const limits = getPlanLimits(client);
      const allowedLimit = Number(limits.devices?.[device.devicetype] ?? 0);
      
      const newSiteCount = await Device.countDocuments({
        clientId: device.clientId,
        siteId: new mongoose.Types.ObjectId(siteId),
        devicetype: device.devicetype,
        isEnabled: true
      });

      if (newSiteCount >= allowedLimit) {
        return res.status(403).json({
          success: false,
          code: "DEVICE_LIMIT_EXCEEDED",
          message: `Cannot move device to this site. ${device.devicetype} limit reached (${newSiteCount}/${allowedLimit})`,
          current: newSiteCount,
          limit: allowedLimit,
        });
      }
    }

    next();
  } catch (error) {
    console.error("Update device limit check error:", error);
    res.status(500).json({ message: "Server error" });
  }
};