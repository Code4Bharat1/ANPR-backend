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
