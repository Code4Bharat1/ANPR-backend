// models/ProjectManager.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ProjectManagerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false // Make optional for existing records
    },
    
    name: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    mobile: { type: String, required: true },

    password: {
      type: String,
      required: true,
      select: false, // ✅ FIXED (lowercase)
    },

    role: {
      type: String,
      default: "project_manager",
      enum: ["project_manager"],
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    location: {
      type: String,
      default: "",
    },
    address: {
    type: String,
    default: "",
  },
    settings: {
      preferences: {
        dateFormat: {
          type: String,
          default: "DD/MM/YYYY",
        },
        timeZone: {
          type: String,
          default: "(GMT+00:00) UTC",
        },
        language: {
          type: String,
          default: "English (US)",
        },
      },
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    supervisors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supervisor",
       
      },
    ],



    assignedSites: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Site" },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ======================================================
   🔐 HASH PASSWORD (ONLY PLACE TO HASH)
====================================================== */
ProjectManagerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ======================================================
   🔍 PASSWORD COMPARE HELPER (OPTIONAL)
====================================================== */
ProjectManagerSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

export default mongoose.model("ProjectManager", ProjectManagerSchema);
