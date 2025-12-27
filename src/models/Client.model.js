import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    clientCode: { type: String, unique: true }, // e.g. CL-8921
    packageType: { type: String, default: "Standard" }, // Enterprise Gold etc.
    packageStart: Date,
    packageEnd: Date,
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
  },
  { timestamps: true }
);

export default mongoose.model("Client", schema);
