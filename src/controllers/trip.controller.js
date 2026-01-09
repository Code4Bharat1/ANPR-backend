// controllers/trip.controller.js
import Trip from "../models/Trip.model.js";
import mongoose from "mongoose";

/**
 * @desc   Get trip history with filters
 * @route  GET /api/trips/history
 * @access Supervisor, PM, Admin, Client
 */
export const getTripHistory = async (req, res) => {
  try {
    const { period } = req.query;
    const siteId = req.user?.siteId;
    
    console.log('🚗 Get trip history request:', {
      siteId,
      period,
      userId: req.user?._id,
      userRole: req.user?.role
    });
    
    if (!siteId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Site ID not found. Please contact administrator.' 
      });
    }

    // Calculate date range based on period
    let startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'last7days') {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid period parameter. Use "today" or "last7days".' 
      });
    }

    console.log('🔍 Querying trips:', {
      siteId,
      startDate,
      period
    });

    // Query trips with proper population
    const trips = await Trip.find({
      siteId: new mongoose.Types.ObjectId(siteId),
      createdAt: { $gte: startDate }
    })
    .populate('vendorId', 'name companyName')
    .populate('vehicleId', 'vehicleNumber plateNumber driverName vehicleType')
    .sort({ createdAt: -1 })
    .lean();

    console.log('📊 Raw trips from DB:', {
      count: trips.length,
      sampleTrip: trips[0] ? {
        tripId: trips[0].tripId,
        entryAt: trips[0].entryAt,
        exitAt: trips[0].exitAt,
        vehicleId: trips[0].vehicleId,
        vendorId: trips[0].vendorId
      } : null
    });

    // Helper function to safely format dates
    const formatDate = (dateValue) => {
      if (!dateValue) return null;
      
      try {
        const date = new Date(dateValue);
        // Check if date is valid
        if (isNaN(date.getTime())) {
          console.error('Invalid date value:', dateValue);
          return 'Invalid Date';
        }
        
        return date.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        });
      } catch (error) {
        console.error('Error formatting date:', dateValue, error);
        return 'Invalid Date';
      }
    };

    // Helper function to calculate duration
    const calculateDuration = (entryTime, exitTime) => {
      if (!entryTime || !exitTime) return null;
      
      try {
        const entry = new Date(entryTime);
        const exit = new Date(exitTime);
        
        if (isNaN(entry.getTime()) || isNaN(exit.getTime())) {
          return null;
        }
        
        const diff = exit - entry;
        if (diff < 0) return '0h 0m';
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
      } catch (error) {
        console.error('Error calculating duration:', error);
        return null;
      }
    };

    // Format trips for frontend
    const formattedTrips = trips.map(trip => {
      // Get vehicle number from multiple possible sources
      const vehicleNumber = 
        trip.vehicleId?.vehicleNumber || 
        trip.vehicleId?.plateNumber || 
        trip.plateText || 
        'N/A';
      
      // Get vendor name from multiple possible sources
      const vendorName = 
        trip.vendorId?.name || 
        trip.vendorId?.companyName || 
        'N/A';
      
      // Format entry and exit times
      const entryTime = formatDate(trip.entryAt);
      const exitTime = trip.exitAt ? formatDate(trip.exitAt) : null;
      
      // Calculate duration
      const duration = trip.exitAt 
        ? calculateDuration(trip.entryAt, trip.exitAt) 
        : 'Ongoing';
      
      // Determine status
      let status = 'active';
      if (trip.status === 'EXITED' || trip.exitAt) {
        status = 'completed';
      } else if (trip.status === 'INSIDE') {
        status = 'active';
      } else if (trip.status === 'DENIED') {
        status = 'denied';
      } else {
        status = trip.status?.toLowerCase() || 'active';
      }
      
      return {
        _id: trip._id,
        tripId: trip.tripId || 'N/A',
        vehicleNumber,
        vendor: vendorName,
        driver: trip.vehicleId?.driverName || 'N/A',
        materialType: trip.loadStatus || 'N/A',
        entryTime: entryTime || 'N/A',
        exitTime: exitTime || '--',
        duration: duration || 'N/A',
        status
      };
    });

    console.log('✅ Trip history formatted:', { 
      count: formattedTrips.length,
      sample: formattedTrips[0]
    });

    res.json({
      success: true,
      data: formattedTrips,
      count: formattedTrips.length,
      period,
      siteId
    });

  } catch (error) {
    console.error('❌ Error fetching trip history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch trip history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc   Get active vehicles (currently inside)
 * @route  GET /api/trips/active
 * @access Supervisor, PM, Admin, Client
 */
export const getActiveTrips = async (req, res) => {
  try {
    // Get siteId from query parameter OR authenticated user
    const siteId = req.query.siteId || req.user?.siteId;

    console.log('🚗 Get active vehicles request:', {
      siteId,
      fromQuery: req.query.siteId,
      fromUser: req.user?.siteId,
      query: req.query,
      hasAuth: !!req.user
    });

    if (!siteId) {
      console.error('❌ Missing siteId in both query and user session');
      return res.status(400).json({
        success: false,
        message: "Site ID is required. Either pass as ?siteId=... or ensure user is assigned to a site.",
        debug: {
          querySiteId: req.query.siteId,
          userSiteId: req.user?.siteId,
          userId: req.user?._id,
          hint: "Add ?siteId=YOUR_SITE_ID to the request URL"
        }
      });
    }

    const OVERSTAY_MINUTES = 240; // 4 hours

    console.log('🔍 Querying active trips with:', {
      siteId,
      status: ["INSIDE", "active"]
    });

    const trips = await Trip.find({
      siteId: new mongoose.Types.ObjectId(siteId),
      status: { $in: ["INSIDE", "active"] },
    })
      .populate("vendorId", "name companyName")
      .populate("vehicleId", "vehicleNumber plateNumber vehicleType driverName driverPhone")
      .sort({ entryAt: -1 })
      .lean();

    console.log('📊 Found active trips:', {
      count: trips.length,
      tripIds: trips.map(t => t.tripId || t._id)
    });

    const now = Date.now();

    const formatted = trips.map((t) => {
      const entryTime = new Date(t.entryAt);
      const durationMinutes = Math.floor((now - entryTime.getTime()) / (1000 * 60));
      
      // Format times for IST
      const entryTimeIST = entryTime.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      return {
        _id: t._id?.toString(),
        tripId: t.tripId || "N/A",
        vehicleNumber: t.vehicleId?.vehicleNumber || t.vehicleId?.plateNumber || t.plateText || "Unknown",
        vehicleType: t.vehicleId?.vehicleType || "Unknown",
        vendor: t.vendorId?.name || t.vendorId?.companyName || "Unknown",
        driver: t.vehicleId?.driverName || "N/A",
        driverPhone: t.vehicleId?.driverPhone || "N/A",
        
        // Time fields
        entryTimeUTC: entryTime.toISOString(),
        entryTimeIST,
        
        // Duration
        duration: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`,
        durationMinutes,
        
        // Status and other fields
        status: durationMinutes > OVERSTAY_MINUTES ? "overstay" : "loading",
        loadStatus: t.loadStatus || "FULL",
        purpose: t.purpose || "N/A",
        entryGate: t.entryGate || "N/A",
      };
    });

    console.log('✅ Active vehicles fetched:', {
      count: formatted.length,
      vehicles: formatted.map(v => v.vehicleNumber)
    });

    res.json({
      success: true,
      count: formatted.length,
      siteId,
      data: formatted,
    });
  } catch (err) {
    console.error("❌ Get active vehicles error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch active vehicles",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};