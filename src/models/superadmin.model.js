import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: "superadmin" },
  },
  { timestamps: true }
);

export default mongoose.model("SuperAdmin", schema);
