import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    photos: { type: [String], default: [] }, // Array of URLs/base64
    video: { type: String, default: "" },
    challanImage: { type: String, required: false },
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    // Core IDs
    tripId: {
      type: String,
      // required: true,
      unique: true
    },
    clientId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Client", 
      required: true 
    },
    siteId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Site", 
      required: true 
    },
    vendorId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Vendor", 
      required: false 
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supervisor',
    
    },
    projectManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      
    },

    // Vehicle & ANPR Details
    plateText: { 
      type: String, 
      required: true,
      immutable: true // Cannot be edited after creation
    },
    anprImage: { type: String, default: "" },

    // Load & Trip Details
    loadStatus: { 
      type: String, 
      // enum: ["FULL", "PARTIAL", "EMPTY"], 
      // required: true 
    },
    purpose: String,
    notes: String,

    // Time Tracking
    entryAt: { 
      type: Date, 
      required: true,
      alias: 'entryTime' // Support both field names
    },
    exitAt: { 
      type: Date, 
      default: null,
      alias: 'exitTime'
    },

    // Gate Information
    entryGate: String,
    exitGate: String,

    // Media Documents
    entryMedia: { 
      type: mediaSchema, 
      required: true 
    },
    exitMedia: { 
      type: mediaSchema, 
      default: null 
    },

    // Status
    status: { 
      type: String, 
      enum: ["INSIDE", "EXITED", "active", "completed", "cancelled"], 
      default: "INSIDE"
    },

    // Creator Reference
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Supervisor", 
      
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for backward compatibility
tripSchema.virtual('entryTime').get(function() {
  return this.entryAt;
});

tripSchema.virtual('exitTime').get(function() {
  return this.exitAt;
});

// Auto-generate tripId before save
tripSchema.pre('save', async function(next) {
  if (!this.tripId) {
    const count = await mongoose.model('Trip').countDocuments();
    this.tripId = `TR-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Index for better query performance
// tripSchema.index({ tripId: 1 });
tripSchema.index({ siteId: 1, status: 1 });
tripSchema.index({ vendorId: 1 });
tripSchema.index({ projectManagerId: 1, entryAt: -1 });
tripSchema.index({ plateText: 1 });

// Method to calculate trip duration
tripSchema.methods.getDuration = function() {
  if (!this.exitAt) return null;
  const diff = new Date(this.exitAt) - new Date(this.entryAt);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, totalMinutes: Math.floor(diff / (1000 * 60)) };
};

// Static method to get trip by plate number
tripSchema.statics.findByPlate = function(plateText) {
  return this.findOne({ plateText, status: { $in: ['INSIDE', 'active'] } });
};

export default mongoose.model("Trip", tripSchema);