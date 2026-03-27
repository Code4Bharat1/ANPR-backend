import mongoose from "mongoose";
import Client from "../models/Client.model.js";
import CreditLedger from "../models/CreditLedger.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/* ======================================================
   GET CREDIT DASHBOARD DATA
   GET /api/credits/dashboard
   Auth: superadmin only
====================================================== */
export const getCreditDashboardData = async (req, res, next) => {
  try {
    // Get all clients with credit data
    const allClients = await Client.find({})
      .select('companyName clientname creditBalance creditThreshold isActive packageEnd')
      .sort({ creditBalance: -1 })
      .lean();
    
    // Calculate totals
    let totalCredits = 0;
    const clientsWithData = [];
    
    for (const client of allClients) {
      let balance = client.creditBalance;
      if (typeof balance === 'string') balance = parseFloat(balance);
      if (isNaN(balance)) balance = 0;
      
      totalCredits += balance;
      
      clientsWithData.push({
        _id: client._id,
        name: client.companyName || client.clientname,
        balance: balance,
        threshold: client.creditThreshold || 0,
        isActive: client.isActive,
        packageEnd: client.packageEnd
      });
    }
    
    // Get recent top-ups
    const recentTopups = await CreditLedger.find({ eventType: "TOPUP" })
      .populate('clientId', 'companyName clientname')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    // Get statistics
    const clientsBelowThreshold = clientsWithData.filter(c => 
      c.balance > 0 && c.balance <= c.threshold
    ).length;
    
    const clientsWithNoCredits = clientsWithData.filter(c => c.balance === 0).length;
    const clientsWithLowCredits = clientsWithData.filter(c => 
      c.balance > 0 && c.balance <= 100
    ).length;
    
    res.json({
      success: true,
      data: {
        overview: {
          totalCredits,
          totalClients: clientsWithData.length,
          clientsWithCredits: clientsWithData.filter(c => c.balance > 0).length,
          clientsBelowThreshold,
          clientsWithNoCredits,
          clientsWithLowCredits,
          averageBalance: clientsWithData.length > 0 
            ? (totalCredits / clientsWithData.length).toFixed(2) 
            : 0
        },
        clients: clientsWithData,
        recentTopups: recentTopups.map(t => ({
          id: t._id,
          clientName: t.clientId?.companyName || t.clientId?.clientname,
          amount: t.credits,
          date: t.createdAt,
          performedBy: t.performedBy,
          balanceAfter: t.balanceAfter
        })),
        topupStats: {
          totalTopups: recentTopups.reduce((sum, t) => sum + t.credits, 0),
          count: recentTopups.length,
          averageTopup: recentTopups.length > 0 
            ? (recentTopups.reduce((sum, t) => sum + t.credits, 0) / recentTopups.length).toFixed(2)
            : 0
        }
      }
    });
  } catch (error) {
    console.error("Error fetching credit dashboard:", error);
    next(error);
  }
};

/* ======================================================
   GET BALANCE
   GET /api/credits/balance
   Auth: client (own) | superadmin (any via ?clientId=)
====================================================== */
export const getBalance = async (req, res, next) => {
  try {
    const clientId =
      req.user.role === "superadmin"
        ? req.query.clientId || req.user._id
        : req.user.clientId || req.user._id;

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid clientId" });
    }

    const client = await Client.findById(clientId).select(
      "companyName clientname creditBalance creditThreshold"
    );

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const lastTopup = await CreditLedger.findOne({ clientId, eventType: "TOPUP" })
      .sort({ createdAt: -1 })
      .select("credits createdAt")
      .lean();

    return res.json({
      success: true,
      data: {
        clientId,
        companyName: client.companyName || client.clientname,
        balance: client.creditBalance,
        threshold: client.creditThreshold,
        isBelowThreshold: client.creditBalance <= client.creditThreshold,
        lastTopup: lastTopup
          ? { amount: lastTopup.credits, at: lastTopup.createdAt }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   TOP UP CREDITS
   POST /api/credits/topup
   Auth: superadmin only
====================================================== */
export const topupCredits = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { clientId, amount, notes } = req.body;

    if (!clientId || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "clientId and amount are required" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "amount must be a positive integer" });
    }

    const client = await Client.findById(clientId).session(session);
    if (!client) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Client not found" });
    }

    const balanceBefore = client.creditBalance;
    const balanceAfter = balanceBefore + parsedAmount;

    await Client.findByIdAndUpdate(
      clientId,
      { $inc: { creditBalance: parsedAmount } },
      { session }
    );

    const ledgerEntry = await CreditLedger.create(
      [
        {
          clientId,
          eventType: "TOPUP",
          credits: parsedAmount,
          balanceBefore,
          balanceAfter,
          performedBy: req.user._id || req.user.id,
          performedByRole: req.user.role,
          notes: notes || null,
        },
      ],
      { session }
    );

    await logAudit({
      req,
      action: "TOPUP",
      module: "CREDIT",
      newValue: { clientId, amount: parsedAmount, balanceBefore, balanceAfter },
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: `${parsedAmount} credits added successfully`,
      data: {
        newBalance: balanceAfter,
        ledgerEntry: ledgerEntry[0],
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

/* ======================================================
   GET LEDGER
   GET /api/credits/ledger?page=1&limit=20
   Auth: client (own) | superadmin (any via ?clientId=)
====================================================== */
export const getLedger = async (req, res, next) => {
  try {
    const clientId =
      req.user.role === "superadmin"
        ? req.query.clientId
        : req.user.clientId || req.user._id;

    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Valid clientId is required" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      CreditLedger.find({ clientId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CreditLedger.countDocuments({ clientId }),
    ]);

    return res.json({
      success: true,
      data: {
        entries,
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   UPDATE THRESHOLD
   PATCH /api/credits/threshold
   Auth: superadmin only
====================================================== */
export const updateThreshold = async (req, res, next) => {
  try {
    const { clientId, threshold } = req.body;

    if (!clientId || threshold === undefined) {
      return res.status(400).json({ message: "clientId and threshold are required" });
    }

    const parsed = Number(threshold);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ message: "threshold must be a non-negative number" });
    }

    const client = await Client.findByIdAndUpdate(
      clientId,
      { creditThreshold: parsed },
      { new: true }
    ).select("companyName creditBalance creditThreshold");

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.json({
      success: true,
      message: "Threshold updated",
      data: {
        creditBalance: client.creditBalance,
        creditThreshold: client.creditThreshold,
      },
    });
  } catch (err) {
    next(err);
  }
};
