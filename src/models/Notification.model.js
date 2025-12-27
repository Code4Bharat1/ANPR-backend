import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    type: { type: String, enum: ["SYSTEM", "ALERT", "INFO"], default: "INFO" },
    isRead: { type: Boolean, default: false },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
