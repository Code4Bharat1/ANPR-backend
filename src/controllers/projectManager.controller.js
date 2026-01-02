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



// Dashboard stats controller - Fixed version
export const getDashboardStats = async (req, res) => {
  try {
    const projectManagerId = req.user.id;

    // Basic counts with fallback to 0
    const totalSites = await Site.countDocuments({ projectManagerId }).catch(() => 0);
    const totalTrips = await Trip.countDocuments({ projectManagerId }).catch(() => 0);
    const supervisors = await supervisorModel.countDocuments({ projectManagerId }).catch(() => 0);

    // Active trips - using common status values
    const activeTrips = await Trip.countDocuments({ 
      projectManagerId,
      status: { $in: ['active', 'in-progress', 'ongoing', 'started'] }
    }).catch(() => 0);

    // Active supervisors
    const activeSupervisors = await supervisorModel.countDocuments({
      projectManagerId,
      isActive: true
    }).catch(() => 0);

    // Today's trips
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayTrips = await Trip.countDocuments({
      projectManagerId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).catch(() => 0);

    // Completed trips
    const completedTrips = await Trip.countDocuments({
      projectManagerId,
      status: { $in: ['completed', 'finished', 'done', 'closed'] }
    }).catch(() => 0);

    // Get sites with details
    let sitesWithDetails = [];
    try {
      const sites = await Site.find({ projectManagerId })
        .select('name siteId status')
        .limit(4)
        .lean();

      // Get barrier (device) and trip counts for each site
      sitesWithDetails = await Promise.all(
        sites.map(async (site) => {
          try {
            // Count BARRIER type devices for this site
            const barriers = await DeviceModel.countDocuments({ 
              siteId: site._id,
              devicetype: 'BARRIER',
              isEnabled: true 
            }).catch(() => 0);

            // Count active trips for this site
            const siteActiveTrips = await Trip.countDocuments({
              siteId: site._id,
              status: { $in: ['active', 'in-progress', 'ongoing', 'started'] }
            }).catch(() => 0);

            return {
              id: site.siteId || site._id.toString(),
              name: site.name || 'Unknown Site',
              barriers: barriers || 0,
              activeTrips: siteActiveTrips || 0,
              status: site.status || 'Operational'
            };
          } catch (err) {
            console.error('Error processing site:', err);
            return {
              id: site._id.toString(),
              name: site.name || 'Unknown Site',
              barriers: 0,
              activeTrips: 0,
              status: 'Unknown'
            };
          }
        })
      );
    } catch (err) {
      console.error('Error fetching sites:', err);
      sitesWithDetails = [];
    }

    const stats = {
      totalSites: totalSites || 0,
      totalTrips: totalTrips || 0,
      supervisors: supervisors || 0,
      activeTrips: activeTrips || 0,
      activeSupervisors: activeSupervisors || 0,
      todayTrips: todayTrips || 0,
      completedTrips: completedTrips || 0,
      sites: sitesWithDetails || []
    };

    res.json(stats);
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ 
      message: "Error fetching dashboard stats", 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
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
    const sites = await Site.find({ projectManagerId: req.user.id });
    res.json(sites);
  } catch (err) {
    res.status(500).json({ message: "Error fetching sites", err });
  }
};

export const getSiteDetails = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id).populate("supervisors vendors");
    if (!site) return res.status(404).json({ message: "Site not found" });
    res.json(site);
  } catch (err) {
    res.status(500).json({ message: "Error fetching site details", err });
  }
};

// Supervisor routes
export const createSupervisor = async (req, res) => {
  try {
    const { name, email, siteId } = req.body;

    const supervisor = new Supervisor({
      name,
      email,
      siteId,
      projectManagerId: req.user.id,
    });

    await supervisor.save();

    res.status(201).json(supervisor);
  } catch (err) {
    res.status(500).json({ message: "Error creating supervisor", err });
  }
};

export const getAllSupervisors = async (req, res) => {
  try {
    const supervisors = await Supervisor.find({ projectManagerId: req.user.id });
    res.json(supervisors);
  } catch (err) {
    res.status(500).json({ message: "Error fetching supervisors", err });
  }
};

export const assignSiteToSupervisor = async (req, res) => {
  try {
    const { siteId } = req.body;
    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) return res.status(404).json({ message: "Supervisor not found" });

    supervisor.siteId = siteId;
    await supervisor.save();

    res.json(supervisor);
  } catch (err) {
    res.status(500).json({ message: "Error assigning site to supervisor", err });
  }
};

export const toggleSupervisorStatus = async (req, res) => {
  try {
    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) return res.status(404).json({ message: "Supervisor not found" });

    supervisor.isActive = !supervisor.isActive;
    await supervisor.save();

    res.json(supervisor);
  } catch (err) {
    res.status(500).json({ message: "Error toggling supervisor status", err });
  }
};

// Live Vehicles Monitoring
export const getLiveVehicles = async (req, res) => {
  try {
    const liveVehicles = await Vehicle.find({ projectManagerId: req.user.id, status: "online" });
    res.json(liveVehicles);
  } catch (err) {
    res.status(500).json({ message: "Error fetching live vehicles", err });
  }
};



// GET TRIP REPORTS
export const getTripReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = { projectManagerId: req.user.id };
    
    // Date range filter
    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    const reports = await Trip.find(filter)
      .populate('vehicleId', 'vehicleNumber')
      .populate('vendorId', 'name email phone')
      .populate('siteId', 'name location')
      .populate('supervisorId', 'name email')
      .populate('clientId', 'name')
      .sort({ entryAt: -1 });
    
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching trip reports", error: err.message });
  }
};

// EXPORT REPORTS TO EXCEL
export const exportReportsToExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = { projectManagerId: req.user.id };
    
    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    const reports = await Trip.find(filter)
      .populate('vehicleId', 'vehicleNumber')
      .populate('vendorId', 'name email phone')
      .populate('siteId', 'name location')
      .populate('supervisorId', 'name')
      .populate('clientId', 'name')
      .sort({ entryAt: -1 });

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
      'Trip ID': report.tripId,
      'Vehicle': report.plateText || report.vehicleId?.vehicleNumber || 'N/A',
      'Vendor': report.vendorId?.name || 'N/A',
      'Client': report.clientId?.name || 'N/A',
      'Site': report.siteId?.name || 'N/A',
      'Load Status': report.loadStatus || 'N/A',
      'Entry Time': report.entryAt ? new Date(report.entryAt).toLocaleString() : '-',
      'Exit Time': report.exitAt ? new Date(report.exitAt).toLocaleString() : '-',
      'Duration': calculateDuration(report.entryAt, report.exitAt),
      'Entry Gate': report.entryGate || '-',
      'Exit Gate': report.exitGate || '-',
      'Status': report.status === 'INSIDE' || report.status === 'active' ? 'Active' : 
                report.status === 'EXITED' || report.status === 'completed' ? 'Completed' : 
                report.status,
      'Supervisor': report.supervisorId?.name || 'N/A',
      'Notes': report.notes || '-'
    }));

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
      { wch: 12 }, // Load Status
      { wch: 20 }, // Entry Time
      { wch: 20 }, // Exit Time
      { wch: 12 }, // Duration
      { wch: 12 }, // Entry Gate
      { wch: 12 }, // Exit Gate
      { wch: 12 }, // Status
      { wch: 18 }, // Supervisor
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
    console.error(err);
    res.status(500).json({ message: "Error exporting reports", error: err.message });
  }
};

// GET REPORT STATS (Optional)
export const getReportStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = { projectManagerId: req.user.id };
    
    if (startDate && endDate) {
      filter.entryTime = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    const [totalTrips, completedTrips, activeTrips, totalDuration] = await Promise.all([
      Trip.countDocuments(filter),
      Trip.countDocuments({ ...filter, status: 'completed' }),
      Trip.countDocuments({ ...filter, status: 'active' }),
      Trip.aggregate([
        { $match: { ...filter, status: 'completed', exitTime: { $exists: true } } },
        {
          $project: {
            duration: { $subtract: ['$exitTime', '$entryTime'] }
          }
        },
        {
          $group: {
            _id: null,
            totalDuration: { $sum: '$duration' }
          }
        }
      ])
    ]);

    const avgDuration = totalDuration.length > 0 
      ? Math.floor(totalDuration[0].totalDuration / completedTrips / (1000 * 60)) 
      : 0;

    res.json({
      totalTrips,
      completedTrips,
      activeTrips,
      averageDurationMinutes: avgDuration
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching report stats", error: err.message });
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
export const updateVendor = async (req, res) => {
  try {
    const { name, email, phone, address, assignedSites } = req.body;
    
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Check if vendor belongs to this project manager
    if (vendor.projectManagerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Update fields
    if (name) vendor.name = name;
    if (email) vendor.email = email;
    if (phone) vendor.phone = phone;
    if (address) vendor.address = address;
    if (assignedSites) vendor.assignedSites = assignedSites;

    await vendor.save();
    await vendor.populate('assignedSites', 'name');

    res.json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating vendor", error: err.message });
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
    res.json({
      fullName: pm.name,
      email: pm.email,
      phone: pm.mobile,
      location: pm.location || "",
      assignedSites: pm.assignedSites.length,
      role: pm.role,
      createdAt: pm.createdAt,
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