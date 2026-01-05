import Vendor from "../models/Vendor.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import mongoose from "mongoose";
export const createVendor = async (req, res, next) => {
  try {
    const { name, email, phone, address, assignedSites } = req.body;

    if (!name || !email || !phone || !address) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const vendor = await Vendor.create({
      name,
      email,
      phone,
      address,
      assignedSites,
      clientId: req.user.clientId,     // 🔐 client ownership
      projectManagerId: req.user.id,   // 👤 creator PM
    });

    await logAudit({
      req,
      action: "CREATE",
      module: "VENDOR",
      newValue: vendor,
    });

    res.status(201).json({
      success: true,
      data: vendor,
    });
  } catch (e) {
    next(e);
  }
};

export const getVendors = async (req, res, next) => {
  try {
    const vendors = await Vendor.find({
      clientId: req.user.clientId,
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: vendors });
  } catch (e) {
    next(e);
  }
};


export const updateVendor = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid vendor ID" });
    }

    const old = await Vendor.findById(id);
    if (!old) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // 🔐 Client-level authorization
    if (String(old.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await Vendor.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    await logAudit({
      req,
      action: "UPDATE",
      module: "VENDOR",
      oldValue: old,
      newValue: updated,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
};

