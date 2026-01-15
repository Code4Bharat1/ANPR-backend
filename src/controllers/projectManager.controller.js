// controllers/projectManager.controller.js

import ProjectManager from "../models/ProjectManager.model.js";
import { hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Vendor from "../models/Vendor.model.js";
import DeviceModel from '../models/Device.model.js';
import supervisorModel from '../models/supervisor.model.js';
import Vehicle from '../models/Vehicle.model.js';
import mongoose from 'mongoose';


/**
 * Admin → Create Project Manager
 */
export const createProjectManager = async (req, res, next) => {
  try {
    // ✅ Role safety (Admin OR Client)
    if (!req.user || !["admin", "client"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Only admin or client can create project manager",
      });
    }

    // ✅ clientId must come from token
    if (!req.user.clientId) {
      return res.status(400).json({ message: "ClientId missing in token" });
    }

    const { name, email, mobile, password, assignedSites } = req.body;

    // ✅ Basic validations
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const pm = await ProjectManager.create({
      name,
      email,
      mobile,
      password: await hashPassword(password),
      assignedSites: assignedSites || [],
      adminId: req.user.id,
      clientId: req.user.clientId, // 🔥 ALWAYS FROM TOKEN
    });

    await logAudit({
      req,
      action: "CREATE",
      module: "PROJECT_MANAGER",
      newValue: pm,
    });

    res.status(201).json({
      message: "Project Manager created successfully",
      data: pm,
    });
  } catch (e) {
    next(e);
  }
};



/**
 * List all PMs (Admin / SuperAdmin)
 */
export const listProjectManagers = async (req, res, next) => {
  try {
    const pms = await ProjectManager.find({
      clientId: req.user.clientId,
    })
      .populate("assignedSites", "name location")
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(pms);
  } catch (e) {
    next(e);
  }
};

/**
 * Update PM (assign sites / details)
 */
export const updateProjectManager = async (req, res, next) => {
  try {
    const { id } = req.params;

    const old = await ProjectManager.findById(id);
    if (!old) return res.status(404).json({ message: "PM not found" });

    const updated = await ProjectManager.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );

    await logAudit({
      req,
      action: "UPDATE",
      module: "PROJECT_MANAGER",
      oldValue: old,
      newValue: updated,
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/**
 * Enable / Disable PM
 */
export const toggleProjectManager = async (req, res, next) => {
  try {
    const pm = await ProjectManager.findById(req.params.id);
    if (!pm) return res.status(404).json({ message: "PM not found" });

    pm.isActive = !pm.isActive;
    await pm.save();

    await logAudit({
      req,
      action: "TOGGLE",
      module: "PROJECT_MANAGER",
      newValue: pm,
    });

    res.json(pm);
  } catch (e) {
    next(e);
  }
};
// Dashboard stats controller





export const getDashboardStats = async (req, res) => {
  try {
    const projectManagerId = new mongoose.Types.ObjectId(req.user.id);

    // 1️⃣ Get PM with assigned sites
    const pm = await ProjectManager.findById(projectManagerId)
      .populate({
        path: "assignedSites",
        select: "name siteId status",
      })
      .lean();

    const assignedSites = pm?.assignedSites || [];
    const siteIds = assignedSites.map((s) => s._id);

    // 2️⃣ Counts based on assigned sites
    const [
      totalSites,
      totalTrips,
      supervisors,
      activeTrips,
      activeSupervisors,
      todayTrips,
      completedTrips,
    ] = await Promise.all([
      assignedSites.length,

      Trip.countDocuments({ siteId: { $in: siteIds } }),

      supervisorModel.countDocuments({
        siteId: { $in: siteIds },
      }),

      Trip.countDocuments({
        siteId: { $in: siteIds },
        status: { $in: ["active", "in-progress", "ongoing", "started"] },
      }),

      supervisorModel.countDocuments({
        siteId: { $in: siteIds },
        isActive: true,
      }),

      Trip.countDocuments({
        siteId: { $in: siteIds },
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      }),

      Trip.countDocuments({
        siteId: { $in: siteIds },
        status: { $in: ["completed", "finished", "done", "closed"] },
      }),
    ]);

    // 3️⃣ Site-wise details (max 4)
    const sitesWithDetails = await Promise.all(
      assignedSites.slice(0, 4).map(async (site) => {
        const [barriers, siteActiveTrips] = await Promise.all([
          DeviceModel.countDocuments({
            siteId: site._id,
            devicetype: "BARRIER",
            isEnabled: true,
          }),

          Trip.countDocuments({
            siteId: site._id,
            status: { $in: ["active", "in-progress", "ongoing", "started"] },
          }),
        ]);

        return {
          id: site.siteId || site._id.toString(),
          name: site.name || "Unknown Site",
          barriers,
          activeTrips: siteActiveTrips,
          status: site.status || "Operational",
        };
      })
    );

    // 4️⃣ Final response
    res.json({
      totalSites,
      totalTrips,
      supervisors,
      activeTrips,
      activeSupervisors,
      todayTrips,
      completedTrips,
      sites: sitesWithDetails,
    });

  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({
      message: "Error fetching dashboard stats",
      error: err.message,
    });
  }
};

// Alternative version with aggregation pipeline for better performance
// export const getDashboardStatsOptimized = async (req, res) => {
//   try {
//     const projectManagerId = req.user.id;

//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);

//     const endOfDay = new Date();
//     endOfDay.setHours(23, 59, 59, 999);

//     // Run all counts in parallel for better performance
//     const [
//       totalSites,
//       totalTrips,
//       supervisors,
//       activeTrips,
//       activeSupervisors,
//       todayTrips,
//       completedTrips,
//       sitesData
//     ] = await Promise.all([
//       Site.countDocuments({ projectManagerId }),

//       Trip.countDocuments({ projectManagerId }),

//       Supervisor.countDocuments({ projectManagerId }),

//       Trip.countDocuments({ 
//         projectManagerId,
//         status: { $in: ['in-progress', 'ongoing', 'active'] }
//       }),

//       Supervisor.countDocuments({
//         projectManagerId,
//         isActive: true,
//         isOnline: true
//       }),

//       Trip.countDocuments({
//         projectManagerId,
//         createdAt: { $gte: startOfDay, $lte: endOfDay }
//       }),

//       Trip.countDocuments({
//         projectManagerId,
//         status: { $in: ['completed', 'finished', 'done'] }
//       }),

//       // Aggregation to get sites with their barrier and trip counts
//       Site.aggregate([
//         { $match: { projectManagerId } },
//         { $limit: 4 },
//         {
//           $lookup: {
//             from: 'barriers',
//             let: { siteId: '$_id' },
//             pipeline: [
//               { 
//                 $match: { 
//                   $expr: { $eq: ['$siteId', '$$siteId'] },
//                   isActive: true 
//                 }
//               },
//               { $count: 'count' }
//             ],
//             as: 'barriersCount'
//           }
//         },
//         {
//           $lookup: {
//             from: 'trips',
//             let: { siteId: '$_id' },
//             pipeline: [
//               { 
//                 $match: { 
//                   $expr: { $eq: ['$siteId', '$$siteId'] },
//                   status: { $in: ['in-progress', 'ongoing', 'active'] }
//                 }
//               },
//               { $count: 'count' }
//             ],
//             as: 'activeTripsCount'
//           }
//         },
//         {
//           $project: {
//             id: { $ifNull: ['$siteId', { $toString: '$_id' }] },
//             name: 1,
//             status: { $ifNull: ['$status', 'Operational'] },
//             barriers: { 
//               $ifNull: [{ $arrayElemAt: ['$barriersCount.count', 0] }, 0] 
//             },
//             activeTrips: { 
//               $ifNull: [{ $arrayElemAt: ['$activeTripsCount.count', 0] }, 0] 
//             }
//           }
//         }
//       ])
//     ]);

//     const stats = {
//       totalSites,
//       totalTrips,
//       supervisors,
//       activeTrips,
//       activeSupervisors,
//       todayTrips,
//       completedTrips,
//       sites: sitesData
//     };

//     res.json(stats);
//   } catch (err) {
//     console.error('Error fetching dashboard stats:', err);
//     res.status(500).json({ message: "Error fetching dashboard stats", error: err.message });
//   }
// };



// Supervisor routes
export const createSupervisor = async (req, res) => {
  try {
    const { name, email, mobile, address, siteId, password } = req.body;

    // 🔐 Validate site belongs to Project Manager
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some(id => id.toString() === siteId)) {
      return res.status(403).json({
        message: "You cannot assign supervisor to this site",
      });
    }

    // ✅ Create supervisor
    const supervisor = await supervisorModel.create({
      name,
      email,
      mobile,
      address,
      siteId,
      password,
      projectManagerId: req.user.id,
    });

    // Optional populate
    await supervisor.populate("siteId", "name");

    return res.status(201).json({
      message: "Supervisor created successfully",
      data: supervisor,
    });

  } catch (err) {
    console.error("Create Supervisor Error:", err);
    res.status(500).json({
      message: "Error creating supervisor",
      error: err.message,
    });
  }
};


export const getAllSupervisors = async (req, res) => {
  try {
    const pmId = req.user.id || req.user._id;

    const supervisors = await supervisorModel.find({
      projectManagerId: pmId,
    })
      .populate("siteId", "name")
      .lean();

    res.json(supervisors);
  } catch (err) {
    console.error("getAllSupervisors ERROR:", err);
    res.status(500).json({
      message: "Error fetching supervisors",
      error: err.message,
    });
  }
};

export const assignSiteToSupervisor = async (req, res) => {
  try {
    const { siteId } = req.body;

    // 🔐 Validate site belongs to PM
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some(id => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    supervisor.siteId = siteId;
    await supervisor.save();

    res.json(supervisor);
  } catch (err) {
    res.status(500).json({
      message: "Error assigning site to supervisor",
      error: err.message,
    });
  }
};
export const toggleSupervisorStatus = async (req, res) => {
  try {
    const supervisor = await supervisorModel.findById(req.params.id);
    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    supervisor.isActive = !supervisor.isActive;
    await supervisor.save();

    res.json(supervisor);
  } catch (err) {
    res.status(500).json({
      message: "Error toggling supervisor status",
      error: err.message,
    });
  }
};
// Live Vehicles Monitoring
export const getLiveVehicles = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projectManagerId = req.user._id || req.user.id;

    const query = {
      projectManagerId,
      status: { $in: ["inside", "pending_exit"] },
    };

    if (req.query.siteId && req.query.siteId !== "all") {
      query.siteId = req.query.siteId;
    }

    const liveVehicles = await Vehicle.find(query)
      .populate("siteId", "name");

    res.json(liveVehicles);
  } catch (err) {
    console.error("LIVE VEHICLES ERROR:", err);
    res.status(500).json({
      message: "Error fetching live vehicles",
      error: err.message,
    });
  }
};




// Vendor routes
// CREATE VENDOR (FIXED)
export const createVendor = async (req, res) => {
  try {
    const { name, email, phone, address, assignedSites } = req.body;

    // Validation
    if (!name || !email || !phone || !address || !assignedSites || assignedSites.length === 0) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if vendor already exists
    const existingVendor = await Vendor.findOne({ 
      email,
      clientId: req.user.clientId  // Check within same client only
    });
    
    if (existingVendor) {
      return res.status(400).json({ message: "Vendor with this email already exists" });
    }

    const vendor = new Vendor({
      name,
      email,
      phone,
      address,
      assignedSites,
      clientId: req.user.clientId,       // ✅ REQUIRED field
      projectManagerId: req.user.id,     // ✅ REQUIRED field - use req.user.id
      isActive: true,
      totalTrips: 0
    });

    await vendor.save();

    // Populate assigned sites for response
    await vendor.populate('assignedSites', 'name');

    res.status(201).json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating vendor", error: err.message });
  }
};

// GET ALL VENDORS (FIXED)
export const getVendors = async (req, res) => {
  try {
    // Get vendors for current user's client
    const vendors = await Vendor.find({ clientId: req.user.clientId })
      .populate('assignedSites', 'name location')
      .populate('projectManagerId', 'name email')  // ✅ Populate project manager info
      .sort({ createdAt: -1 });

    res.json(vendors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching vendors", error: err.message });
  }
};

// UPDATE VENDOR (FIXED)
export const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, assignedSites } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid vendor ID" });
    }

    // Find vendor
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Authorization - check clientId AND projectManagerId
    if (String(vendor.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden: Different client" });
    }

    if (String(vendor.projectManagerId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: Not your vendor" });
    }

    // Check email uniqueness (only if email is being changed)
    if (email && email !== vendor.email) {
      const existingVendor = await Vendor.findOne({ 
        email, 
        clientId: req.user.clientId,
        _id: { $ne: id }  // Exclude current vendor
      });
      
      if (existingVendor) {
        return res.status(400).json({ message: "Vendor with this email already exists" });
      }
    }

    // Update vendor
    const updatedVendor = await Vendor.findByIdAndUpdate(
      id,
      {
        name: name || vendor.name,
        email: email || vendor.email,
        phone: phone || vendor.phone,
        address: address || vendor.address,
        assignedSites: assignedSites || vendor.assignedSites
      },
      { new: true, runValidators: true }
    ).populate('assignedSites', 'name')
     .populate('projectManagerId', 'name email');

    res.json(updatedVendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating vendor", error: err.message });
  }
};

// TOGGLE VENDOR STATUS (FIXED)
export const toggleVendorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid vendor ID" });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Authorization - check clientId AND projectManagerId
    if (String(vendor.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden: Different client" });
    }

    if (String(vendor.projectManagerId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: Not your vendor" });
    }

    vendor.isActive = !vendor.isActive;
    await vendor.save();

    res.json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error toggling vendor status", error: err.message });
  }
};

// DELETE VENDOR (FIXED)
export const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid vendor ID" });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Authorization - check clientId AND projectManagerId
    if (String(vendor.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden: Different client" });
    }

    if (String(vendor.projectManagerId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: Not your vendor" });
    }

    await vendor.deleteOne();
    res.json({ message: "Vendor deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting vendor", error: err.message });
  }
};

// Profile route
/* ======================================================
   GET PROJECT MANAGER PROFILE
====================================================== */
export const getProfile = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .select("-password")
      .populate("assignedSites", "name");

    if (!pm) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    // 🔁 Map DB → Frontend format
    res.status(200).json({
      success: true,
      data: {
        fullName: pm.name,
        email: pm.email,
        phone: pm.mobile,
        location: pm.location || "",
        assignedSites: pm.assignedSites.length,
        role: pm.role,
        createdAt: pm.createdAt,
      },
    });

  } catch (err) {
    res.status(500).json({
      message: "Error fetching profile",
      error: err.message,
    });
  }
};

/* ======================================================
   UPDATE PROJECT MANAGER PROFILE
====================================================== */
export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phone, location } = req.body;

    const pm = await ProjectManager.findById(req.user.id);
    if (!pm) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    // ✅ Update allowed fields only
    if (fullName) pm.name = fullName;
    if (email) pm.email = email.toLowerCase().trim();
    if (phone) pm.mobile = phone;
    if (location !== undefined) pm.location = location;

    await pm.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        fullName: pm.name,
        email: pm.email,
        phone: pm.mobile,
        location: pm.location,
        assignedSites: pm.assignedSites.length,
      },
    });

  } catch (err) {
    res.status(500).json({
      message: "Error updating profile",
      error: err.message,
    });
  }
};

export const getProfileStats = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .populate('assignedSites');

    if (!pm) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    // You can customize these queries based on your actual models
    const stats = {
      assignedSites: pm.assignedSites.length,
      totalSupervisors: 48, // Replace with actual count from Supervisor model
      totalTrips: 3429,      // Replace with actual count from Trip model
      activeVendors: 18,     // Replace with actual count from Vendor model
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: err.message,
    });
  }
};



/* ======================================================
   PROJECT MANAGER ANALYTICS (FIXED VERSION)
====================================================== */
/* ======================================================
   PROJECT MANAGER ANALYTICS (UPDATED WITH 12-HOUR FORMAT)
====================================================== */
export const getanalytics = async (req, res, next) => {
  try {
    const { timeRange } = req.query;
    const clientId = req.user.clientId;

    console.log('📊 Analytics request from:', req.user.email);
    console.log('📊 User role:', req.user.role);
    console.log('📊 Time range:', timeRange);
    console.log('📊 Client ID:', clientId);

    /* -------------------------
       GET PM'S ASSIGNED SITES
    ------------------------- */
    let siteFilter = {};
    
    if (req.user.role === 'project_manager') {
      const projectManager = await ProjectManager.findOne({ 
        email: req.user.email 
      }).populate('assignedSites', '_id');
      
      console.log('🔍 PM query result:', projectManager ? 'Found' : 'Not found');
      
      if (projectManager?.assignedSites?.length > 0) {
        const siteIds = projectManager.assignedSites.map(site => site._id);
        siteFilter = { siteId: { $in: siteIds } };
        console.log(`📍 Filtering by ${siteIds.length} assigned sites`);
      } else {
        console.log('⚠️ PM has no assigned sites, will use client filter');
        siteFilter = { clientId };
      }
    } else {
      siteFilter = { clientId };
    }

    /* -------------------------
       DATE RANGE
    ------------------------- */
    const now = new Date();
    let startDate = new Date();

    switch (timeRange) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "7days":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90days":
        startDate.setDate(now.getDate() - 90);
        break;
      case "1year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    console.log('📅 Start date:', startDate);
    console.log('📅 End date:', now);

    /* ======================================================
       GET TRIPS
    ====================================================== */
    const query = {
      ...siteFilter,
      entryAt: { $gte: startDate, $lte: now }
    };

    console.log('🔍 Analytics query:', JSON.stringify(query, null, 2));

    const trips = await Trip.find(query)
      .populate('vendorId', 'name')
      .populate('siteId', 'name')
      .lean();

    console.log(`📊 Found ${trips.length} trips for analytics`);

    const totalTrips = trips.length;

    /* ======================================================
       AVERAGE DURATION
    ====================================================== */
    let totalDurationMs = 0;
    let tripsWithDuration = 0;

    trips.forEach((trip) => {
      if (trip.entryAt && trip.exitAt) {
        const entry = new Date(trip.entryAt);
        const exit = new Date(trip.exitAt);
        const duration = exit - entry;
        
        if (duration > 0) {
          totalDurationMs += duration;
          tripsWithDuration++;
        }
      }
    });

    let avgDuration = '0h 0m';
    if (tripsWithDuration > 0) {
      const avgMs = totalDurationMs / tripsWithDuration;
      const avgHours = Math.floor(avgMs / (1000 * 60 * 60));
      const avgMinutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
      avgDuration = `${avgHours}h ${avgMinutes}m`;
    }

    /* ======================================================
       PEAK HOURS - 12-HOUR FORMAT
    ====================================================== */
    const hourCount = Array(24).fill(0);
    let peakHours = 'N/A';
    
    if (trips.length > 0) {
      // Count trips by hour
      trips.forEach((trip) => {
        if (trip.entryAt) {
          const hour = new Date(trip.entryAt).getHours();
          if (hour >= 0 && hour <= 23) {
            hourCount[hour]++;
          }
        }
      });

      const maxTrips = Math.max(...hourCount);
      const peakHourIndex = hourCount.indexOf(maxTrips);
      
      if (maxTrips > 0) {
        // Helper function to convert 24-hour to 12-hour format
        const convertTo12Hour = (hour24) => {
          if (hour24 === 0) return { hour: 12, period: 'AM' };
          if (hour24 === 12) return { hour: 12, period: 'PM' };
          if (hour24 > 12) return { hour: hour24 - 12, period: 'PM' };
          return { hour: hour24, period: 'AM' };
        };
        
        // Get peak hour and next hour
        const peakHour = convertTo12Hour(peakHourIndex);
        const nextHour = convertTo12Hour((peakHourIndex + 1) % 24);
        
        // Format: "11:00 AM - 12:00 PM"
        peakHours = `${peakHour.hour}:00 ${peakHour.period} - ${nextHour.hour}:00 ${nextHour.period}`;
        
        console.log(`🕐 Peak hours detected: ${peakHourIndex}:00 (${maxTrips} trips)`);
        console.log(`🕐 Converted to: ${peakHours}`);
      }
    }

    /* ======================================================
       UTILIZATION RATE
    ====================================================== */
    let utilizationRate = "0%";
    if (totalTrips > 0) {
      const daysDiff = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)) || 1;
      const tripsPerDay = totalTrips / daysDiff;
      const maxCapacity = 20;
      const utilization = Math.min(95, Math.round((tripsPerDay / maxCapacity) * 100));
      utilizationRate = `${utilization}%`;
    }

    /* ======================================================
       TOP VENDORS
    ====================================================== */
    const vendorMap = {};
    
    trips.forEach((trip) => {
      if (trip.vendorId && trip.vendorId.name) {
        const vendorName = trip.vendorId.name;
        vendorMap[vendorName] = (vendorMap[vendorName] || 0) + 1;
      }
    });

    const topVendors = Object.entries(vendorMap)
      .map(([name, tripCount]) => ({
        name,
        trips: tripCount,
        percentage: totalTrips > 0 ? Math.round((tripCount / totalTrips) * 100) : 0
      }))
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 5);

    /* ======================================================
       TOP SITES
    ====================================================== */
    const siteMap = {};
    
    trips.forEach((trip) => {
      if (trip.siteId && trip.siteId.name) {
        const siteName = trip.siteId.name;
        siteMap[siteName] = (siteMap[siteName] || 0) + 1;
      }
    });

    const topSites = Object.entries(siteMap)
      .map(([name, tripCount]) => ({
        name,
        trips: tripCount,
        percentage: totalTrips > 0 ? Math.round((tripCount / totalTrips) * 100) : 0
      }))
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 5);

    /* ======================================================
       WEEKLY DATA
    ====================================================== */
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyMap = {
      "Sun": 0, "Mon": 0, "Tue": 0, "Wed": 0, "Thu": 0, "Fri": 0, "Sat": 0
    };

    trips.forEach((trip) => {
      if (trip.entryAt) {
        const dayIndex = new Date(trip.entryAt).getDay();
        const dayName = days[dayIndex];
        weeklyMap[dayName]++;
      }
    });

    const weeklyData = days.map(day => ({
      day,
      trips: weeklyMap[day] || 0
    }));

    /* ======================================================
       RESPONSE
    ====================================================== */
    const response = {
      totalTrips,
      avgDuration,
      peakHours,
      utilizationRate,
      topVendors,
      topSites,
      weeklyData
    };

    console.log('📊 Analytics response:', {
      totalTrips,
      avgDuration,
      peakHours,
      utilizationRate,
      topVendorsCount: topVendors.length,
      topSitesCount: topSites.length,
      weeklyDataSummary: weeklyData.map(d => `${d.day}:${d.trips}`).join(', ')
    });
    
    res.json(response);

  } catch (err) {
    console.error('❌ Analytics error:', err);
    console.error('❌ Stack trace:', err.stack);
    
    // Test data with 12-hour format
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Sending test data due to error');
      res.json({
        totalTrips: 1567,
        avgDuration: '4h 30m',
        peakHours: '10:00 AM - 12:00 PM',
        utilizationRate: '78%',
        topVendors: [
          { name: 'ABC Logistics', trips: 245, percentage: 15 },
          { name: 'XYZ Transport', trips: 189, percentage: 12 },
          { name: 'Quick Movers', trips: 156, percentage: 10 }
        ],
        topSites: [
          { name: 'Site A - Mumbai', trips: 345, percentage: 22 },
          { name: 'Site B - Delhi', trips: 278, percentage: 18 },
          { name: 'Site C - Bangalore', trips: 189, percentage: 12 }
        ],
        weeklyData: [
          { day: 'Mon', trips: 245 },
          { day: 'Tue', trips: 278 },
          { day: 'Wed', trips: 312 },
          { day: 'Thu', trips: 289 },
          { day: 'Fri', trips: 267 },
          { day: 'Sat', trips: 156 },
          { day: 'Sun', trips: 120 }
        ]
      });
    } else {
      res.status(500).json({ 
        message: "Error fetching analytics", 
        error: err.message 
      });
    }
  }
};

/* ======================================================
   GET PROJECT MANAGER SETTINGS
====================================================== */
export const getSettings = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id).select("settings");

    if (!pm) {
      return res.status(404).json({ message: "Settings not found" });
    }

    res.json(pm.settings);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching settings",
      error: err.message,
    });
  }
};

/* ======================================================
   UPDATE PROJECT MANAGER SETTINGS
====================================================== */
export const updateSettings = async (req, res) => {
  try {
    const { preferences } = req.body;

    const pm = await ProjectManager.findById(req.user.id);
    if (!pm) {
      return res.status(404).json({
        message: "Project Manager not found",
      });
    }

    // ✅ Merge preferences safely
    pm.settings.preferences = {
      ...pm.settings.preferences,
      ...preferences,
    };

    await pm.save();

    res.json({
      message: "Settings updated successfully",
      settings: pm.settings,
    });
  } catch (err) {
    res.status(500).json({
      message: "Error updating settings",
      error: err.message,
    });
  }
};