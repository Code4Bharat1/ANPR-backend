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
      required: true,
    },


    phone: { type: Number, required: true },

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
      ANPR:        { type: Number, default: 0 },
      BIOMETRIC:   { type: Number, default: 0 },
      TOP_CAMERA:  { type: Number, default: 0 },
      OVERVIEW:    { type: Number, default: 0 },
    },

    // FR-9.1: Per-client site limit override (null = use plan default)
    siteLimits: {
      type: Number,
      default: null,
    },

    // FR-9.4: Per-client feature flag overrides set by SuperAdmin
    // Keys match PLANS[plan].features — true/false overrides plan default
    featuresOverride: {
      type: Object,
      default: {},
    },

    packageStart: Date,
    packageEnd: Date,

    /* =====================
       DEDICATED DB (SRS §10)
       ENTERPRISE plan only.
       connectionString is stored AES-256-GCM encrypted (see encryption.util.js).
    ===================== */
    dbConfig: {
      mode: {
        type: String,
        enum: ["shared", "dedicated"],
        default: "shared",
      },
      // Encrypted MongoDB URI — decrypt with encryption.util.decrypt()
      connectionString: {
        type: String,
        default: null,
        select: false, // never returned in API responses
      },
      dbName: {
        type: String,
        default: null,
      },
    },

    /* =====================
       CREDIT SYSTEM (FR-7)
    ===================== */
    creditBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Alert threshold — notify when balance drops below this
    creditThreshold: {
      type: Number,
      default: 10,
    },

    /* =====================
       PASSWORD RESET (OTP)
       Client-only forgot password flow
    ===================== */
    passwordResetOtp: {
      type: String,
      select: false,
    },
    passwordResetOtpExpiry: {
      type: Date,
      select: false,
    },
    passwordResetOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

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
