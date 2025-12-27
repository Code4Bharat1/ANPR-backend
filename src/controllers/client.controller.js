// import Client from "../models/Client.model.js";
// import { logAudit } from "../middlewares/audit.middleware.js";

// const generateClientCode = async () => {
//   let code;
//   let exists = true;

//   while (exists) {
//     code = "CL-" + Math.floor(100000 + Math.random() * 900000);
//     exists = await Client.findOne({ clientCode: code });
//   }
//   return code;
// };

// export const createClient = async (req, res, next) => {
//   try {
//     const {
//       companyName,
//       email,
//       password,
//       packageStart,
//       packageEnd
//     } = req.body;

//     const clientCode = await generateClientCode();

//     const client = await Client.create({
//       companyName,
//       email,
//       password,
//       role: "client",          // ✅ force role
//       packageStart,
//       packageEnd,
//       clientCode,
//       createdBy: req.user.id,
//     });

//     res.status(201).json(client);
//   } catch (e) {
//     next(e);
//   }
// };


// export const getClients = async (req, res, next) => {
//   try {
//     const clients = await Client.find().sort({ createdAt: -1 });
//     res.json(clients);
//   } catch (e) {
//     next(e);
//   }
// };

// export const updateClient = async (req, res, next) => {
//   try {
//     const { id } = req.params;

//     const old = await Client.findById(id);
//     if (!old) return res.status(404).json({ message: "Client not found" });

//     const updated = await Client.findByIdAndUpdate(id, req.body, { new: true });

//     await logAudit({ req, action: "UPDATE", module: "CLIENT", oldValue: old, newValue: updated });

//     res.json(updated);
//   } catch (e) {
//     next(e);
//   }
// };

// export const toggleClient = async (req, res, next) => {
//   try {
//     const { id } = req.params;

//     const old = await Client.findById(id);
//     if (!old) return res.status(404).json({ message: "Client not found" });

//     old.isActive = !old.isActive;
//     await old.save();

//     await logAudit({ req, action: "TOGGLE", module: "CLIENT", newValue: old });

//     res.json(old);
//   } catch (e) {
//     next(e);
//   }
// };

import Client from "../models/Client.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/* ------------------ CREATE CLIENT ------------------ */
export const createClient = async (req, res, next) => {
  try {
    const { companyName, email, password, packageStart, packageEnd } = req.body;

    if (!companyName || !email || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Check duplicate email
    const existing = await Client.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Client already exists" });
    }

    const clientCode = `CL-${Math.floor(100000 + Math.random() * 900000)}`;

    const hashedPassword = await hashPassword(password);

    const client = await Client.create({
      companyName,
      email,
      password: hashedPassword,
      role: "client",
      clientCode,
      packageStart,
      packageEnd,
      createdBy: req.user.id,
    });

    await logAudit({
      req,
      action: "CREATE",
      module: "CLIENT",
      newValue: client,
    });

    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
};

/* ------------------ GET CLIENTS ------------------ */
export const getClients = async (req, res, next) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    next(err);
  }
};

/* ------------------ UPDATE CLIENT ------------------ */
export const updateClient = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Client.findById(id);
    if (!existing) return res.status(404).json({ message: "Client not found" });

    const allowed = ["companyName", "packageStart", "packageEnd", "isActive"];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const updated = await Client.findByIdAndUpdate(id, updates, { new: true });

    await logAudit({
      req,
      action: "UPDATE",
      module: "CLIENT",
      oldValue: existing,
      newValue: updated,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/* ------------------ TOGGLE CLIENT STATUS ------------------ */
export const toggleClient = async (req, res, next) => {
  try {
    const { id } = req.params;

    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    client.isActive = !client.isActive;
    await client.save();

    await logAudit({
      req,
      action: "TOGGLE",
      module: "CLIENT",
      newValue: client,
    });

    res.json(client);
  } catch (err) {
    next(err);
  }
};
