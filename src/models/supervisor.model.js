import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, unique: true, lowercase: true },
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
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* 🔐 HASH PASSWORD */
schema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ✅ CORRECT MODEL NAME */
export default mongoose.models.Supervisor ||
  mongoose.model("Supervisor", schema);
