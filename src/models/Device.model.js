import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site" },
    type: { type: String, enum: ["ANPR", "BARRIER"], required: true },
    serialNo: { type: String, unique: true, required: true },
    isOnline: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Device", schema);
