import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    name: { type: String, required: true },
    phone: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", schema);
