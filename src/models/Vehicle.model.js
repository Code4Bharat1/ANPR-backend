import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    /* ==============================
       BASIC VEHICLE INFO
    ============================== */
    vehicleNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    vehicleType: {
      type: String,
      enum: [
        "TRUCK_10",
        "TRUCK_6",
        "VAN",
        "TANKER",
        "CAR",
        "BIKE",
        "VISITOR",
      ],
      required: true,
    },

    /* ==============================
       RELATIONS
    ============================== */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    /* ==============================
       DRIVER INFO
    ============================== */
    driverName: {
      type: String,
      trim: true,
    },

    driverPhone: {
      type: String,
      trim: true,
    },

    /* ==============================
       STATUS FLAGS
    ============================== */
    isInside: {
      type: Boolean,
      default: false, // INSIDE / OUTSIDE
    },

    isBlacklisted: {
      type: Boolean,
      default: false,
    },

    lastEntryAt: {
      type: Date,
    },

    lastExitAt: {
      type: Date,
    },

    /* ==============================
       ANPR DETAILS
    ============================== */
    lastAnprImage: {
      type: String, // URL / base64
      default: "",
    },

    lastDetectedAt: {
      type: Date,
    },

    /* ==============================
       AUDIT
    ============================== */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

/* ==============================
   INDEXES
============================== */
vehicleSchema.index({ vehicleNumber: 1, siteId: 1 });

export default mongoose.model("Vehicle", vehicleSchema);
