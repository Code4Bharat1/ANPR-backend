import mongoose from "mongoose";

const siteSchema = new mongoose.Schema(
  {
    /* ======================
       BASIC INFO
    ====================== */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    siteCode: {
      type: String,
      unique: true,
      sparse: true,
    },

    /* ======================
       GATE INFO
    ====================== */
    gates: [
      {
        gateName: {
          type: String,
          required: true,
          trim: true,
        },
        gateCode: String,
        isMainGate: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
      },
    ],

    /* ======================
       CONTACT INFO
    ====================== */
    contactPerson: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, lowercase: true, trim: true },

    /* ======================
       STATUS
    ====================== */
    status: {
      type: String,
      enum: ["Active", "Inactive", "Completed"],
      default: "Active",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /* ======================
       DEVICES
    ====================== */
    assignedDevices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device",
      },
    ],

    /* ======================
       VEHICLE TRACKING
    ====================== */
    totalVehicles: { type: Number, default: 0 },
    activeVehicles: { type: Number, default: 0 },
    vehiclesOnSite: { type: Number, default: 0 },
    todayEntries: { type: Number, default: 0 },
    todayExits: { type: Number, default: 0 },
    utilization: { type: Number, default: 0 },

    /* ======================
       LIVE VEHICLE DATA
    ====================== */
    liveVehicles: [
      {
        vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
        vehicleNumber: String,
        type: String,
        status: {
          type: String,
          enum: ["Working", "Idle", "Maintenance", "Offline"],
          default: "Idle",
        },
        driver: String,
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
        fuelLevel: Number,
        hoursOperated: Number,
        lastUpdate: Date,
        location: {
          lat: Number,
          lng: Number,
        },
      },
    ],

    /* ======================
       RELATIONS
    ====================== */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    supervisors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supervisor",
      },
    ],

    projectManagers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProjectManager",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
  },
  { timestamps: true }
);

/* ======================
   INDEXES
====================== */
siteSchema.index({ name: 1, clientId: 1 });
siteSchema.index({ status: 1 });
siteSchema.index({ assignedDevices: 1 }); // ✅ CORRECT index
siteSchema.index({ "liveVehicles.status": 1 });

const Site = mongoose.model("Site", siteSchema);
export default Site;
