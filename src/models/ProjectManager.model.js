import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: "project_manager" },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
  },
  { timestamps: true }
);

export default mongoose.model("ProjectManager", schema);
