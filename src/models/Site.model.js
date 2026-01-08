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
    contactPerson: {
      type: String,
      trim: true,
    },

    contactPhone: {
      type: String,
      trim: true,
    },

    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },

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
       RELATIONS
    ====================== */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    supervisors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supervisor",
      index: true,
    }],

    projectManagers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectManager",
      index: true,
    }],


    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
  },
  { timestamps: true }
);

/* ======================
   INDEXES (PERFORMANCE)
====================== */
siteSchema.index({ name: 1, clientId: 1 });
siteSchema.index({ status: 1 });

export default mongoose.model("Site", siteSchema);
