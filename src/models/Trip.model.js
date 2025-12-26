import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    photos: { type: [String], default: [] }, // store URLs/base64 placeholders
    video: { type: String, default: "" },
    challanImage: { type: String, required: true },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },

    plateText: { type: String, required: true }, // immutable (no edit)
    anprImage: { type: String, default: "" },

    loadStatus: { type: String, enum: ["FULL", "PARTIAL", "EMPTY"], required: true },
    notes: String,

    entryAt: { type: Date, required: true },
    exitAt: { type: Date, default: null },

    entryMedia: { type: mediaSchema, required: true },
    exitMedia: { type: mediaSchema, default: null },

    status: { type: String, enum: ["INSIDE", "EXITED"], default: "INSIDE" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Supervisor", required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Trip", schema);
