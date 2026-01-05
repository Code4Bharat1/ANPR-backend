import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
      select: false, // 🔐 security
    },

    phone: {
      type: String,
      default: "",
    },

    location: {
      type: String,
      default: "",
    },

    profileImageUrl: {
      type: String,
      default: "",
    },

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

    lastLogin: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("SuperAdmin", superAdminSchema);
