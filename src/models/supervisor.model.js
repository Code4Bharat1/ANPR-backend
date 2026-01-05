import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    mobile: { type: String, required: true },

    email: { type: String, unique: true, lowercase: true },

    password: { type: String, required: true },

    role: {
      type: String,
      default: "supervisor",
      enum: ["supervisor"],
    },

    projectManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectManager",
      required: true, // ✅ ONLY HERE
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

    shiftStart: String,
    shiftEnd: String,

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Supervisor", schema);
