import Device from "../models/Device.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const registerDevice = async (req, res, next) => {
  try {
    const { type, serialNo } = req.body;

    const device = await Device.create({ type, serialNo });

    await logAudit({ req, action: "REGISTER", module: "DEVICE", newValue: device });

    res.status(201).json(device);
  } catch (e) {
    next(e);
  }
};

export const assignDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clientId, siteId } = req.body;

    const old = await Device.findById(id);
    if (!old) return res.status(404).json({ message: "Device not found" });

    old.clientId = clientId;
    old.siteId = siteId;
    await old.save();

    await logAudit({ req, action: "ASSIGN", module: "DEVICE", oldValue: old, newValue: old });

    res.json(old);
  } catch (e) {
    next(e);
  }
};

export const setDeviceOnline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isOnline } = req.body;

    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ message: "Device not found" });

    device.isOnline = !!isOnline;
    await device.save();

    await logAudit({ req, action: "HEALTH_UPDATE", module: "DEVICE", newValue: device });

    res.json(device);
  } catch (e) {
    next(e);
  }
};

export const listDevices = async (req, res, next) => {
  try {
    const q = {};
    if (req.user.clientId) q.clientId = req.user.clientId;
    const devices = await Device.find(q).sort({ createdAt: -1 });
    res.json(devices);
  } catch (e) {
    next(e);
  }
};
