// controllers/projectManager.controller.js
import XLSX from 'xlsx';
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

// Sites routes
export const getMySites = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .populate("assignedSites")
      .lean();

    res.json(pm?.assignedSites || []);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching sites",
      error: err.message,
    });
  }
};

export const getSiteDetails = async (req, res) => {
  try {
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    const siteId = req.params.id;

    if (!pm?.assignedSites?.some(id => id.toString() === siteId)) {
      return res.status(403).json({ message: "Access denied to this site" });
    }

    const site = await Site.findById(siteId)
      .populate("supervisors vendors");

    if (!site) {
      return res.status(404).json({ message: "Site not found" });
    }

    res.json(site);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching site details",
      error: err.message,
    });
  }
};

// Supervisor routes
export const createSupervisor = async (req, res) => {
  try {
    const { name, email, siteId, password } = req.body;

    // 🔐 Validate site belongs to PM
    const pm = await ProjectManager.findById(req.user.id)
      .select("assignedSites")
      .lean();

    if (!pm?.assignedSites?.some(id => id.toString() === siteId)) {
      return res.status(403).json({ message: "You cannot assign supervisor to this site" });
    }

    const supervisor = new Supervisor({
      name,
      email,
      siteId,
      password,
      projectManagerId: req.user.id,
      // ✅ only site relation
    });


    await supervisor.populate("siteId", "name");

    res.status(201).json(supervisor);
  } catch (err) {
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



// GET TRIP REPORTS
// GET TRIP REPORTS
export const getTripReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log('👤 User ID:', req.user.id);
    console.log('👤 User role:', req.user.role);

    // 1. Get the project manager and their assigned sites
    let projectManager;
    let assignedSites = [];
    
    if (req.user.role === 'project_manager') {
      // Find project manager by user ID
      projectManager = await ProjectManager.findOne({ user: req.user.id })
        .populate('assignedSites', '_id name siteId');
      
      console.log('🏢 Project Manager found:', projectManager?._id);
      console.log('🏢 PM name:', projectManager?.name);
      
      if (projectManager) {
        assignedSites = projectManager.assignedSites || [];
      }
    }
    
    // Get site IDs from assigned sites
    const siteIds = assignedSites.map(site => site._id);
    
    console.log('📍 Assigned Sites:', siteIds.length);
    console.log('📍 Site IDs:', siteIds);

    // 2. Build filter based on sites
    const filter = {};
    
    if (siteIds.length > 0) {
      filter.siteId = { $in: siteIds };
    } else {
      // If no sites assigned, return empty array
      return res.json([]);
    }

    // 3. Date range filter
    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    console.log('🔍 Filter being used:', JSON.stringify(filter, null, 2));

    // 4. Get trips
    const reports = await Trip.find(filter)
      .populate('vehicleId', 'vehicleNumber')
      .populate('vendorId', 'name email phone')
      .populate('siteId', 'name location siteId')
      .populate('supervisorId', 'name email')
      .populate('clientId', 'name')
      .populate('projectManagerId', 'name email')
      .sort({ entryAt: -1 });

    console.log(`📊 Found ${reports.length} trips for user ${req.user.id}`);

    // 5. Format response
    const formattedReports = reports.map(trip => ({
      _id: trip._id,
      tripId: trip.tripId,
      vehicleNumber: trip.plateText || trip.vehicleId?.vehicleNumber || 'N/A',
      vehicleId: trip.vehicleId,
      vendor: trip.vendorId?.name || 'N/A',
      vendorId: trip.vendorId,
      client: trip.clientId?.name || 'N/A',
      clientId: trip.clientId,
      site: trip.siteId?.name || 'N/A',
      siteId: trip.siteId?._id,
      siteLocation: trip.siteId?.location,
      supervisor: trip.supervisorId?.name || 'N/A',
      supervisorId: trip.supervisorId,
      projectManager: trip.projectManagerId?.name || 'N/A',
      projectManagerId: trip.projectManagerId,
      loadStatus: trip.loadStatus,
      entryTime: trip.entryAt,
      exitTime: trip.exitAt,
      entryGate: trip.entryGate,
      exitGate: trip.exitGate,
      status: trip.status,
      notes: trip.notes,
      createdAt: trip.createdAt,
      // Calculate duration
      duration: trip.exitAt && trip.entryAt ? 
        (() => {
          const diff = new Date(trip.exitAt) - new Date(trip.entryAt);
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          return `${hours}h ${minutes}m`;
        })() : '--'
    }));

    res.json(formattedReports);
  } catch (err) {
    console.error('❌ Error in getTripReports:', err);
    res.status(500).json({ 
      message: "Error fetching trip reports", 
      error: err.message 
    });
  }
};
// EXPORT REPORTS TO EXCEL
// EXPORT REPORTS TO EXCEL
// EXPORT REPORTS TO EXCEL
export const exportReportsToExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log('📤 Export request from user:', req.user.id);

    // 1. Get project manager and assigned sites
    let projectManager;
    let assignedSites = [];
    
    if (req.user.role === 'project_manager') {
      projectManager = await ProjectManager.findOne({ user: req.user.id })
        .populate('assignedSites', '_id name');
      
      if (projectManager) {
        assignedSites = projectManager.assignedSites || [];
      }
    }
    
    const siteIds = assignedSites.map(site => site._id);
    
    // Build filter
    const filter = {};
    
    if (siteIds.length > 0) {
      filter.siteId = { $in: siteIds };
    } else {
      // If no sites, return empty Excel
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([{ 'Message': 'No trips found for your assigned sites' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'Trip Reports');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', `attachment; filename=trip_reports_${Date.now()}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    console.log('📤 Export filter:', filter);

    const reports = await Trip.find(filter)
      .populate('vehicleId', 'vehicleNumber')
      .populate('vendorId', 'name email phone')
      .populate('siteId', 'name location')
      .populate('supervisorId', 'name')
      .populate('clientId', 'name')
      .populate('projectManagerId', 'name email')
      .sort({ entryAt: -1 });

    console.log(`📤 Exporting ${reports.length} trips`);

    // Calculate duration helper
    const calculateDuration = (entryAt, exitAt) => {
      if (!exitAt) return '-';
      const diff = new Date(exitAt) - new Date(entryAt);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
    };

    // Format data for Excel
    const excelData = reports.map(report => ({
      'Trip ID': report.tripId || 'N/A',
      'Vehicle': report.plateText || report.vehicleId?.vehicleNumber || 'N/A',
      'Vendor': report.vendorId?.name || 'N/A',
      'Client': report.clientId?.name || 'N/A',
      'Site': report.siteId?.name || 'N/A',
      'Location': report.siteId?.location || 'N/A',
      'Project Manager': report.projectManagerId?.name || 'N/A',
      'Supervisor': report.supervisorId?.name || 'N/A',
      'Load Status': report.loadStatus || 'N/A',
      'Entry Time': report.entryAt ? new Date(report.entryAt).toLocaleString() : '-',
      'Exit Time': report.exitAt ? new Date(report.exitAt).toLocaleString() : '-',
      'Duration': calculateDuration(report.entryAt, report.exitAt),
      'Entry Gate': report.entryGate || '-',
      'Exit Gate': report.exitGate || '-',
      'Status': getStatusDisplay(report.status),
      'Notes': report.notes || '-'
    }));

    // Helper function for status display
    function getStatusDisplay(status) {
      switch(status) {
        case 'INSIDE':
        case 'active':
          return 'Active';
        case 'EXITED':
        case 'completed':
          return 'Completed';
        case 'cancelled':
          return 'Cancelled';
        default:
          return status || 'N/A';
      }
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Trip ID
      { wch: 16 }, // Vehicle
      { wch: 20 }, // Vendor
      { wch: 20 }, // Client
      { wch: 25 }, // Site
      { wch: 20 }, // Location
      { wch: 20 }, // Project Manager
      { wch: 18 }, // Supervisor
      { wch: 12 }, // Load Status
      { wch: 20 }, // Entry Time
      { wch: 20 }, // Exit Time
      { wch: 12 }, // Duration
      { wch: 12 }, // Entry Gate
      { wch: 12 }, // Exit Gate
      { wch: 12 }, // Status
      { wch: 30 }  // Notes
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Trip Reports');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename=trip_reports_${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    res.send(buffer);
  } catch (err) {
    console.error('❌ Error in exportReportsToExcel:', err);
    res.status(500).json({ 
      message: "Error exporting reports", 
      error: err.message 
    });
  }
};

// GET REPORT STATS
// GET REPORT STATS
export const getReportStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log('📊 Stats request from user:', req.user.id);

    // 1. Get project manager and assigned sites
    let projectManager;
    let assignedSites = [];
    
    if (req.user.role === 'project_manager') {
      projectManager = await ProjectManager.findOne({ user: req.user.id })
        .populate('assignedSites', '_id name');
      
      if (projectManager) {
        assignedSites = projectManager.assignedSites || [];
      }
    }
    
    const siteIds = assignedSites.map(site => site._id);
    
    // Build filter
    const filter = {};
    
    if (siteIds.length > 0) {
      filter.siteId = { $in: siteIds };
    } else {
      // If no sites, return zero stats
      return res.json({
        totalTrips: 0,
        completedTrips: 0,
        activeTrips: 0,
        averageDurationMinutes: 0
      });
    }

    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    console.log('📊 Stats filter:', filter);

    const [totalTrips, completedTrips, activeTrips, totalDuration] = await Promise.all([
      Trip.countDocuments(filter),
      Trip.countDocuments({ 
        ...filter, 
        status: { $in: ["EXITED", "completed"] }
      }),
      Trip.countDocuments({ 
        ...filter, 
        status: { $in: ["INSIDE", "active"] }
      }),
      Trip.aggregate([
        { 
          $match: { 
            ...filter, 
            status: { $in: ["EXITED", "completed"] }, 
            exitAt: { $exists: true, $ne: null },
            entryAt: { $exists: true, $ne: null }
          } 
        },
        {
          $project: {
            duration: { 
              $subtract: ["$exitAt", "$entryAt"] 
            }
          }
        },
        {
          $group: {
            _id: null,
            totalDuration: { $sum: "$duration" }
          }
        }
      ])
    ]);

    console.log('📊 Stats Results:', {
      totalTrips,
      completedTrips,
      activeTrips,
      totalDuration: totalDuration[0]?.totalDuration || 0
    });

    const avgDuration = totalDuration.length > 0 && completedTrips > 0
      ? Math.floor(totalDuration[0].totalDuration / completedTrips / (1000 * 60))
      : 0;

    res.json({
      totalTrips,
      completedTrips,
      activeTrips,
      averageDurationMinutes: avgDuration
    });
  } catch (err) {
    console.error('❌ Error in getReportStats:', err);
    res.status(500).json({ 
      message: "Error fetching report stats", 
      error: err.message 
    });
  }
};
// Vendor routes
// CREATE VENDOR
export const createVendor = async (req, res) => {
  try {
    const { name, email, phone, address, assignedSites } = req.body;

    // Validation
    if (!name || !email || !phone || !address || !assignedSites || assignedSites.length === 0) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if vendor already exists
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: "Vendor with this email already exists" });
    }

    const vendor = new Vendor({
      name,
      email,
      phone,
      address,
      assignedSites, // Array of site IDs
      projectManagerId: req.user.id,
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

// GET ALL VENDORS
export const getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({ projectManagerId: req.user.id })
      .populate('assignedSites', 'name location') // Populate site details
      .sort({ createdAt: -1 });

    res.json(vendors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching vendors", error: err.message });
  }
};

// UPDATE VENDOR
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


// TOGGLE VENDOR STATUS
export const toggleVendorStatus = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Check authorization
    if (vendor.projectManagerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    vendor.isActive = !vendor.isActive;
    await vendor.save();

    res.json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error toggling vendor status", error: err.message });
  }
};

// DELETE VENDOR
export const deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    if (vendor.projectManagerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
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
   PROJECT MANAGER ANALYTICS
====================================================== */
export const getanalytics = async (req, res, next) => {
  try {
    const { timeRange } = req.query;
    const clientId = req.user.clientId;

    /* -------------------------
       DATE RANGE
    ------------------------- */
    const now = new Date();
    let startDate = new Date();

    switch (timeRange) {
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

    /* ======================================================
       TOTAL TRIPS
    ====================================================== */
    const trips = await Trip.find({
      clientId,
      createdAt: { $gte: startDate },
    });

    const totalTrips = trips.length;

    /* ======================================================
       AVERAGE DURATION
    ====================================================== */
    let totalDurationMs = 0;

    trips.forEach((t) => {
      if (t.entryTime && t.exitTime) {
        totalDurationMs +=
          new Date(t.exitTime) - new Date(t.entryTime);
      }
    });

    const avgMs =
      totalTrips > 0 ? totalDurationMs / totalTrips : 0;

    const avgHours = Math.floor(avgMs / (1000 * 60 * 60));
    const avgMinutes = Math.floor(
      (avgMs % (1000 * 60 * 60)) / (1000 * 60)
    );

    const avgDuration = `${avgHours}h ${avgMinutes}m`;

    /* ======================================================
       PEAK HOURS
    ====================================================== */
    const hourCount = {};

    trips.forEach((t) => {
      const hour = new Date(t.createdAt).getHours();
      hourCount[hour] = (hourCount[hour] || 0) + 1;
    });

    const peakHour = Object.keys(hourCount).reduce(
      (a, b) => (hourCount[a] > hourCount[b] ? a : b),
      0
    );

    const peakHours = `${peakHour}:00 - ${Number(peakHour) + 2}:00`;

    /* ======================================================
       UTILIZATION RATE (DUMMY BUT REALISTIC)
    ====================================================== */
    const utilizationRate =
      totalTrips > 0 ? `${Math.min(90, 60 + totalTrips % 20)}%` : "0%";

    /* ======================================================
       TOP VENDORS
    ====================================================== */
    const vendorAgg = {};

    trips.forEach((t) => {
      if (!t.vendorId) return;
      vendorAgg[t.vendorId] = (vendorAgg[t.vendorId] || 0) + 1;
    });

    const vendorDocs = await Vendor.find({
      _id: { $in: Object.keys(vendorAgg) },
    });

    const topVendors = vendorDocs.map((v) => ({
      name: v.name,
      trips: vendorAgg[v._id] || 0,
      percentage: Math.round(
        ((vendorAgg[v._id] || 0) / totalTrips) * 100
      ),
    }));

    /* ======================================================
       TOP SITES
    ====================================================== */
    const siteAgg = {};

    trips.forEach((t) => {
      if (!t.siteId) return;
      siteAgg[t.siteId] = (siteAgg[t.siteId] || 0) + 1;
    });

    const siteDocs = await Site.find({
      _id: { $in: Object.keys(siteAgg) },
    });

    const topSites = siteDocs.map((s) => ({
      name: s.name,
      trips: siteAgg[s._id] || 0,
      percentage: Math.round(
        ((siteAgg[s._id] || 0) / totalTrips) * 100
      ),
    }));

    /* ======================================================
       WEEKLY DATA
    ====================================================== */
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyMap = {
      Sun: 0,
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
    };

    trips.forEach((t) => {
      const day = days[new Date(t.createdAt).getDay()];
      weeklyMap[day]++;
    });

    const weeklyData = Object.keys(weeklyMap).map((d) => ({
      day: d,
      trips: weeklyMap[d],
    }));

    /* ======================================================
       RESPONSE (MATCHES FRONTEND EXACTLY)
    ====================================================== */
    res.json({
      totalTrips,
      avgDuration,
      peakHours,
      utilizationRate,
      topVendors,
      topSites,
      weeklyData,
    });
  } catch (err) {
    next(err);
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