import Site from "../models/Site.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const createSite = async (req, res, next) => {
  try {
    const { name, address } = req.body;
    const clientId = req.user.clientId;

    const site = await Site.create({ clientId, name, address });

    await logAudit({ req, action: "CREATE", module: "SITE", newValue: site });

    res.status(201).json(site);
  } catch (e) {
    next(e);
  }
};

export const getSites = async (req, res, next) => {
  try {
    const q = {};
    if (req.user.clientId) q.clientId = req.user.clientId;

    const sites = await Site.find(q).sort({ createdAt: -1 });
    res.json(sites);
  } catch (e) {
    next(e);
  }
};

export const updateSite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const old = await Site.findById(id);
    if (!old) return res.status(404).json({ message: "Site not found" });

    // ensure same client
    if (String(old.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await Site.findByIdAndUpdate(id, req.body, { new: true });

    await logAudit({ req, action: "UPDATE", module: "SITE", oldValue: old, newValue: updated });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const toggleSite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const site = await Site.findById(id);
    if (!site) return res.status(404).json({ message: "Site not found" });

    if (String(site.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    site.isActive = !site.isActive;
    await site.save();

    await logAudit({ req, action: "TOGGLE", module: "SITE", newValue: site });

    res.json(site);
  } catch (e) {
    next(e);
  }
};
