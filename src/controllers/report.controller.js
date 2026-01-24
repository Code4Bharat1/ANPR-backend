import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import Supervisor from "../models/supervisor.model.js";
import ProjectManager from "../models/ProjectManager.model.js"; // ✅ Add missing import
import ExcelJS from "exceljs"; // ✅ Add missing ExcelJS import
import XLSX from "xlsx"; // ✅ Add XLSX for exportReportsToExcel
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
    const completedTrips = await Trip.countDocuments({
      ...q,
      status: "EXITED",
    });

    const totalSites = await Site.countDocuments({ clientId });
    const totalSupervisors = await Supervisor.countDocuments({ clientId });

    res.json({
      totalTrips,
      activeTrips,
      completedTrips,
      totalSites,
      totalSupervisors,
    });
  } catch (e) {
    next(e);
  }
};

export const siteWise = async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const data = await Trip.aggregate([
      {
        $match: {
          clientId: new (await import("mongoose")).default.Types.ObjectId(
            clientId,
          ),
        },
      },
      {
        $group: {
          _id: "$siteId",
          trips: { $sum: 1 },
          inside: { $sum: { $cond: [{ $eq: ["$status", "INSIDE"] }, 1, 0] } },
        },
      },
      { $sort: { trips: -1 } },
    ]);

    res.json(data);
  } catch (e) {
    next(e);
  }
};

/* ======================================================
   GET REPORTS WITH FILTERS (Client Admin)
====================================================== */
/* ======================================================
   GET REPORTS WITH FILTERS (Client Admin)
====================================================== */
export const getReports = async (req, res) => {
  try {
    const { startDate, endDate, status, site } = req.query;
    let assignedSiteIds = [];

    /* ----------------------------------------
       1️⃣ Assigned Sites Resolution
    ---------------------------------------- */
    if (req.user.role === "admin" || req.user.role === "client") {
      const sites = await Site.find(
        { clientId: req.user.clientId },
        "_id"
      );
      assignedSiteIds = sites.map(s => s._id);
    }

    if (req.user.role === "project_manager") {
      const pm = await ProjectManager.findOne({
        email: req.user.email,
      }).populate("assignedSites", "_id");

      if (pm) {
        assignedSiteIds = pm.assignedSites.map(s => s._id);
      }
    }

    if (assignedSiteIds.length === 0) {
      return res.json([]);
    }

    /* ----------------------------------------
       2️⃣ Build Query (FIXED ✅)
    ---------------------------------------- */
    const query = {
      siteId: { $in: assignedSiteIds },
    };

    // ✅ ONLY client needs clientId filter
    if (req.user.role === "client") {
      query.clientId = req.user.clientId;
    }

    if (startDate && endDate) {
      query.entryAt = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    }

    if (status && status !== "All Status") {
      const statusMap = {
        Active: ["INSIDE", "active"],
        Completed: ["EXITED", "completed"],
      };
      if (statusMap[status]) {
        query.status = { $in: statusMap[status] };
      }
    }

    if (site && site !== "All Sites") {
      const selectedSite = await Site.findOne({
        name: site,
        clientId: req.user.clientId,
      });
      if (selectedSite) {
        query.siteId = selectedSite._id;
      }
    }

    /* ----------------------------------------
       3️⃣ Fetch Trips
    ---------------------------------------- */
    const trips = await Trip.find(query)
      .populate("vehicleId")
      .populate("vendorId", "name")
      .populate("siteId", "name location siteId")
      .populate("createdBy", "name")
      .populate("projectManagerId", "name")
      .sort({ entryAt: -1 });

    const mapStatus = (status = "") => {
      const s = status.toLowerCase();
      if (s === "inside" || s === "active") return "active";
      if (s === "exited" || s === "completed") return "completed";
      if (s === "cancelled") return "cancelled";
      return "unknown";
    };

    const formattedTrips = trips.map(trip => ({
      _id: trip._id,
      tripId: trip.tripId || "N/A",
      vehicleId: trip.vehicleId || null,
      vendorId: {
        _id: trip.vendorId?._id,
        name: trip.vendorId?.name || "N/A",
      },
      siteId: {
        _id: trip.siteId?._id,
        name: trip.siteId?.name || "N/A",
        location: trip.siteId?.location,
      },
      entryAt: trip.entryAt,
      exitAt: trip.exitAt,
      purpose: trip.purpose || "N/A",
      countofmaterials: trip.countofmaterials || "N/A",
      status: mapStatus(trip.status),
      loadStatus: trip.loadStatus,
      entryGate: trip.entryGate,
      exitGate: trip.exitGate,
      notes: trip.notes,
      createdBy: {
        _id: trip.createdBy?._id,
        name: trip.createdBy?.name || "N/A",
      },
      projectManager: {
        _id: trip.projectManagerId?._id,
        name: trip.projectManagerId?.name || "N/A",
      },
      entryMedia: trip.entryMedia || null,
      exitMedia: trip.exitMedia || null,
    }));

    res.json(formattedTrips);
  } catch (err) {
    console.error("❌ Get reports error:", err);
    res.status(500).json({
      message: "Error fetching reports",
      error: err.message,
    });
  }
};


/*====================================================
   EXPORT REPORTS TO EXCEL - FIXED VERSION
   ✅ Includes: Site Name, Vehicle Number, Supervisor Name
   ✅ Uses correct field names (entryAt/exitAt)
   ✅ Populates related data properly
====================================================== */
export const exportReports = async (req, res, next) => {
  try {
    const { startDate, endDate, status, site } = req.query;

    // console.log('📤 Export started for user:', req.user.id);
    // console.log('📤 Filters:', { startDate, endDate, status, site });

    // 1️⃣ Get user's assigned sites
    let assignedSiteIds = [];

    if (req.user.role === "admin" || req.user.role === "client") {
      const allSites = await Site.find({ clientId: req.user.clientId }, "_id");
      assignedSiteIds = allSites.map((s) => s._id);
    } else if (req.user.role === "project_manager") {
      const pm = await ProjectManager.findOne({ user: req.user.id }).populate(
        "assignedSites",
        "_id",
      );
      if (pm) assignedSiteIds = pm.assignedSites.map((s) => s._id);
    }

    if (assignedSiteIds.length === 0) {
      // console.log('⚠️ No sites assigned');
      return res.status(404).json({ message: "No sites assigned to user" });
    }

    // 2️⃣ Build query with correct field names
    const query = {
      clientId: req.user.clientId,
      siteId: { $in: assignedSiteIds },
    };

    // ✅ Use entryAt (not createdAt or entryTime)
    if (startDate && endDate) {
      query.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
      // console.log('📅 Date filter:', query.entryAt);
    }

    // Status filter with mapping
    if (status && status !== "All Status") {
      const statusMap = {
        Active: ["INSIDE", "active", "ACTIVE"],
        Completed: ["EXITED", "completed", "COMPLETED"],
      };
      query.status = statusMap[status] ? { $in: statusMap[status] } : status;
    }

    // Specific site filter
    if (site && site !== "All Sites") {
      const selectedSite = await Site.findOne({
        name: site,
        clientId: req.user.clientId,
      });
      if (selectedSite) {
        query.siteId = selectedSite._id;
      }
    }

    // console.log('🔍 Export query:', JSON.stringify(query, null, 2));

    // 3️⃣ Fetch trips with ALL related data populated
    const trips = await Trip.find(query)
      .populate("siteId", "name siteId address") // Site info
      .populate("vehicleId", "vehicleNumber plateNumber") // Vehicle info
      .populate("supervisorId", "name email phone")
      .populate("projectManagerId", "name email") // Supervisor info
      .populate("clientId", "companyName") // Client info (optional)
      .sort({ entryAt: -1 });

    // console.log(`✅ Found ${trips.length} trips for export`);

    if (trips.length === 0) {
      return res.status(404).json({ message: "No trips found for export" });
    }

    // 4️⃣ Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Trips Report");

    // 5️⃣ Define columns - Added Supervisor column
    worksheet.columns = [
      // { header: 'Trip ID', key: 'tripId', width: 28 },
      { header: "Vehicle Number", key: "vehicleNumber", width: 18 },
      { header: "Site Name", key: "siteName", width: 25 },
      { header: "Project Manager", key: "projectManager", width: 22 },
      { header: "Supervisor", key: "supervisor", width: 20 },
      { header: "Entry Time", key: "entryTime", width: 22 },
      { header: "Exit Time", key: "exitTime", width: 22 },
      { header: "Duration", key: "duration", width: 15 },
      { header: "Status", key: "status", width: 12 },
    ];

    // 6️⃣ Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    // 7️⃣ Helper function to calculate duration
    const calculateDuration = (entryAt, exitAt) => {
      if (!entryAt || !exitAt) return "-";

      const entry = new Date(entryAt);
      const exit = new Date(exitAt);
      const diffMs = exit - entry;

      if (diffMs < 0) return "-";

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      return `${hours}h ${minutes}m`;
    };

    // 8️⃣ Helper function to normalize status
    const normalizeStatus = (status) => {
      const statusMap = {
        INSIDE: "Active",
        active: "Active",
        ACTIVE: "Active",
        EXITED: "Completed",
        completed: "Completed",
        COMPLETED: "Completed",
      };
      return statusMap[status] || status || "Active";
    };

    // 9️⃣ Add data rows with all populated data
    trips.forEach((trip) => {
      // Extract vehicle number from multiple possible sources
      const vehicleNumber =
        trip.plateText ||
        trip.vehicleNumber ||
        trip.vehicleId?.vehicleNumber ||
        trip.vehicleId?.plateNumber ||
        "N/A";

      // Extract site name
      const siteName = trip.siteId?.name || trip.site || "N/A";

      // Extract supervisor name
      const supervisor = trip.supervisorId?.name || trip.supervisor || "-";
      const projectManager =
        trip.projectManagerId?.name || "-";
      // Format dates using entryAt and exitAt
      const entryTime = trip.entryAt
        ? new Date(trip.entryAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        : "-";

      const exitTime = trip.exitAt
        ? new Date(trip.exitAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        : "-";

      // Calculate duration
      const duration = calculateDuration(trip.entryAt, trip.exitAt);

      // Normalize status
      const status = normalizeStatus(trip.status);

      // Add row
      worksheet.addRow({
        // tripId: trip._id.toString(),
        vehicleNumber: vehicleNumber,
        siteName: siteName,
        supervisor: supervisor,
        projectManager: projectManager,
        entryTime: entryTime,
        exitTime: exitTime,
        duration: duration,
        status: status,
      });
    });

    // 🎨 Style all data rows
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        // Add borders
        cell.border = {
          top: { style: "thin", color: { argb: "FFD0D0D0" } },
          left: { style: "thin", color: { argb: "FFD0D0D0" } },
          bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
          right: { style: "thin", color: { argb: "FFD0D0D0" } },
        };

        // Alignment
        if (colNumber === 1) {
          // Trip ID - left aligned
          cell.alignment = { vertical: "middle", horizontal: "left" };
        } else {
          // All other columns - center aligned
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }

        // Alternate row colors for data rows
        if (rowNumber > 1 && rowNumber % 2 === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8F9FA" },
          };
        }

        // Status cell coloring
        if (colNumber === 8 && rowNumber > 1) {
          // Status column
          const statusValue = cell.value;
          if (statusValue === "Completed") {
            cell.font = { color: { argb: "FF0F5132" }, bold: true };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFD1E7DD" },
            };
          } else if (statusValue === "Active") {
            cell.font = { color: { argb: "FF084298" }, bold: true };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFCFE2FF" },
            };
          }
        }
      });
    });

    // 📊 Add summary row at the bottom
    const summaryRow = worksheet.addRow({
      tripId: "TOTAL",
      vehicleNumber: "",
      siteName: `${trips.length} Trips`,
      supervisor: "",
      entryTime: "",
      exitTime: "",
      duration: "",
      status: `${trips.filter((t) => normalizeStatus(t.status) === "Completed").length} Completed`,
    });

    summaryRow.font = { bold: true, size: 11 };
    summaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE9ECEF" },
    };

    // 📝 Set response headers
    const filename = `trips_report_${startDate || "all"}_to_${endDate || "all"}_${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // ✅ Write to response
    await workbook.xlsx.write(res);
    res.end();

    // console.log(`✅ Export successful: ${trips.length} trips exported`);
  } catch (err) {
    console.error("❌ Export error:", err);
    console.error("❌ Stack:", err.stack);

    // Send error response if headers not sent
    if (!res.headersSent) {
      res.status(500).json({
        message: "Error exporting reports",
        error: err.message,
      });
    }
  }
};
/* ======================================================
   GET TRIP REPORTS (Project Manager - SPECIFIC FOR PM REPORTS PAGE)
====================================================== */
export const getTripReportsPM = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (req.user.role !== "project_manager") {
      return res.status(403).json({
        message: "Access denied. Only Project Managers can access this.",
      });
    }

    // ✅ FIX: Find PM by EMAIL (single source of truth)
    const projectManager = await ProjectManager.findOne({
      email: req.user.email,
    }).populate("assignedSites", "_id name siteId");

    if (!projectManager) {
      return res.status(404).json({
        message: "Project Manager not found",
      });
    }

    const siteIds = projectManager.assignedSites.map((site) => site._id);

    if (siteIds.length === 0) {
      return res.json([]);
    }

    // Build filter
    const filter = {
      siteId: { $in: siteIds },
    };

    // ✅ Safer date filter
    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    }

    const reports = await Trip.find(filter)
      .populate("vehicleId")
      .populate("vendorId", "name email phone")
      .populate("siteId", "name location siteId")
      .populate("createdBy", "name")
      .populate("clientId", "name")
      
      .populate("projectManagerId", "name email")
      .sort({ entryAt: -1 });

    // Normalize status
    const mapStatus = (status = "") => {
      const s = status.toLowerCase();
      if (s === "inside" || s === "active") return "active";
      if (s === "exited" || s === "completed") return "completed";
      if (s === "cancelled") return "cancelled";
      return "unknown";
    };

    const formattedReports = reports.map((trip) => ({
      _id: trip._id,
      tripId: trip.tripId || "N/A",
      // vehicleId: {
      //   _id: trip.vehicleId?._id,
      //   vehicleNumber: trip.plateText || trip.vehicleId?.vehicleNumber || 'N/A'
      // },
      vehicleId: trip.vehicleId,
      vendorId: {
        _id: trip.vendorId?._id,
        name: trip.vendorId?.name || "N/A",
      },
      siteId: {
        _id: trip.siteId?._id,
        name: trip.siteId?.name || "N/A",
        location: trip.siteId?.location,
      },
      entryTime: trip.entryAt,
      exitTime: trip.exitAt,
      status: mapStatus(trip.status),
      loadStatus: trip.loadStatus,
      entryGate: trip.entryGate,
      exitGate: trip.exitGate,
      notes: trip.notes,
      purpose:trip.purpose,
      countofmaterials:trip.countofmaterials,
      createdBy: trip.createdBy,

      entryMedia: trip.entryMedia || null,
      exitMedia: trip.exitMedia || null,
    }));

    return res.json(formattedReports);
  } catch (err) {
    console.error("❌ Error in getTripReportsPM:", err);
    return res.status(500).json({
      message: "Error fetching trip reports",
      error: err.message,
    });
  }
};

/* ======================================================
   EXPORT REPORTS TO EXCEL (Project Manager Reports Page)
====================================================== */
export const exportReportsToExcelPM = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // console.log('📤 PM Export request from user:', req.user.id);
    // console.log('📤 PM Email:', req.user.email);

    // 1. Get project manager by EMAIL (not user ID)
    let projectManager;
    let assignedSites = [];

    if (req.user.role === "project_manager") {
      // ✅ FIXED: Find by email
      projectManager = await ProjectManager.findOne({
        email: req.user.email,
      }).populate("assignedSites", "_id name");

      // console.log('🔍 PM Query:', { email: req.user.email });
      // console.log('🏢 PM Found:', projectManager ? 'Yes' : 'No');

      if (projectManager) {
        // console.log('✅ PM Details:');
        // console.log('- Name:', projectManager.name);
        // console.log('- Email:', projectManager.email);
        // console.log('- Assigned Sites:', projectManager.assignedSites?.length || 0);

        assignedSites = projectManager.assignedSites || [];
      } else {
        // console.log('❌ No Project Manager found with email:', req.user.email);
      }
    }

    const siteIds = assignedSites.map((site) => site._id);

    // console.log('📍 Assigned Site IDs:', siteIds);
    // console.log('📍 Site IDs count:', siteIds.length);

    // Build filter
    const filter = {};

    if (siteIds.length > 0) {
      filter.siteId = { $in: siteIds };
    } else {
      // console.log('⚠️ No sites assigned, returning empty Excel');

      // Create a more informative Excel file
      const wb = XLSX.utils.book_new();

      // Create data showing the issue
      const emptyData = [
        {
          Issue: "No Sites Assigned",
          Details: "Project Manager has no assigned sites",
        },
        { Issue: "Project Manager", Details: req.user.name || req.user.email },
        { Issue: "Email", Details: req.user.email },
        {
          Issue: "Date Range",
          Details: `${startDate || "All"} to ${endDate || "All"}`,
        },
        {
          Issue: "Solution",
          Details: "Assign sites to this Project Manager in admin panel",
        },
      ];

      const ws = XLSX.utils.json_to_sheet(emptyData);
      XLSX.utils.book_append_sheet(wb, ws, "No Data");

      // Add formatting
      ws["!cols"] = [
        { wch: 20 }, // Issue column
        { wch: 40 }, // Details column
      ];

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const filename = `trip_reports_${startDate || "all"}_to_${endDate || "all"}_${Date.now()}.xlsx`;
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      return res.send(buffer);
    }

    // Add client filter as well
    if (req.user.clientId) {
      filter.clientId = req.user.clientId;
    }

    // Date range filter
    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // console.log('🔍 Export filter:', JSON.stringify(filter, null, 2));

    // Get trips
    const reports = await Trip.find(filter)
      .populate("vehicleId", "vehicleNumber")
      .populate("vendorId", "name email phone")
      .populate("siteId", "name location")
      .populate("supervisorId", "name")
      .populate("clientId", "name")
      .populate("projectManagerId", "name email")
      .sort({ entryAt: -1 });

    // console.log(`📤 Found ${reports.length} trips for export`);

    if (reports.length === 0) {
      // Create Excel with message
      const wb = XLSX.utils.book_new();
      const emptyData = [
        { Message: "No trips found for the selected criteria" },
        { "Date Range": `${startDate || "All"} to ${endDate || "All"}` },
        { Sites: siteIds.length },
        { "Project Manager": req.user.name || req.user.email },
      ];

      const ws = XLSX.utils.json_to_sheet(emptyData);
      XLSX.utils.book_append_sheet(wb, ws, "No Trips");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const filename = `trip_reports_${startDate || "all"}_to_${endDate || "all"}_${Date.now()}.xlsx`;
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      return res.send(buffer);
    }

    // Calculate duration helper
    const calculateDuration = (entryAt, exitAt) => {
      if (!entryAt || !exitAt) return "-";

      const entry = new Date(entryAt).getTime();
      const exit = new Date(exitAt).getTime();

      if (!entry || !exit || exit <= entry) return "-";

      const diff = exit - entry;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      return `${hours}h ${minutes}m`;
    };

    // Helper function for status display
    const getStatusDisplay = (status) => {
      switch (status?.toLowerCase()) {
        case "inside":
        case "active":
          return "Active";
        case "exited":
        case "completed":
          return "Completed";
        case "cancelled":
          return "Cancelled";
        default:
          return status || "N/A";
      }
    };

    // Format data for Excel
    const excelData = reports.map((report) => ({
      // 'Trip ID': report.tripId || 'N/A',
      Vehicle: report.plateText || report.vehicleId?.vehicleNumber || "N/A",
      Vendor: report.vendorId?.name || "N/A",
      // 'Client': report.clientId?.name || 'N/A',
      Site: report.siteId?.name || "N/A",
      Location: report.siteId?.location || "N/A",
      // 'Project Manager': report.projectManagerId?.name || 'N/A',
      // 'Supervisor': report.supervisorId?.name || 'N/A',
      "Load Status": report.loadStatus || "N/A",
      "Entry Time": report.entryAt
        ? new Date(report.entryAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        : "-",
      "Exit Time": report.exitAt
        ? new Date(report.exitAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        : "-",
      Duration: calculateDuration(report.entryAt, report.exitAt),
      "Entry Gate": report.entryGate || "-",
      "Exit Gate": report.exitGate || "-",
      Status: getStatusDisplay(report.status),
      Notes: report.notes || "-",
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws["!cols"] = [
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
      { wch: 30 }, // Notes
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Trip Reports");

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Set headers for download
    const filename = `trip_reports_${startDate || "all"}_to_${endDate || "all"}_${Date.now()}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    // console.log(`✅ Export successful: ${reports.length} trips`);
    res.send(buffer);
  } catch (err) {
    console.error("❌ Error in exportReportsToExcelPM:", err);
    console.error("❌ Stack trace:", err.stack);

    if (!res.headersSent) {
      res.status(500).json({
        message: "Error exporting reports",
        error: err.message,
      });
    }
  }
};

/* ======================================================
   GET REPORT STATS (Project Manager Reports Page)
====================================================== */
export const getReportStatsPM = async (req, res) => {
  // ✅ Changed function name
  try {
    const { startDate, endDate } = req.query;

    // console.log('📊 PM Stats request from user:', req.user.id);

    // 1. Get project manager and assigned sites
    let projectManager;
    let assignedSites = [];

    if (req.user.role === "project_manager") {
      projectManager = await ProjectManager.findOne({
        user: req.user.id,
      }).populate("assignedSites", "_id name");

      if (projectManager) {
        assignedSites = projectManager.assignedSites || [];
      }
    }

    const siteIds = assignedSites.map((site) => site._id);

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
        averageDurationMinutes: 0,
      });
    }

    if (startDate && endDate) {
      filter.entryAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // console.log('📊 PM Stats filter:', filter);

    const [totalTrips, completedTrips, activeTrips, totalDuration] =
      await Promise.all([
        Trip.countDocuments(filter),
        Trip.countDocuments({
          ...filter,
          status: { $in: ["EXITED", "completed"] },
        }),
        Trip.countDocuments({
          ...filter,
          status: { $in: ["INSIDE", "active"] },
        }),
        Trip.aggregate([
          {
            $match: {
              ...filter,
              status: { $in: ["EXITED", "completed"] },
              exitAt: { $exists: true, $ne: null },
              entryAt: { $exists: true, $ne: null },
            },
          },
          {
            $project: {
              duration: {
                $subtract: ["$exitAt", "$entryAt"],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalDuration: { $sum: "$duration" },
            },
          },
        ]),
      ]);

    // console.log('📊 PM Stats Results:', {
    //   totalTrips,
    //   completedTrips,
    //   activeTrips,
    //   totalDuration: totalDuration[0]?.totalDuration || 0
    // });

    const avgDuration =
      totalDuration.length > 0 && completedTrips > 0
        ? Math.floor(
          totalDuration[0].totalDuration / completedTrips / (1000 * 60),
        )
        : 0;

    res.json({
      totalTrips,
      completedTrips,
      activeTrips,
      averageDurationMinutes: avgDuration,
    });
  } catch (err) {
    console.error("❌ Error in getReportStatsPM:", err);
    res.status(500).json({
      message: "Error fetching report stats",
      error: err.message,
    });
  }
};
