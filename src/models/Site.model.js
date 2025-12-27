import mongoose from "mongoose";

const siteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: String,
    siteCode: String,
    isActive: { type: Boolean, default: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", }
  },
  { timestamps: true }
);

export default mongoose.model("Site", siteSchema);
