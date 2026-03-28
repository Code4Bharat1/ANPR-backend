/**
 * AI Analytics Controller
 *
 * POST /api/ai-analytics/query
 *
 * Flow:
 *   1. Parse NL question → structured intent (Gemini)
 *   2. Execute intent against MongoDB (tenant-aware)
 *   3. Format raw results → human answer (Gemini)
 *   4. Return { answer, data, intent }
 *
 * Feature-gated: aiAnalytics (ENTERPRISE only via checkFeatureFlag middleware)
 */

import mongoose from "mongoose";
import Trip from "../models/Trip.model.js";
import Site from "../models/Site.model.js";
import BarrierEvent from "../models/BarrierEvent.model.js";
import Vehicle from "../models/Vehicle.model.js";
import VendorModel from "../models/Vendor.model.js";
import { parseAnalyticsIntent, formatAnalyticsAnswer } from "../utils/gemini.util.js";

// ── Tenant-aware model helpers ──────────────────────────────
function TripM(req)    { return req?.db ? req.db.model("Trip")         : Trip; }
function SiteM(req)    { return req?.db ? req.db.model("Site")         : Site; }
function BarrierM(req) { return req?.db ? req.db.model("BarrierEvent") : BarrierEvent; }
function VehicleM(req) { return req?.db ? req.db.model("Vehicle")      : Vehicle; }
function VendorM(req)  { return req?.db ? req.db.model("Vendor")       : VendorModel; }

// ── Build a Mongoose date filter from ISO strings ───────────
function dateRange(from, to) {
  const f = {};
  if (from) f.$gte = new Date(from);
  if (to)   f.$lte = new Date(to);
  return Object.keys(f).length ? f : null;
}

// ── Resolve siteId from a partial site name ─────────────────
async function resolveSiteId(req, clientId, siteName) {
  if (!siteName) return null;
  const site = await SiteM(req).findOne({
    clientId: new mongoose.Types.ObjectId(clientId),
    name: { $regex: siteName, $options: "i" },
  }).lean();
  return site?._id || null;
}

// ── Resolve vendorId from a partial vendor name ─────────────
async function resolveVendorId(req, clientId, vendorName) {
  if (!vendorName) return null;
  const vendor = await VendorM(req).findOne({
    clientId: new mongoose.Types.ObjectId(clientId),
    $or: [
      { name:        { $regex: vendorName, $options: "i" } },
      { companyName: { $regex: vendorName, $options: "i" } },
    ],
  }).lean();
  return vendor?._id || null;
}

// ── Build base trip query from intent filters ────────────────
async function buildTripQuery(req, clientId, filters) {
  const query = { clientId: new mongoose.Types.ObjectId(clientId) };

  const dr = dateRange(filters.dateFrom, filters.dateTo);
  if (dr) query.entryAt = dr;

  if (filters.status)       query.status    = filters.status;
  if (filters.loadStatus)   query.loadStatus = filters.loadStatus;
  if (filters.vehicleNumber) {
    query.plateText = { $regex: filters.vehicleNumber, $options: "i" };
  }

  const siteId = await resolveSiteId(req, clientId, filters.siteName);
  if (siteId) query.siteId = siteId;

  const vendorId = await resolveVendorId(req, clientId, filters.vendorName);
  if (vendorId) query.vendorId = vendorId;

  // vehicleType requires a join — handled separately in executors
  return { query, siteId, vendorId };
}

/* ═══════════════════════════════════════════════════════════
   QUERY EXECUTORS — one per queryType
═══════════════════════════════════════════════════════════ */

async function execTripCount(req, clientId, intent) {
  const { query } = await buildTripQuery(req, clientId, intent.filters);
  const count = await TripM(req).countDocuments(query);
  return { count, filters: intent.filters };
}

async function execTripList(req, clientId, intent) {
  const { query } = await buildTripQuery(req, clientId, intent.filters);
  const limit = Math.min(intent.limit || 20, 50);

  const trips = await TripM(req)
    .find(query)
    .populate("siteId",   "name")
    .populate("vendorId", "name companyName")
    .sort({ entryAt: -1 })
    .limit(limit)
    .lean();

  return trips.map((t) => ({
    tripId:        t.tripId || t._id,
    plate:         t.plateText,
    status:        t.status,
    site:          t.siteId?.name || "—",
    vendor:        t.vendorId?.name || t.vendorId?.companyName || "—",
    entryAt:       t.entryAt ? new Date(t.entryAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—",
    exitAt:        t.exitAt  ? new Date(t.exitAt).toLocaleString("en-IN",  { timeZone: "Asia/Kolkata" }) : "—",
    loadStatus:    t.loadStatus || "—",
    driverName:    t.driverName || "—",
  }));
}

async function execActiveTrips(req, clientId, intent) {
  const { query } = await buildTripQuery(req, clientId, intent.filters);
  query.status = "INSIDE";
  delete query.entryAt; // active trips — don't restrict by date

  const trips = await TripM(req)
    .find(query)
    .populate("siteId",   "name")
    .populate("vendorId", "name companyName")
    .sort({ entryAt: -1 })
    .limit(100)
    .lean();

  return {
    count: trips.length,
    trips: trips.map((t) => ({
      plate:      t.plateText,
      site:       t.siteId?.name || "—",
      vendor:     t.vendorId?.name || t.vendorId?.companyName || "—",
      entryAt:    t.entryAt ? new Date(t.entryAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—",
      driverName: t.driverName || "—",
    })),
  };
}

async function execOverstay(req, clientId, intent) {
  const { query } = await buildTripQuery(req, clientId, intent.filters);
  query.status = "OVERSTAY";

  const trips = await TripM(req)
    .find(query)
    .populate("siteId", "name")
    .sort({ entryAt: 1 })
    .limit(50)
    .lean();

  return {
    count: trips.length,
    trips: trips.map((t) => {
      const elapsed = Math.floor((Date.now() - new Date(t.entryAt)) / 60000);
      return {
        plate:          t.plateText,
        site:           t.siteId?.name || "—",
        entryAt:        new Date(t.entryAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        elapsedMinutes: elapsed,
        threshold:      t.overstayThreshold || 240,
      };
    }),
  };
}

async function execSiteSummary(req, clientId, intent) {
  const dr = dateRange(intent.filters.dateFrom, intent.filters.dateTo);
  const matchStage = { clientId: new mongoose.Types.ObjectId(clientId) };
  if (dr) matchStage.entryAt = dr;

  const rows = await TripM(req).aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:       "$siteId",
        total:     { $sum: 1 },
        inside:    { $sum: { $cond: [{ $eq: ["$status", "INSIDE"] },    1, 0] } },
        exited:    { $sum: { $cond: [{ $eq: ["$status", "EXITED"] },    1, 0] } },
        overstay:  { $sum: { $cond: [{ $eq: ["$status", "OVERSTAY"] },  1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // Enrich with site names
  const siteIds = rows.map((r) => r._id).filter(Boolean);
  const sites   = await SiteM(req).find({ _id: { $in: siteIds } }, "name").lean();
  const siteMap = Object.fromEntries(sites.map((s) => [s._id.toString(), s.name]));

  return rows.map((r) => ({
    site:     siteMap[r._id?.toString()] || "Unknown",
    total:    r.total,
    inside:   r.inside,
    exited:   r.exited,
    overstay: r.overstay,
  }));
}

async function execVendorTrips(req, clientId, intent) {
  const { query } = await buildTripQuery(req, clientId, intent.filters);
  const dr = dateRange(intent.filters.dateFrom, intent.filters.dateTo);
  const matchStage = { clientId: new mongoose.Types.ObjectId(clientId) };
  if (dr) matchStage.entryAt = dr;
  if (query.vendorId) matchStage.vendorId = query.vendorId;

  const rows = await TripM(req).aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:      "$vendorId",
        total:    { $sum: 1 },
        inside:   { $sum: { $cond: [{ $eq: ["$status", "INSIDE"] }, 1, 0] } },
        exited:   { $sum: { $cond: [{ $eq: ["$status", "EXITED"] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 20 },
  ]);

  const vendorIds = rows.map((r) => r._id).filter(Boolean);
  const vendors   = await VendorM(req).find({ _id: { $in: vendorIds } }, "name companyName").lean();
  const vMap      = Object.fromEntries(vendors.map((v) => [v._id.toString(), v.name || v.companyName]));

  return rows.map((r) => ({
    vendor: vMap[r._id?.toString()] || "Unknown",
    total:  r.total,
    inside: r.inside,
    exited: r.exited,
  }));
}

async function execLoadStatus(req, clientId, intent) {
  const dr = dateRange(intent.filters.dateFrom, intent.filters.dateTo);
  const matchStage = { clientId: new mongoose.Types.ObjectId(clientId) };
  if (dr) matchStage.entryAt = dr;
  if (intent.filters.loadStatus) matchStage.loadStatus = intent.filters.loadStatus;

  const rows = await TripM(req).aggregate([
    { $match: matchStage },
    { $group: { _id: "$loadStatus", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return rows.map((r) => ({ loadStatus: r._id || "Not set", count: r.count }));
}

async function execBarrierEvents(req, clientId, intent) {
  const query = { clientId: new mongoose.Types.ObjectId(clientId) };
  const dr = dateRange(intent.filters.dateFrom, intent.filters.dateTo);
  if (dr) query.createdAt = dr;

  const siteId = await resolveSiteId(req, clientId, intent.filters.siteName);
  if (siteId) query.siteId = siteId;

  const events = await BarrierM(req)
    .find(query)
    .populate("siteId", "name")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    count: events.length,
    events: events.map((e) => ({
      site:      e.siteId?.name || "—",
      action:    e.action,
      trigger:   e.trigger,
      state:     e.state,
      at:        new Date(e.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    })),
  };
}

async function execVehicleLookup(req, clientId, intent) {
  const query = { clientId: new mongoose.Types.ObjectId(clientId) };
  if (intent.filters.vehicleNumber) {
    query.vehicleNumber = { $regex: intent.filters.vehicleNumber, $options: "i" };
  }
  if (intent.filters.vehicleType) {
    query.vehicleType = { $regex: intent.filters.vehicleType, $options: "i" };
  }

  const vehicles = await VehicleM(req)
    .find(query)
    .populate("siteId",   "name")
    .populate("vendorId", "name companyName")
    .limit(20)
    .lean();

  return vehicles.map((v) => ({
    vehicleNumber: v.vehicleNumber,
    vehicleType:   v.vehicleType,
    site:          v.siteId?.name || "—",
    vendor:        v.vendorId?.name || v.vendorId?.companyName || "—",
    isInside:      v.isInside,
    isBlacklisted: v.isBlacklisted,
    lastEntryAt:   v.lastEntryAt ? new Date(v.lastEntryAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—",
  }));
}

/* ═══════════════════════════════════════════════════════════
   MAIN HANDLER
═══════════════════════════════════════════════════════════ */

export async function aiAnalyticsQuery(req, res, next) {
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return res.status(400).json({ success: false, message: "A question is required." });
    }

    const clientId = req.user.clientId;

    // Fetch site names for Gemini context
    const sites     = await SiteM(req).find({ clientId }, "name").lean();
    const siteNames = sites.map((s) => s.name);

    // Step 1: Parse intent
    const intent = await parseAnalyticsIntent(question.trim(), siteNames);

    // Step 2: Execute query
    let data;
    switch (intent.queryType) {
      case "trip_count":     data = await execTripCount(req, clientId, intent);     break;
      case "trip_list":      data = await execTripList(req, clientId, intent);      break;
      case "active_trips":   data = await execActiveTrips(req, clientId, intent);   break;
      case "overstay":       data = await execOverstay(req, clientId, intent);      break;
      case "site_summary":   data = await execSiteSummary(req, clientId, intent);   break;
      case "vendor_trips":   data = await execVendorTrips(req, clientId, intent);   break;
      case "load_status":    data = await execLoadStatus(req, clientId, intent);    break;
      case "barrier_events": data = await execBarrierEvents(req, clientId, intent); break;
      case "vehicle_lookup": data = await execVehicleLookup(req, clientId, intent); break;
      default:
        return res.json({
          success: true,
          answer: "I couldn't understand that query. Try asking about trips, vehicles, sites, vendors, or barrier events.",
          data:   null,
          intent,
        });
    }

    // Step 3: Format answer
    const answer = await formatAnalyticsAnswer(question, intent, data);

    return res.json({ success: true, answer, data, intent });
  } catch (err) {
    console.error("❌ AI Analytics error:", err.message);
    next(err);
  }
}
