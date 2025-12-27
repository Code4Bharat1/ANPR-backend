import mongoose from "mongoose";

const appSettingsSchema = new mongoose.Schema(
  {
    maintenanceMode: { type: Boolean, default: false },
    allowSuperAdminRegister: { type: Boolean, default: true }, // first-time setup
    defaultRetentionDays: { type: Number, default: 90 },
    supportEmail: { type: String, default: "support@anpr.com" },
    supportPhone: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", appSettingsSchema);
