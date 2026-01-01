import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    unique: true
  },
  company: {
    name: { type: String, required: true },
    address: { type: String },
    supportEmail: { type: String },
    logo: { type: String } // URL or path to logo
  },
    expiryDate: { type: Date }
  
}, { 
  timestamps: true 
});

export default mongoose.model('adminSettings', settingsSchema);