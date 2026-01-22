import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobile: { type: Number, required: true },
    email: { type: String, unique: true, lowercase: true },
    address: { type: String, required: true },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      default: "supervisor",
      enum: ["supervisor"],
    },
    projectManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectManager",
      required: true,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* 🔐 HASH PASSWORD - CRITICAL FIX */
schema.pre("save", async function (next) {
  // Only process if password was modified
  if (!this.isModified("password")) {
    return next();
  }
  
  // Don't re-hash if already hashed
  if (this.password && this.password.startsWith('$2')) {
    return next();
  }
  
  // Hash the plain password
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ✅ SYNC STATUS AND isActive */
schema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.isActive = this.status === "Active";
  } else if (this.isModified("isActive")) {
    this.status = this.isActive ? "Active" : "Inactive";
  }
  next();
});

export default mongoose.models.Supervisor ||
  mongoose.model("Supervisor", schema);