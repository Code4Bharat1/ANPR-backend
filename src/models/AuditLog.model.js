import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    role: String,
    action: String,
    module: String,
    oldValue: Object,
    newValue: Object,
    ip: String,
  },
  { timestamps: true }
);

export default mongoose.model("AuditLog", schema);
