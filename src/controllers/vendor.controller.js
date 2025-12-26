import Vendor from "../models/Vendor.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const createVendor = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const vendor = await Vendor.create({ clientId: req.user.clientId, name, phone });

    await logAudit({ req, action: "CREATE", module: "VENDOR", newValue: vendor });

    res.status(201).json(vendor);
  } catch (e) {
    next(e);
  }
};

export const getVendors = async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ clientId: req.user.clientId }).sort({ createdAt: -1 });
    res.json(vendors);
  } catch (e) {
    next(e);
  }
};

export const updateVendor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const old = await Vendor.findById(id);
    if (!old) return res.status(404).json({ message: "Vendor not found" });
    if (String(old.clientId) !== String(req.user.clientId)) return res.status(403).json({ message: "Forbidden" });

    const updated = await Vendor.findByIdAndUpdate(id, req.body, { new: true });

    await logAudit({ req, action: "UPDATE", module: "VENDOR", oldValue: old, newValue: updated });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};
