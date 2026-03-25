/**
 * FR-5.3: BarrierEvent — persisted after every barrier command round-trip.
 *
 * Since the barrier is physically part of the ANPR camera and controlled
 * via the on-site agent, there is no deviceId in the DB. We scope events
 * by siteId + clientId instead.
 *
 * state reflects what the agent reported back:
 *   OPEN    — agent confirmed BARRIER_OPENED
 *   CLOSED  — agent confirmed BARRIER_CLOSED  (future)
 *   ERROR   — agent returned ERROR or timed out
 *   UNKNOWN — no agent response recorded
 */

import mongoose from "mongoose";

const barrierEventSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
      index: true,
    },
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

    // FR-5.1 / FR-5.2
    action: {
      type: String,
      enum: ["OPEN", "CLOSE"],
      required: true,
    },

    // FR-5.6: what triggered this command
    trigger: {
      type: String,
      enum: ["MANUAL", "AUTO_ENTRY", "AUTO_EXIT", "BIOMETRIC"],
      required: true,
    },

    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // userId (supervisor / PM / admin)
    },

    // FR-5.3: what the agent reported back
    state: {
      type: String,
      enum: ["OPEN", "CLOSED", "ERROR", "UNKNOWN"],
      required: true,
    },

    // Raw error message from agent if state === ERROR
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// FR-5.4: fast lookup of last event per site
barrierEventSchema.index({ siteId: 1, createdAt: -1 });

export default mongoose.model("BarrierEvent", barrierEventSchema);
