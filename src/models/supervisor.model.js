import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: String,
    mobile: { type: String, required: true },
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: "supervisor" },
    projectManagerId: { type: mongoose.Schema.Types.ObjectId, ref: "ProjectManager" },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    shiftStart: String, // "08:00"
    shiftEnd: String,   // "16:00"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Supervisor", schema);
