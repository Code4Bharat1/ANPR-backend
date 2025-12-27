// models/projectManager.model.js
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    mobile: { type: String, required: true },

    password: { type: String, required: true },

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

    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    assignedSites: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Site" },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("ProjectManager", schema);
