import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const superAdminSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, default: "" },
    location: { type: String, default: "" },
    profileImageUrl: { type: String, default: "" },
    role: {
      type: String,
      default: "superadmin",
      enum: ["superadmin"],
    },
    accountStatus: {
      type: String,
      enum: ["Active", "Blocked"],
      default: "Active",
    },
    lastLogin: Date,
  },
  { timestamps: true }
);

/* 🔐 HASH PASSWORD */
superAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ✅ SAFE EXPORT (VERY IMPORTANT) */
export default mongoose.models.SuperAdmin ||
  mongoose.model("SuperAdmin", superAdminSchema);
