// models/ProjectManager.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ProjectManagerSchema = new mongoose.Schema(
  {
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
