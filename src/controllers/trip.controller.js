import Trip from "../models/Trip.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

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

    // Rules: challan mandatory + min 4 photos
    if (!entryMedia?.challanImage) {
      return res.status(400).json({ message: "Challan/Bill image required" });
    }
    if (!Array.isArray(entryMedia.photos) || entryMedia.photos.length < 4) {
      return res.status(400).json({ message: "Minimum 4 photos required" });
    }

    const trip = await Trip.create({
      clientId: req.user.clientId,
      siteId,
      vendorId,
      plateText, // immutable (no update endpoint provided)
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

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (String(trip.clientId) !== String(req.user.clientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (trip.status === "EXITED") {
      return res.status(400).json({ message: "Trip already exited" });
    }

    trip.exitAt = new Date();
    trip.exitMedia = exitMedia;
    trip.status = "EXITED";
    await trip.save();

    await logAudit({ req, action: "EXIT", module: "TRIP", oldValue: null, newValue: trip });

    res.json(trip);
  } catch (e) {
    next(e);
  }
};

export const getActiveTrips = async (req, res, next) => {
  try {
    const q = { clientId: req.user.clientId, status: "INSIDE" };
    if (req.query.siteId) q.siteId = req.query.siteId;

    const trips = await Trip.find(q).sort({ createdAt: -1 }).limit(200);
    res.json(trips);
  } catch (e) {
    next(e);
  }
};

export const getTripHistory = async (req, res, next) => {
  try {
    const q = { clientId: req.user.clientId };
    if (req.query.siteId) q.siteId = req.query.siteId;
    if (req.query.vendorId) q.vendorId = req.query.vendorId;

    const trips = await Trip.find(q).sort({ createdAt: -1 }).limit(500);
    res.json(trips);
  } catch (e) {
    next(e);
  }
};
