import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    role: String,
    token: String,
    expiresAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("RefreshToken", schema);
