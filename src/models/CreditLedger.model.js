import mongoose from "mongoose";

const creditLedgerSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },
    // ENTRY | EXIT = trip-driven deductions; TOPUP | ADJUSTMENT = manual
    eventType: {
      type: String,
      enum: ["ENTRY", "EXIT", "TOPUP", "ADJUSTMENT"],
      required: true,
    },
    // Positive = credit added, Negative = credit deducted
    credits: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    // Who triggered this event (superadmin id for TOPUP, supervisor id for ENTRY/EXIT)
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    performedByRole: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

creditLedgerSchema.index({ clientId: 1, createdAt: -1 });

export default mongoose.model("CreditLedger", creditLedgerSchema);
