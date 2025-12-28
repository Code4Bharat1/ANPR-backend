import Trip from "../models/Trip.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/**
 * VEHICLE ENTRY
 */
export const createEntry = async (req, res, next) => {
  try {
    const {
      siteId,
      vendorId,
      plateText,
      anprImage,
      loadStatus,
      notes,
      entryMedia,
    } = req.body;

    // 1️⃣ Supervisor must belong to site
    if (String(siteId) !== String(req.user.siteId)) {
      return res.status(403).json({ message: "Supervisor not assigned to this site" });
    }

    // 2️⃣ Media rules
    if (!entryMedia?.challanImage) {
      return res.status(400).json({ message: "Challan/Bill image required" });
    }
    if (!Array.isArray(entryMedia.photos) || entryMedia.photos.length < 4) {
      return res.status(400).json({ message: "Minimum 4 photos required" });
    }

    // 3️⃣ Prevent duplicate INSIDE
    const existing = await Trip.findOne({
      clientId: req.user.clientId,
      siteId,
      plateText,
      status: "INSIDE",
    });

    if (existing) {
      return res.status(409).json({ message: "Vehicle already inside premises" });
    }

    // 4️⃣ Create trip
    const trip = await Trip.create({
      clientId: req.user.clientId,
      siteId,
      vendorId,
      plateText,
      anprImage,
      loadStatus,
      notes,
      entryAt: new Date(),
      entryMedia,
      createdBy: req.user.id,
      status: "INSIDE",
    });

    await logAudit({ req, action: "ENTRY", module: "TRIP", newValue: trip });

    res.status(201).json(trip);
  } catch (e) {
    next(e);
  }
};

/**
 * VEHICLE EXIT
 */
export const createExit = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { exitMedia } = req.body;

    if (!exitMedia?.challanImage) {
      return res.status(400).json({ message: "Challan/Bill image required on exit" });
    }
    if (!Array.isArray(exitMedia.photos) || exitMedia.photos.length < 4) {
      return res.status(400).json({ message: "Minimum 4 photos required on exit" });
    }

    // 1️⃣ Secure lookup
    const trip = await Trip.findOne({
      _id: tripId,
      clientId: req.user.clientId,
      siteId: req.user.siteId,
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });
    if (trip.status === "EXITED") {
      return res.status(400).json({ message: "Trip already exited" });
    }

    // 2️⃣ Exit
    trip.exitAt = new Date();
    trip.exitMedia = exitMedia;
    trip.status = "EXITED";
    await trip.save();

    await logAudit({ req, action: "EXIT", module: "TRIP", newValue: trip });

    res.json(trip);
  } catch (e) {
    next(e);
  }
};

/**
 * ACTIVE TRIPS
 */
export const getActiveTrips = async (req, res, next) => {
  try {
    const q = {
      clientId: req.user.clientId,
      status: "INSIDE",
    };

    if (req.query.siteId) q.siteId = req.query.siteId;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const trips = await Trip.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(trips);
  } catch (e) {
    next(e);
  }
};

/**
 * TRIP HISTORY
 */
export const getTripHistory = async (req, res, next) => {
  try {
    const q = { clientId: req.user.clientId };

    if (req.query.siteId) q.siteId = req.query.siteId;
    if (req.query.vendorId) q.vendorId = req.query.vendorId;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const trips = await Trip.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(trips);
  } catch (e) {
    next(e);
  }
};
