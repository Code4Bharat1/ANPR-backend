import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const schema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },

    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,     // 🔥 password kabhi response me nahi aayega
    },

    role: {
      type: String,
      default: "client",
      enum: ["client", "admin"],
    },

    clientCode: {
      type: String,
      unique: true,
      required: true,
    },

    packageType: { type: String, default: "Standard" },
    packageStart: Date,
    packageEnd: Date,

    isActive: { type: Boolean, default: true },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
    },
  },
  { timestamps: true }
);

/* 🔐 AUTO HASH PASSWORD */
schema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* 🆔 AUTO GENERATE CLIENT CODE */
schema.pre("validate", async function (next) {
  if (!this.clientCode) {
    this.clientCode = "CL-" + Math.floor(100000 + Math.random() * 900000);
  }
  next();
});

export default mongoose.model("Client", schema);
