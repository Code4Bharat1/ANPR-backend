import Site from "../models/Site.model.js";
import ProjectManager from "../models/ProjectManager.model.js";
import Supervisor from "../models/supervisor.model.js";
import Vehicle from "../models/Vehicle.model.js"; // Added missing import
import Client from "../models/Client.model.js"; // Added missing import
import Device from "../models/Device.model.js"; // Added missing import
import mongoose from "mongoose";
import { logAudit } from "../middlewares/audit.middleware.js";

/* ======================================================
   CLIENT LEVEL SITE MANAGEMENT (For clients managing their own sites)
====================================================== */

/**
 * CREATE SITE - Client Level
 */
export const createClientSite = async (req, res, next) => {
  try {
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { gates = [] } = req.body;

    // 🧹 Remove empty gates
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

    await logAudit({ req, action: "CREATE", module: "SITE", newValue: site });

    res.status(201).json(site);
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL SITES - Client Level
 */
export const getClientSites = async (req, res, next) => {
  try {
    if (!req.user || !req.user.clientId) {
      return res.status(401).json({
        message: "Unauthorized or clientId missing",
      });
    }

    const q = {};
    if (req.user.clientId) q.clientId = req.user.clientId;

    const sites = await Site.find(q)
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
 * UPDATE SITE - Client Level
 */
export const updateClientSite = async (req, res, next) => {
  try {
    console.log('🔄 UPDATE SITE REQUEST BODY:', JSON.stringify(req.body, null, 2));

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

    // 🛡️ Gate validation and transformation
    let cleanedGates = [];
    if (gates && Array.isArray(gates)) {
      console.log('🚪 Processing gates:', gates);
      
      cleanedGates = gates
        .filter(gate => {
          // Accept either gateName or name field
          const name = gate?.gateName || gate?.name;
          return name && name.trim() !== "";
        })
        .map(gate => ({
          // Convert name to gateName if needed
          gateName: gate.gateName || gate.name,
          isMainGate: gate.isMainGate || false,
          isActive: gate.isActive !== undefined ? gate.isActive : true,
          gateCode: gate.gateCode || undefined
        }));
      
      console.log('🚪 Transformed gates:', cleanedGates);
      
      const mainGateCount = cleanedGates.filter(g => g.isMainGate).length;
      if (mainGateCount > 1) {
        return res.status(400).json({
          message: "Only one gate can be marked as main gate"
        });
      }
    }

    const oldValue = site.toObject();
    
    // Prepare update data with transformed gates
    const updateData = {
      ...req.body,
      updatedBy: req.user.id,
      updatedAt: new Date(),
    };
    
    // Only include gates if we have cleaned gates
    if (cleanedGates.length > 0) {
      updateData.gates = cleanedGates;
    }

    console.log('📝 Final update data:', updateData);

    const updatedSite = await Site.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    console.log('✅ Site updated successfully');

    await logAudit({ 
      req, 
      action: "UPDATE", 
      module: "SITE", 
      oldValue: oldValue, 
      newValue: updatedSite 
    });

    res.json({
      message: "Site updated successfully",
      data: updatedSite,
    });
  } catch (err) {
    console.error('❌ Update Site Error:', err);
    console.error('❌ Validation Errors:', err.errors);
    
    // Check for validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        message: "Validation failed",
        errors: errors
      });
    }
    
    next(err);
  }
};

/**
 * TOGGLE SITE ACTIVE STATUS - Client Level
 */
export const toggleClientSite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const site = await Site.findById(id);
    
    if (!site) return res.status(404).json({ message: "Site not found" });

    if (String(site.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const oldValue = site.toObject();
    site.isActive = !site.isActive;
    site.updatedBy = req.user.id;
    site.updatedAt = new Date();
    await site.save();

    await logAudit({ 
      req, 
      action: "TOGGLE", 
      module: "SITE", 
      oldValue: oldValue, 
      newValue: site 
    });

    res.json(site);
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE SITE - Client Level
 */
export const deleteClientSite = async (req, res, next) => {
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

    // 2️⃣ Verify ownership
    if (site.clientId.toString() !== req.user.clientId.toString()) {
      return res.status(403).json({
        message: "Forbidden: You don't have permission to delete this site"
      });
    }

    // 3️⃣ Check if site is assigned to any users
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

    // 4️⃣ Log audit before deletion
    await logAudit({ 
      req, 
      action: "DELETE", 
      module: "SITE", 
      oldValue: site 
    });

    // 5️⃣ Delete the site
    await Site.findByIdAndDelete(id);

    res.json({
      message: "Site deleted successfully",
      deletedSite: site,
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   PROJECT MANAGER LEVEL SITE MANAGEMENT
====================================================== */

/**
 * GET MY SITES - For Project Managers
 */
export const getMySites = async (req, res) => {
  try {
    console.log('🔍 getMySites called');
    console.log('🔍 req.user:', req.user);
    console.log('🔍 User ID from token:', req.user?.id);
    
    // Check if req.user exists
    if (!req.user || !req.user.id) {
      console.error('❌ No user found in request');
      return res.status(401).json({ 
        message: 'Authentication failed - no user in request',
        user: req.user 
      });
    }

    // Try to find the project manager
    const pm = await ProjectManager.findById(req.user.id)
      .populate({
        path: "assignedSites",
        select:
          "name location address status contactPerson contactPhone supervisors projectManagers totalVehicles activeVehicles vehiclesOnSite todayEntries todayExits utilization gates createdAt clientId",
      })
      .lean();

    console.log('🔍 Found Project Manager:', pm ? 'Yes' : 'No');
    
    if (!pm) {
      console.error('❌ Project manager not found in database with ID:', req.user.id);
      return res.status(404).json({ 
        message: "Project manager not found",
        userId: req.user.id 
      });
    }

    // Transform the data for frontend
    const sites = (pm?.assignedSites || []).map((site) => ({
      id: site._id,
      _id: site._id,
      name: site.name,
      location: site.location,
      status: site.status,
      address: site.address,
      contactPerson: site.contactPerson,
      contactPhone: site.contactPhone,
      supervisors: site.supervisors?.length || 0,
      activeVehicles: site.activeVehicles || 0,
      totalVehicles: site.totalVehicles || 0,
      vehiclesOnSite: site.vehiclesOnSite || 0,
      todayEntries: site.todayEntries || 0,
      todayExits: site.todayExits || 0,
      utilization: site.utilization || 0,
      gates: site.gates || [],
      clientId: site.clientId,
      createdAt: site.createdAt,
    }));

    console.log('✅ Returning sites:', sites.length);
    res.json(sites);
  } catch (err) {
    console.error("❌ Error fetching sites:", err);
    res.status(500).json({
      message: "Error fetching sites",
      error: err.message,
    });
  }
};
/**
 * GET SITE DETAILS - For Project Managers
 */
export const getPMSiteDetails = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    const siteId = req.params.id;

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    const site = await Site.findById(siteId)
      .populate("supervisors", "name email phone")
      .populate("projectManagers", "name email phone")
      .populate("clientId", "companyName clientname");

    if (!site) {
      return res.status(404).json({ message: "Site not found" });
    }

    // Get today's date at 00:00:00
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get recent entry logs (last 24 hours)
    const recentEntries = await VehicleLog.find({
      siteId: siteId,
      type: "entry",
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    // Get recent exit logs (last 24 hours)
    const recentExits = await VehicleLog.find({
      siteId: siteId,
      type: "exit",
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    // Get today's counts
    const todayEntries = await VehicleLog.countDocuments({
      siteId: siteId,
      type: "entry",
      timestamp: { $gte: todayStart },
    });

    const todayExits = await VehicleLog.countDocuments({
      siteId: siteId,
      type: "exit",
      timestamp: { $gte: todayStart },
    });

    // Prepare the response
    const response = {
      // Basic site info
      ...site.toObject(),

      // Enhanced traffic data
      entryVehicles: recentEntries.map((entry) => ({
        vehicleNumber: entry.vehicleNumber,
        time: entry.timestamp.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        driver: entry.driverName || "Unknown",
        gate: entry.gateName || "N/A",
      })),

      exitVehicles: recentExits.map((exit) => ({
        vehicleNumber: exit.vehicleNumber,
        time: exit.timestamp.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        driver: exit.driverName || "Unknown",
        gate: exit.gateName || "N/A",
      })),

      todayEntries: todayEntries,
      todayExits: todayExits,

      // Live vehicles formatted for frontend
      liveVehicles: (site.liveVehicles || []).map((vehicle) => ({
        vehicleNumber: vehicle.vehicleNumber || "N/A",
        type: vehicle.type || "Unknown",
        status: vehicle.status || "Idle",
        driver: vehicle.driver || "Not assigned",
        fuelLevel: vehicle.fuelLevel || 0,
        hoursOperated: vehicle.hoursOperated || 0,
        lastUpdate: vehicle.lastUpdate
          ? vehicle.lastUpdate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
      })),

      // Statistics
      supervisorCount: site.supervisors?.length || 0,
      projectManagerCount: site.projectManagers?.length || 0,

      // Additional calculated fields
      utilization:
        site.utilization ||
        (site.totalVehicles > 0
          ? Math.round((site.vehiclesOnSite / site.totalVehicles) * 100)
          : 0),
    };

    res.json(response);
  } catch (err) {
    console.error("Error fetching site details:", err);
    res.status(500).json({
      message: "Error fetching site details",
      error: err.message,
    });
  }
};

/**
 * GET SITE TRAFFIC - For Project Managers
 */
export const getSiteTraffic = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    const siteId = req.params.id;

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    // Get date range from query params (default: last 7 days)
    const days = parseInt(req.query.days) || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trafficData = await VehicleLog.aggregate([
      {
        $match: {
          siteId: new mongoose.Types.ObjectId(siteId),
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            type: "$type",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          entries: {
            $sum: {
              $cond: [{ $eq: ["$_id.type", "entry"] }, "$count", 0],
            },
          },
          exits: {
            $sum: {
              $cond: [{ $eq: ["$_id.type", "exit"] }, "$count", 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(trafficData);
  } catch (err) {
    console.error("Error fetching traffic data:", err);
    res.status(500).json({
      message: "Error fetching traffic data",
      error: err.message,
    });
  }
};

/**
 * GET SITE ACTIVITY - For Project Managers
 */
export const getSiteActivity = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    const siteId = req.params.id;

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    const site = await Site.findById(siteId)
      .select("liveVehicles vehiclesOnSite activeVehicles totalVehicles")
      .lean();

    if (!site) {
      return res.status(404).json({ message: "Site not found" });
    }

    const activityData = {
      liveVehicles: (site.liveVehicles || []).map((vehicle) => ({
        vehicleNumber: vehicle.vehicleNumber || "N/A",
        type: vehicle.type || "Unknown",
        status: vehicle.status || "Idle",
        driver: vehicle.driver || "Not assigned",
        fuelLevel: vehicle.fuelLevel || 0,
        hoursOperated: vehicle.hoursOperated || 0,
        lastUpdate: vehicle.lastUpdate,
        location: vehicle.location,
      })),
      summary: {
        vehiclesOnSite: site.vehiclesOnSite || 0,
        activeVehicles: site.activeVehicles || 0,
        totalVehicles: site.totalVehicles || 0,
        idleVehicles: (site.liveVehicles || []).filter(
          (v) => v.status === "Idle"
        ).length,
        workingVehicles: (site.liveVehicles || []).filter(
          (v) => v.status === "Working"
        ).length,
        maintenanceVehicles: (site.liveVehicles || []).filter(
          (v) => v.status === "Maintenance"
        ).length,
      },
    };

    res.json(activityData);
  } catch (err) {
    console.error("Error fetching activity data:", err);
    res.status(500).json({
      message: "Error fetching activity data",
      error: err.message,
    });
  }
};

/**
 * LOG VEHICLE MOVEMENT - For Project Managers
 */
export const logVehicleMovement = async (req, res) => {
  try {
    const {
      siteId,
      vehicleNumber,
      type,
      driverName,
      gateName,
      purpose,
      remarks,
    } = req.body;

    // Validate required fields
    if (!siteId || !vehicleNumber || !type || !gateName) {
      return res.status(400).json({
        message:
          "Missing required fields: siteId, vehicleNumber, type, gateName",
      });
    }

    // Check if user has access to the site
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    // Create log entry
    const logEntry = new VehicleLog({
      siteId,
      vehicleNumber,
      type,
      driverName,
      gateName,
      purpose,
      remarks,
      timestamp: new Date(),
    });

    await logEntry.save();

    // Update site counters
    const updateFields = {};
    if (type === "entry") {
      updateFields.$inc = {
        vehiclesOnSite: 1,
        todayEntries: 1,
      };
    } else if (type === "exit") {
      updateFields.$inc = {
        vehiclesOnSite: -1,
        todayExits: 1,
      };
      // Ensure vehiclesOnSite doesn't go below 0
      updateFields.vehiclesOnSite = { $max: [0, "$vehiclesOnSite"] };
    }

    if (Object.keys(updateFields).length > 0) {
      await Site.findByIdAndUpdate(siteId, updateFields);
    }

    res.status(201).json({
      message: "Vehicle movement logged successfully",
      log: logEntry,
    });
  } catch (err) {
    console.error("Error logging vehicle movement:", err);
    res.status(500).json({
      message: "Error logging vehicle movement",
      error: err.message,
    });
  }
};

/**
 * UPDATE VEHICLE STATUS - For Project Managers
 */
export const updateVehicleStatus = async (req, res) => {
  try {
    const {
      siteId,
      vehicleId,
      status,
      fuelLevel,
      hoursOperated,
      location,
    } = req.body;

    if (!siteId || !vehicleId) {
      return res.status(400).json({
        message: "Missing required fields: siteId, vehicleId",
      });
    }

    // Check access
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    // Update or add vehicle to liveVehicles array
    const update = {
      $set: {
        "liveVehicles.$[vehicle].status": status,
        "liveVehicles.$[vehicle].fuelLevel": fuelLevel,
        "liveVehicles.$[vehicle].hoursOperated": hoursOperated,
        "liveVehicles.$[vehicle].location": location,
        "liveVehicles.$[vehicle].lastUpdate": new Date(),
      },
    };

    const options = {
      arrayFilters: [{ "vehicle.vehicleId": vehicleId }],
      new: true,
    };

    const site = await Site.findByIdAndUpdate(siteId, update, options);

    // If vehicle not found in array, add it
    if (!site) {
      const newVehicle = {
        vehicleId,
        status,
        fuelLevel,
        hoursOperated,
        location,
        lastUpdate: new Date(),
      };
      await Site.findByIdAndUpdate(siteId, {
        $push: { liveVehicles: newVehicle },
      });
    }

    res.json({
      message: "Vehicle status updated successfully",
    });
  } catch (err) {
    console.error("Error updating vehicle status:", err);
    res.status(500).json({
      message: "Error updating vehicle status",
      error: err.message,
    });
  }
};

/**
 * ADD VEHICLE TO SITE - For Project Managers
 */
export const addVehicleToSite = async (req, res) => {
  try {
    const { siteId, vehicleId, vehicleNumber, type } = req.body;

    if (!siteId || !vehicleId || !vehicleNumber) {
      return res.status(400).json({
        message: "Missing required fields: siteId, vehicleId, vehicleNumber",
      });
    }

    // Check access
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    // Add vehicle to site and update counters
    const updatedSite = await Site.findByIdAndUpdate(
      siteId,
      {
        $push: {
          liveVehicles: {
            vehicleId,
            vehicleNumber,
            type: type || "Unknown",
            status: "Idle",
            lastUpdate: new Date(),
          },
        },
        $inc: { totalVehicles: 1 },
      },
      { new: true }
    );

    res.json({
      message: "Vehicle added to site successfully",
      site: updatedSite,
    });
  } catch (err) {
    console.error("Error adding vehicle to site:", err);
    res.status(500).json({
      message: "Error adding vehicle to site",
      error: err.message,
    });
  }
};

/**
 * REMOVE VEHICLE FROM SITE - For Project Managers
 */
export const removeVehicleFromSite = async (req, res) => {
  try {
    const { siteId, vehicleId } = req.body;

    if (!siteId || !vehicleId) {
      return res.status(400).json({
        message: "Missing required fields: siteId, vehicleId",
      });
    }

    // Check access
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some((id) => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    // Remove vehicle from site and update counters
    const updatedSite = await Site.findByIdAndUpdate(
      siteId,
      {
        $pull: { liveVehicles: { vehicleId } },
        $inc: { totalVehicles: -1 },
      },
      { new: true }
    );

    res.json({
      message: "Vehicle removed from site successfully",
      site: updatedSite,
    });
  } catch (err) {
    console.error("Error removing vehicle from site:", err);
    res.status(500).json({
      message: "Error removing vehicle from site",
      error: err.message,
    });
  }
};

/**
 * RESET DAILY COUNTERS - For Cron Job
 */
export const resetDailyCounters = async () => {
  try {
    await Site.updateMany(
      {},
      {
        $set: {
          todayEntries: 0,
          todayExits: 0,
        },
      }
    );
    console.log("Daily counters reset successfully");
  } catch (err) {
    console.error("Error resetting daily counters:", err);
  }
};

/* ======================================================
   SUPER ADMIN - SITES MANAGEMENT
====================================================== */

// GET all sites (across all clients)
export const getAllSites = async (req, res, next) => {
  try {
    const sites = await Site.find()
      .populate('clientId', 'companyName clientname email clientCode')
      .sort({ createdAt: -1 });

    const sitesWithStats = await Promise.all(
      sites.map(async (site) => {
        const deviceCount = await Device.countDocuments({ siteId: site._id });
        const activeDeviceCount = await Device.countDocuments({
          siteId: site._id,
          isEnabled: true
        });
        const onlineDeviceCount = await Device.countDocuments({
          siteId: site._id,
          isOnline: true
        });

        return {
          _id: site._id,
          name: site.name,
          location: site.location,
          address: site.address,
          contactPerson: site.contactPerson,
          contactNumber: site.contactNumber,
          isActive: site.isActive,
          clientId: site.clientId?._id,
          clientName: site.clientId?.companyName || site.clientId?.clientname,
          clientEmail: site.clientId?.email,
          clientCode: site.clientId?.clientCode,
          deviceCount,
          activeDeviceCount,
          onlineDeviceCount,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
        };
      })
    );

    res.json({
      success: true,
      count: sitesWithStats.length,
      data: sitesWithStats,
    });
  } catch (e) {
    next(e);
  }
};

// GET single site by ID
export const getAdminSiteById = async (req, res, next) => {
  try {
    const site = await Site.findById(req.params.id)
      .populate('clientId', 'companyName clientname email clientCode');

    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    const devices = await Device.find({ siteId: site._id })
      .select('serialNo devicetype isEnabled isOnline lastActive');

    res.json({
      success: true,
      data: {
        ...site.toObject(),
        clientName: site.clientId?.companyName || site.clientId?.clientname,
        devices,
      },
    });
  } catch (e) {
    next(e);
  }
};

// CREATE new site (Super Admin can create for any client)
export const createAdminSite = async (req, res, next) => {
  try {
    const {
      name,
      clientId,
      location,
      address,
      contactPerson,
      contactNumber,
      gates = []
    } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
      });
    }

    // 🧹 Remove empty gates
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

    const newSite = await Site.create({
      name,
      clientId,
      location,
      address,
      contactPerson,
      contactNumber,
      gates: cleanedGates,
      isActive: true,
      createdBy: req.user.id,
    });

    const populatedSite = await Site.findById(newSite._id)
      .populate('clientId', 'companyName clientname email');

    await logAudit({ 
      req, 
      action: "CREATE", 
      module: "SITE", 
      newValue: populatedSite 
    });

    res.status(201).json({
      success: true,
      message: 'Site created successfully',
      data: populatedSite,
    });
  } catch (e) {
    next(e);
  }
};

// UPDATE site - Super Admin
export const updateAdminSite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      location,
      address,
      contactPerson,
      contactNumber,
      isActive,
      gates,
      clientId
    } = req.body;

    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    const oldValue = site.toObject();

    // Update fields
    if (name !== undefined) site.name = name;
    if (location !== undefined) site.location = location;
    if (address !== undefined) site.address = address;
    if (contactPerson !== undefined) site.contactPerson = contactPerson;
    if (contactNumber !== undefined) site.contactNumber = contactNumber;
    if (isActive !== undefined) site.isActive = isActive;
    if (clientId !== undefined) site.clientId = clientId;

    // Update gates if provided
    if (gates !== undefined) {
      const cleanedGates = Array.isArray(gates)
        ? gates.filter(
            gate => gate?.gateName && gate.gateName.trim() !== ""
          )
        : [];
      
      const mainGateCount = cleanedGates.filter(g => g.isMainGate).length;
      if (mainGateCount > 1) {
        return res.status(400).json({
          message: "Only one gate can be marked as main gate"
        });
      }
      
      site.gates = cleanedGates;
    }

    site.updatedBy = req.user.id;
    site.updatedAt = new Date();
    
    await site.save();

    const updatedSite = await Site.findById(id)
      .populate('clientId', 'companyName clientname email');

    await logAudit({ 
      req, 
      action: "UPDATE", 
      module: "SITE", 
      oldValue: oldValue, 
      newValue: updatedSite 
    });

    res.json({
      success: true,
      message: 'Site updated successfully',
      data: updatedSite,
    });
  } catch (e) {
    next(e);
  }
};

// DELETE site (soft delete by deactivating) - Super Admin
export const deleteAdminSite = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    // Check if site has devices
    const deviceCount = await Device.countDocuments({ siteId: id });
    if (deviceCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete site. It has ${deviceCount} device(s) assigned. Please reassign or remove devices first.`,
      });
    }

    // Check if site is assigned to any users
    const assignedPMs = await ProjectManager.countDocuments({
      assignedSites: id
    });

    const assignedSupervisors = await Supervisor.countDocuments({
      siteId: id
    });

    if (assignedPMs > 0 || assignedSupervisors > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete site. It is assigned to ${assignedPMs} project manager(s) and ${assignedSupervisors} supervisor(s).`,
        assignedPMs,
        assignedSupervisors
      });
    }

    const oldValue = site.toObject();

    await logAudit({ 
      req, 
      action: "DELETE", 
      module: "SITE", 
      oldValue: oldValue 
    });

    // Hard delete the site
    await Site.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Site deleted successfully',
    });
  } catch (e) {
    next(e);
  }
};

// ACTIVATE/DEACTIVATE site - Super Admin
export const toggleAdminSiteStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    const oldValue = site.toObject();
    site.isActive = !site.isActive;
    site.updatedBy = req.user.id;
    site.updatedAt = new Date();
    await site.save();

    await logAudit({ 
      req, 
      action: "TOGGLE", 
      module: "SITE", 
      oldValue: oldValue, 
      newValue: site 
    });

    res.json({
      success: true,
      message: `Site ${site.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: site.isActive },
    });
  } catch (e) {
    next(e);
  }
};

// GET sites by client ID - Super Admin
export const getSitesByClient = async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
      });
    }

    const sites = await Site.find({ clientId })
      .sort({ createdAt: -1 });

    const sitesWithStats = await Promise.all(
      sites.map(async (site) => {
        const deviceCount = await Device.countDocuments({ siteId: site._id });
        const activeDeviceCount = await Device.countDocuments({
          siteId: site._id,
          isEnabled: true
        });

        return {
          ...site.toObject(),
          deviceCount,
          activeDeviceCount,
        };
      })
    );

    res.json({
      success: true,
      count: sitesWithStats.length,
      data: sitesWithStats,
    });
  } catch (e) {
    next(e);
  }
};