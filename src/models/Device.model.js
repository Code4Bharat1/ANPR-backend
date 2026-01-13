import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    // Client association
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true // Ensures that every device is linked to a client
    },

    // Site association
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true // Ensures that each device is assigned to a site
    },

    // Device type: "ANPR" or "BARRIER"
    devicetype: {
      type: String,
      enum: ["ANPR", "BARRIER", "BIOMETRIC"],
    },


    // Serial number for the device (must be unique)
    serialNo: {
      type: String,
      unique: true,
      required: true
    },

    // Device's online status (whether it's currently online or offline)
    isOnline: {
      type: Boolean,
      default: false
    },

    // Whether the device is enabled for use (can be toggled)
    isEnabled: {
      type: Boolean,
      default: true
    },

    // IP Address (if relevant for remote devices or network-based devices)
    ipAddress: {
      type: String,
      match: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/ // Basic regex for IP format
    },

    // Last known activity or status update timestamp
    lastActive: {
      type: Date,
      default: Date.now
    },

    // Notes for any additional details regarding the device (could be a text field)
    notes: {
      type: String
    }
  },
  { timestamps: true } // Automatically includes createdAt and updatedAt
);

export default mongoose.model("Device", deviceSchema);


