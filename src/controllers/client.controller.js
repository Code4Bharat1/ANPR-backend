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
import ProjectManager from "../models/ProjectManager.model.js";
import Supervisor from "../models/supervisor.model.js";
import Site from "../models/Site.model.js";
import Device from "../models/Device.model.js";
import Trip from "../models/Trip.model.js";
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
export const getClientDashboard = async (req, res, next) => {
  try {
    // 🔥 SAFETY CHECK
    if (!req.user) {
      return res.status(401).json({
        message: "User not authenticated",
      });
    }

    if (!req.user.clientId) {
      return res.status(400).json({
        message: "ClientId missing in token",
      });
    }

    const clientId = req.user.clientId;

    const stats = {
      totalSites: await Site.countDocuments({ clientId }),
      projectManagers: await ProjectManager.countDocuments({ clientId }),
      supervisors: await Supervisor.countDocuments({ clientId }),
      devices: await Device.countDocuments({ clientId }),
    };

    res.json(stats);
  } catch (err) {
    next(err);
  }
};

export const createProjectManager = async (req, res, next) => {
  try {
    const { name, email, mobile, password, assignedSites } = req.body;

    const pm = await ProjectManager.create({
      name,
      email: email.toLowerCase().trim(), // ✅ FIX
      mobile,
      password,
      assignedSites: assignedSites || [],
      clientId: req.user.clientId,
      createdBy: req.user.id,
      role: "project_manager", // ✅ FIX (CRITICAL)
    });

    res.status(201).json(pm);
  } catch (err) {
    next(err);
  }
};




export const getUsers = async (req, res) => {
  const clientId = req.user.clientId;

  const managers = await ProjectManager.find({ clientId }).select("-password");
  const supervisors = await Supervisor.find({ clientId }).select("-password");

  res.json({ managers, supervisors });
};

export const createSite = async (req, res) => {
  const site = await Site.create({
    ...req.body,
    clientId: req.user.clientId,
    createdBy: req.user.id,
  });

  res.status(201).json(site);
};
export const getSites = async (req, res, next) => {
  try {
    // 🔐 safety check
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({
        message: "Unauthorized or clientId missing",
      });
    }

    const sites = await Site.find({ clientId: req.user.clientId })
      .sort({ createdAt: -1 });

    res.json({
      count: sites.length,
      data: sites,
    });
  } catch (err) {
    next(err);
  }
};


export const toggleUser = async (req, res) => {
  const user = await ProjectManager.findById(req.params.id);
  user.isActive = !user.isActive;
  await user.save();
  res.json(user);
};
export const getDevices = async (req, res) => {
  const devices = await Device.find({ clientId: req.user.clientId });
  res.json(devices);
};
export const getReports = async (req, res) => {
  const reports = await Trip.find({ clientId: req.user.clientId });
  res.json(reports);
};
export const createSupervisor = async (req, res, next) => {
  try {
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, email, mobile, password, siteId } = req.body;

    const supervisor = await Supervisor.create({
      name,
      email,
      mobile,
      password: await hashPassword(password),
      siteId,
      clientId: req.user.clientId,
      createdBy: req.user.id,
    });

    res.status(201).json(supervisor);
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL SUPERVISORS (Client Admin)
 */
export const getSupervisors = async (req, res, next) => {
  try {
    // 🔐 Safety checks
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const clientId = req.user.clientId;

    const supervisors = await Supervisor.find({ clientId })
      .populate("siteId", "name")   // optional
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({
      count: supervisors.length,
      supervisors,
    });
  } catch (err) {
    next(err);
  }
};
export const getMyProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "User not authenticated",
      });
    }

    let profile;

    // 👤 CLIENT ADMIN
    if (req.user.role === "client") {
      profile = await Client.findById(req.user.id).select("-password");
    }

    // 👤 SYSTEM ADMIN (optional support)
    if (req.user.role === "admin") {
      profile = await Admin.findById(req.user.id).select("-password");
    }

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    res.json({
      role: req.user.role,
      data: profile,
    });
  } catch (err) {
    next(err);
  }
};
