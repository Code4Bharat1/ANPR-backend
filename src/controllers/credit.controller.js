import mongoose from "mongoose";
import Client from "../models/Client.model.js";
import CreditLedger from "../models/CreditLedger.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

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
