// Plate.model.js
import mongoose from "mongoose";

const PlateSchema = new mongoose.Schema({
  plate: {
    type: String,
    required: true,
    trim: true,
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  vehicle: {
    type: Object,
    default: {}
  },
  direction: {
    type: Number,
    default: null
  },
  region: {
    type: String,
    default: null
  },
  box: {
    type: Object,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true
});

// Index for faster queries
PlateSchema.index({ plate: 1 });
PlateSchema.index({ createdAt: -1 });

export default mongoose.model("Plate", PlateSchema);