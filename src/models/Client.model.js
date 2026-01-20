import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const clientSchema = new mongoose.Schema(
  {
    /* =====================
       BASIC IDENTITY
    ===================== */
    companyName: {
      type: String,
      required: true,
      trim: true,
    },

    // ✅ unified name (frontend uses this)
    clientname: {
      type: String,
      trim: true,
    },
    
    address: {
      type: String,
      trim: true,
    },


    phone: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    /* =====================
       ROLE & ACCESS
    ===================== */
    role: {
      type: String,
      enum: ["client", "admin"],
      default: "client",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /* =====================
       COMPANY DETAILS (PROFILE PAGE)
    ===================== */
    company: {
      name: String,
      address: String,
      supportEmail: String,
      supportPhone: String,
    },

    location: {
      type: String,
      trim: true,
    },

    preferences: {
      type: Object,
      default: {},
    },

    /* =====================
       PACKAGE
    ===================== */
    clientCode: {
      type: String,
      unique: true,
      index: true,
    },

    packageType: {
      type: String,
      enum: ["LITE", "CORE", "PRO", "ENTERPRISE"],
      required: true,
    },

    userLimits: {
      pm: { type: Number, default: 0 },
      supervisor: { type: Number, default: 0 },
    },
    deviceLimits: {
      ANPR: { type: Number, default: 0 },
      BARRIER: { type: Number, default: 0 },
      BIOMETRIC: { type: Number, default: 0 },
    },


    packageStart: Date,
    packageEnd: Date,

    /* =====================
       META
    ===================== */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
    },
  },
  { timestamps: true }
);

/* 🔐 Password Hashing */
clientSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* 🆔 Auto-generate client code */
clientSchema.pre("validate", async function (next) {
  if (!this.clientCode) {
    this.clientCode = `CL-${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

export default mongoose.models.Client ||
  mongoose.model("Client", clientSchema);
