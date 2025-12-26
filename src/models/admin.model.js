import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: "admin" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
  },
  { timestamps: true }
);

export default mongoose.model("Admin", schema);
