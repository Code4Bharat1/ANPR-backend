

import Client from "../models/Client.model.js";
import ProjectManager from "../models/ProjectManager.model.js";
import Supervisor from "../models/supervisor.model.js";
import Site from "../models/Site.model.js";
import Device from "../models/Device.model.js";
import Trip from "../models/Trip.model.js";
import User from "../models/User.model.js";
import Settings from '../models/admin.settings.model.js';
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import ExcelJS from 'exceljs';
import { PLANS } from "../config/plans.js";
import mongoose from "mongoose";
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


/* ======================================================
    GET CLIENT DASHBOARD  
====================================================== */

export const getClientDashboard = async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalSites,
      projectManagers,
      supervisors,
      todayEntries,
      todayExits,
      clientData,
      devices
    ] = await Promise.all([
      Site.countDocuments({ clientId }),
      ProjectManager.countDocuments({ clientId, isActive: true }),
      Supervisor.countDocuments({ clientId, isActive: true }),

      Trip.countDocuments({
        clientId,
        entryAt: { $gte: today, $lt: tomorrow }
      }),

      Trip.countDocuments({
        clientId,
        exitAt: { $gte: today, $lt: tomorrow }
      }),

      Client.findById(clientId).lean(),

      Device.find({ clientId }).select("devicetype isEnabled").lean()
    ]);

    // ✅ Get limits from PLANS config based on packageType
    const packageLimits = PLANS[clientData.packageType] || PLANS.LITE;

    // 🔌 Device usage breakdown
    const deviceUsage = {
      ANPR: devices.filter(d => d.devicetype === "ANPR").length,
      BARRIER: devices.filter(d => d.devicetype === "BARRIER").length,
      BIOMETRIC: devices.filter(d => d.devicetype === "BIOMETRIC").length,
    };

    const totalDevices = devices.length;
    const activeDevices = devices.filter(d => d.isEnabled).length;
    const inactiveDevices = totalDevices - activeDevices;

    // 🕒 Recent activity
    const recentActivity = await Trip.find({ clientId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("siteId", "name")
      .select("plateText entryAt exitAt status siteId");

    res.json({
      /* =========================
         PLAN INFO - Using PLANS config
      ========================= */
      plan: {
        packageType: clientData.packageType,
        packageStart: clientData.packageStart,
        packageEnd: clientData.packageEnd,
        limits: {
          pm: packageLimits.limits.pm,
          supervisor: packageLimits.limits.supervisor,
          devices: packageLimits.limits.devices
        }
      },

      /* =========================
         USAGE INFO
      ========================= */
      usage: {
        pm: projectManagers,
        supervisor: supervisors,
        devices: deviceUsage
      },

      /* =========================
         EXISTING DASHBOARD DATA
      ========================= */
      totalSites,
      totalProjectManagers: projectManagers,
      totalSupervisors: supervisors,
      totalUsers: projectManagers + supervisors,

      totalDevices,
      activeDevices,
      inactiveDevices,

      todayEntries,
      todayExits,
      todayTotal: todayEntries + todayExits,

      recentActivity: recentActivity.map(trip => ({
        title: `Vehicle ${trip.plateText}`,
        description: `${trip.status} at ${trip.siteId?.name}`,
        time: trip.entryAt || trip.exitAt
      })),

      lastUpdated: new Date().toISOString()
    });
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

/**
 * GET PROJECT MANAGERS (Client/Admin)
 * GET /api/clients/project-managers
 */
export const getProjectManagers = async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    const projectManagers = await ProjectManager.find({ clientId })
      .select("-password")                 // 🔐 never expose password
      .populate("assignedSites", "name")   // optional
      .sort({ createdAt: -1 });

    res.json({
      count: projectManagers.length,
      data: projectManagers
    });
  } catch (err) {
    next(err);
  }
};
/**
 * UPDATE PROJECT MANAGER (Client / Admin)
 * PUT /api/clients/project-managers/:id
 */
export const updateProjectManager = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🛑 Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Project Manager ID" });
    }

    const pm = await ProjectManager.findById(id);
    if (!pm) {
      return res.status(404).json({ message: "Project Manager not found" });
    }

    /**
     * 🔐 AUTHORIZATION RULE
     * Client → can update only their own PMs
     * Admin  → can update any PM
     */
    if (
      req.user.role === "client" &&
      String(pm.clientId) !== String(req.user.clientId)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ✅ Allowed fields only
    const {
      name,
      email,
      mobile,
      location,
      status,
      address,
      assignedSites,
      supervisors,
      isActive,
    } = req.body;

    if (name !== undefined) pm.name = name;
    if (email !== undefined) pm.email = email.toLowerCase().trim();
    if (mobile !== undefined) pm.mobile = mobile;
    if (location !== undefined) pm.location = location;
    if (status !== undefined) pm.status = status;
    if (req.body.address !== undefined && req.body.address.trim() !== "") {
      pm.address = req.body.address;
    }
    if (assignedSites !== undefined) pm.assignedSites = assignedSites;
    if (supervisors !== undefined) pm.supervisors = supervisors;
    if (isActive !== undefined) pm.isActive = isActive;

    await pm.save();

    res.json({
      success: true,
      message: "Project Manager updated successfully",
      data: {
        id: pm._id,
        name: pm.name,
        email: pm.email,
        mobile: pm.mobile,
        location: pm.location,
        status: pm.status,
        assignedSites: pm.assignedSites.length,
        supervisors: pm.supervisors.length,
        isActive: pm.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
};


export const createusers = async (req, res, next) => {
  try {
    const { name, email, phone, role, password, assignedSite } = req.body;

    // Validation
    if (!name || !email || !role || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Check if req.user exists
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Authentication failed: No client ID found" });
    }

    // Check if user already exists
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      phone,
      role: role === "Project Managers" ? "project_manager" : "supervisor",
      password,
      assignedSite,
      clientId: req.user.clientId,
      createdBy: req.user.id,
      status: 'Active' // Set default status
    });

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: "User created successfully",
      data: userResponse,
    });
  } catch (err) {
    console.error('Create user error:', err);
    next(err);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const { role } = req.query;

    // Check if req.user exists
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    let dbRole;
    if (role === "Project Managers") dbRole = "project_manager";
    if (role === "Supervisors") dbRole = "supervisor";

    const users = await User.find({
      clientId: req.user.clientId,
      ...(dbRole && { role: dbRole }),
    }).select("-password");

    res.json(
      users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role === "project_manager" ? "Project Manager" : "Supervisor",
        assignedSite: u.assignedSite || "-",
        status: u.status || "Active",
      }))
    );
  } catch (err) {
    console.error('List users error:', err);
    next(err);
  }
};

export const togglePMStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const { id } = req.params;



    // Check if req.user exists
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    const user = await ProjectManager.findOne({
      _id: id,
    });


    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.status = status;
    await user.save();

    res.json({
      message: "User status updated",
      status: user.status,
    });
  } catch (err) {
    console.error('Toggle status error:', err);
    next(err);
  }
};
export const toggleSupervisorStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const { id } = req.params;



    // Check if req.user exists
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    const user = await Supervisor.findOne({
      _id: id,
    });


    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.status = status;
    await user.save();

    res.json({
      message: "User status updated",
      status: user.status,
    });
  } catch (err) {
    console.error('Toggle status error:', err);
    next(err);
  }
};

// ============================================
// CONTROLLERS (controllers/clientAdmin.js)
// ============================================


/**
 * CREATE SITE
 */
export const createSite = async (req, res, next) => {
  try {
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { gates = [] } = req.body;

    // 🧹 Remove empty gates (VERY IMPORTANT)
    const cleanedGates = Array.isArray(gates)
      ? gates.filter(
          gate => gate?.gateName && gate.gateName.trim() !== ""
        )
      : [];

    // 🛡️ Ensure only one main gate
    const mainGateCount = cleanedGates.filter(g => g.isMainGate).length;
    if (mainGateCount > 1) {
      return res.status(400).json({
        message: "Only one gate can be marked as main gate"
      });
    }

    const site = await Site.create({
      ...req.body,
      gates: cleanedGates,
      clientId: req.user.clientId,
      createdBy: req.user.id,
    });

    res.status(201).json(site);
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL SITES
 */
export const getSites = async (req, res, next) => {
  try {
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({
        message: "Unauthorized or clientId missing",
      });
    }

    const sites = await Site.find({ clientId: req.user.clientId })
      .sort({ createdAt: -1 })
      .lean();

    const enrichedSites = sites.map(site => ({
      ...site,
      assignedPMs: site.projectManagers?.length || 0,
      assignedSupervisors: site.supervisors?.length || 0,

      // 🚪 Gate metrics
      totalGates: site.gates?.length || 0,
      activeGates: site.gates?.filter(g => g.isActive).length || 0,

      totalDevices: 0, // future ready
    }));

    res.json({
      count: enrichedSites.length,
      data: enrichedSites,
    });
  } catch (err) {
    next(err);
  }
};


/**
 * UPDATE SITE
 */
export const updateSite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { gates } = req.body;

    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const site = await Site.findById(id);

    if (!site) {
      return res.status(404).json({ message: "Site not found" });
    }

    if (site.clientId.toString() !== req.user.clientId.toString()) {
      return res.status(403).json({
        message: "Forbidden: You don't have permission to update this site",
      });
    }

    // 🛡️ Gate validation (optional but recommended)
    if (gates) {
      const mainGateCount = gates.filter(g => g.isMainGate).length;
      if (mainGateCount > 1) {
        return res.status(400).json({
          message: "Only one gate can be marked as main gate"
        });
      }
    }

    const updatedSite = await Site.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      }
    );

    res.json({
      message: "Site updated successfully",
      data: updatedSite,
    });
  } catch (err) {
    next(err);
  }
};


/**
 * DELETE SITE
 */
export const deleteSite = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🔐 Safety check
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1️⃣ Check if site exists
    const site = await Site.findById(id);

    if (!site) {
      return res.status(404).json({ message: "Site not found" });
    }

    // 2️⃣ Verify ownership (site belongs to this client)
    if (site.clientId.toString() !== req.user.clientId.toString()) {
      return res.status(403).json({
        message: "Forbidden: You don't have permission to delete this site"
      });
    }

    // 3️⃣ Check if site is assigned to any users (Optional - based on your business logic)
    const assignedPMs = await ProjectManager.countDocuments({
      assignedSites: id
    });

    const assignedSupervisors = await Supervisor.countDocuments({
      siteId: id
    });

    if (assignedPMs > 0 || assignedSupervisors > 0) {
      return res.status(400).json({
        message: `Cannot delete site. It is assigned to ${assignedPMs} project manager(s) and ${assignedSupervisors} supervisor(s).`,
        assignedPMs,
        assignedSupervisors
      });
    }

    // 4️⃣ Delete the site
    await Site.findByIdAndDelete(id);

    res.json({
      message: "Site deleted successfully",
      deletedSite: site,
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


/* ======================================================
   GET REPORTS WITH FILTERS
====================================================== */
export const getReports = async (req, res, next) => {
  try {
    const { startDate, endDate, status, site } = req.query;

    // Build query
    const query = { clientId: req.user.clientId };

    // Date filter
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    // Status filter
    if (status && status !== 'All Status') {
      query.status = status;
    }

    // Site filter
    if (site && site !== 'All Sites') {
      query.site = site;
    }

    const trips = await Trip.find(query).sort({ createdAt: -1 });

    res.json(
      trips.map((trip) => ({
        id: trip._id,
        vehicleNumber: trip.vehicleNumber,
        entryTime: trip.entryTime
          ? new Date(trip.entryTime).toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
          : '-',
        exitTime: trip.exitTime
          ? new Date(trip.exitTime).toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
          : '-',
        status: trip.status || 'Active',
        site: trip.site || '-'
      }))
    );
  } catch (err) {
    console.error('Get reports error:', err);
    next(err);
  }
};

/* ======================================================
   EXPORT REPORTS TO EXCEL
====================================================== */
export const exportReports = async (req, res, next) => {
  try {
    const { startDate, endDate, status, site } = req.query;

    // Build query
    const query = { clientId: req.user.clientId };

    // Date filter
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    // Status filter
    if (status && status !== 'All Status') {
      query.status = status;
    }

    // Site filter
    if (site && site !== 'All Sites') {
      query.site = site;
    }

    const trips = await Trip.find(query).sort({ createdAt: -1 });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trips Report');

    // Define columns
    worksheet.columns = [
      { header: 'Trip ID', key: 'tripId', width: 25 },
      { header: 'Vehicle Number', key: 'vehicleNumber', width: 20 },
      { header: 'Entry Time', key: 'entryTime', width: 25 },
      { header: 'Exit Time', key: 'exitTime', width: 25 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { ...worksheet.getRow(1).font, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    trips.forEach((trip) => {
      worksheet.addRow({
        tripId: trip._id.toString(),
        vehicleNumber: trip.vehicleNumber,
        entryTime: trip.entryTime
          ? new Date(trip.entryTime).toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
          : '-',
        exitTime: trip.exitTime
          ? new Date(trip.exitTime).toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
          : '-',
        status: trip.status || 'Active'
      });
    });

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Center align all cells except Trip ID
        if (cell.col !== 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=trips_report_${Date.now()}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Export reports error:', err);
    next(err);
  }
};




export const createSupervisor = async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      siteId,
      projectManagerId,
    } = req.body;

    if (!projectManagerId) {
      return res.status(400).json({ message: "Project Manager is required" });
    }

    // ✅ Fetch PM to get clientId
    const pm = await ProjectManager.findById(projectManagerId).select("clientId");
    if (!pm) {
      return res.status(404).json({ message: "Project Manager not found" });
    }

    const supervisor = await Supervisor.create({
      name,
      email,
      mobile,
      password,
      siteId,
      clientId: pm.clientId, // ✅ AUTO SET
      projectManagerId,
    });

    await ProjectManager.findByIdAndUpdate(
      projectManagerId,
      { $addToSet: { supervisors: supervisor._id } }
    );

    res.status(201).json({
      message: "Supervisor created successfully",
      supervisor,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
/**
 * UPDATE SUPERVISOR (Client / Admin)
 * PUT /api/clients/supervisor/:id
 */
export const updateSupervisor = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🛑 ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Supervisor ID" });
    }

    const supervisor = await Supervisor.findById(id);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    /**
     * 🔐 AUTHORIZATION
     * Client → only same client supervisors
     * Admin  → all supervisors
     */
    if (
      req.user.role === "client" &&
      String(supervisor.clientId) !== String(req.user.clientId)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ✅ Allowed fields only
    const {
      name,
      email,
      mobile,
      address,
      status,
      siteId,
      projectManagerId,
      isActive,
    } = req.body;

    if (name !== undefined) supervisor.name = name;
    if (email !== undefined) supervisor.email = email.toLowerCase().trim();
    if (mobile !== undefined) supervisor.mobile = mobile;

    // 🔐 Address safe update (same PM logic)
    if (address !== undefined && address.trim() !== "") {
      supervisor.address = address;
    }

    if (status !== undefined) supervisor.status = status;
    if (siteId !== undefined) supervisor.siteId = siteId;
    if (projectManagerId !== undefined) supervisor.projectManagerId = projectManagerId;
    if (isActive !== undefined) supervisor.isActive = isActive;

    await supervisor.save();

    res.json({
      success: true,
      message: "Supervisor updated successfully",
      data: {
        id: supervisor._id,
        name: supervisor.name,
        email: supervisor.email,
        mobile: supervisor.mobile,
        status: supervisor.status,
        siteId: supervisor.siteId,
        projectManagerId: supervisor.projectManagerId,
        isActive: supervisor.isActive,
      },
    });
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
      return res.status(401).json({ message: "User not authenticated" });
    }

    let profile;

    // CLIENT / CLIENT ADMIN
    if (req.user.role === "client" || req.user.role === "client_admin") {
      profile = await Client.findById(req.user.id).select("-password");
    }

    // SYSTEM ADMIN
    if (req.user.role === "admin") {
      profile = await Admin.findById(req.user.id).select("-password");
    }

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json({
      success: true,
      role: req.user.role,
      data: profile,
    });
  } catch (err) {
    next(err);
  }
};

export const updateMyProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { profile, company, preferences } = req.body;

    let user;

    // CLIENT / CLIENT ADMIN
    if (req.user.role === "client" || req.user.role === "client_admin") {
      user = await Client.findById(req.user.id);
    }

    // ADMIN
    if (req.user.role === "admin") {
      user = await Admin.findById(req.user.id);
    }

    if (!user) {
      return res.status(404).json({ message: "Profile not found" });
    }

    /* ======================
       UPDATE PROFILE FIELDS
    ====================== */
    if (profile) {
      if (profile.fullName) user.name = profile.fullName;
      if (profile.email) user.email = profile.email;
      if (profile.phone) user.phone = profile.phone;
      if (profile.location !== undefined) user.location = profile.location;
    }

    /* ======================
       UPDATE COMPANY (CLIENT ONLY)
    ====================== */
    if (company && user.company) {
      user.company = {
        ...user.company,
        ...company,
      };
    }

    /* ======================
       UPDATE PREFERENCES
    ====================== */
    if (preferences) {
      user.preferences = {
        ...user.preferences,
        ...preferences,
      };
    }

    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   GET SETTINGS
====================================================== */
export const getSettings = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔥 FIX: resolve clientId safely
    const clientId =
      req.user.role === "client"
        ? req.user.id
        : req.user.clientId;

    if (!clientId) {
      return res.status(400).json({
        message: "ClientId not found in token",
      });
    }

    let settings = await Settings.findOne({ clientId });

    // Create default settings if not exist
    if (!settings) {
      settings = await Settings.create({
        clientId,
        company: {
          name: "Your Company Name",
          address: "Your Company Address",
          supportEmail:
            req.user.email || "support@company.com",
        },
      });
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (err) {
    console.error("Get settings error:", err);
    next(err);
  }
};

/* ======================================================
   UPDATE SETTINGS
====================================================== */
export const updateSettings = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔥 FIX: resolve clientId safely
    const clientId =
      req.user.role === "client"
        ? req.user.id
        : req.user.clientId;

    if (!clientId) {
      return res.status(400).json({
        message: "ClientId not found in token",
      });
    }

    const { company } = req.body;

    let settings = await Settings.findOne({ clientId });
    if (!settings) {
      settings = new Settings({ clientId });
    }

    if (company) {
      settings.company = {
        ...settings.company,
        ...company,
      };
    }

    await settings.save();

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (err) {
    console.error("Update settings error:", err);
    next(err);
  }
};
