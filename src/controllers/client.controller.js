import Client from "../models/Client.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

export const createClient = async (req, res, next) => {
  try {
    const { companyName, packageStart, packageEnd } = req.body;

    const client = await Client.create({
      companyName,
      packageStart,
      packageEnd,
      createdBy: req.user.id,
    });

    await logAudit({ req, action: "CREATE", module: "CLIENT", newValue: client });

    res.status(201).json(client);
  } catch (e) {
    next(e);
  }
};

export const getClients = async (req, res, next) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (e) {
    next(e);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const { id } = req.params;

    const old = await Client.findById(id);
    if (!old) return res.status(404).json({ message: "Client not found" });

    const updated = await Client.findByIdAndUpdate(id, req.body, { new: true });

    await logAudit({ req, action: "UPDATE", module: "CLIENT", oldValue: old, newValue: updated });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const toggleClient = async (req, res, next) => {
  try {
    const { id } = req.params;

    const old = await Client.findById(id);
    if (!old) return res.status(404).json({ message: "Client not found" });

    old.isActive = !old.isActive;
    await old.save();

    await logAudit({ req, action: "TOGGLE", module: "CLIENT", newValue: old });

    res.json(old);
  } catch (e) {
    next(e);
  }
};
