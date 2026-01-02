
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const clientSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    clientname: {
      type: String,
      require: false,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      require: true,
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

    role: {
      type: String,
      enum: ["client", "admin"],
      default: "client",
    },

    clientCode: {
      type: String,
      unique: true,
      index: true,
    },

    packageType: {
      type: String,
      default: "Standard",
    },

    packageStart: Date,
    packageEnd: Date,

    isActive: {
      type: Boolean,
      default: true,
    },

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

/* ✅ Prevent model overwrite error */
export default mongoose.models.Client ||
  mongoose.model("Client", clientSchema);
