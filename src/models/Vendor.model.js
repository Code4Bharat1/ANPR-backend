import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  assignedSites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  }],
  projectManagerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  totalTrips: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

export default mongoose.model('Vendor', vendorSchema);