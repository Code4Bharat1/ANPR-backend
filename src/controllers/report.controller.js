import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Supervisor from "../models/supervisor.model.js";
import { buildDateFilter } from "../utils/query.util.js";

export const summary = async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { from, to } = req.query;

    const dateFilter = buildDateFilter(from, to);

    const q = { clientId };
    if (dateFilter) q.createdAt = dateFilter;

    const totalTrips = await Trip.countDocuments(q);
    const activeTrips = await Trip.countDocuments({ ...q, status: "INSIDE" });
    const completedTrips = await Trip.countDocuments({ ...q, status: "EXITED" });

    const totalSites = await Site.countDocuments({ clientId });
    const totalSupervisors = await Supervisor.countDocuments({ clientId });

    res.json({ totalTrips, activeTrips, completedTrips, totalSites, totalSupervisors });
  } catch (e) {
    next(e);
  }
};

export const siteWise = async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const data = await Trip.aggregate([
      { $match: { clientId: new (await import("mongoose")).default.Types.ObjectId(clientId) } },
      { $group: { _id: "$siteId", trips: { $sum: 1 }, inside: { $sum: { $cond: [{ $eq: ["$status", "INSIDE"] }, 1, 0] } } } },
      { $sort: { trips: -1 } },
    ]);

    res.json(data);
  } catch (e) {
    next(e);
  }
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