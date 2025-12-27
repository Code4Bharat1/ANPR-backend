// import mongoose from "mongoose";

// const schema = new mongoose.Schema(
//   {
//     name: String,
//     email: { type: String, unique: true },
//     password: String,
//     role: { type: String, default: "admin" },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
//     clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
//   },
//   { timestamps: true }
// );

// export default mongoose.model("Admin", schema);

import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      default: "admin",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
    },
  },
  { timestamps: true }
);

// ✅ SAFE MODEL EXPORT (FIXES OverwriteModelError)
export default mongoose.models.Admin ||
  mongoose.model("Admin", adminSchema);
