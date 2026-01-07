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
      enum: ["Active", "Inactive", "Complelted"],
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
   INDEXES (PERFORMANCE)
====================== */
siteSchema.index({ name: 1, clientId: 1 });
siteSchema.index({ status: 1 });

export default mongoose.model("Site", siteSchema);
