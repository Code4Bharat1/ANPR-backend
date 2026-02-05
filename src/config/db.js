// import mongoose from "mongoose";

// export default async function connectDB() {
//   try {
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log("✅ MongoDB connected");
//   } catch (e) {
//     console.error("❌ MongoDB connection failed:", e.message);
//     process.exit(1);
//   }
// }

import mongoose from "mongoose";

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined");
    }

    await mongoose.connect(process.env.MONGO_URI, 
      
    );

    console.log("✅ MongoDB connected");

    mongoose.connection.on("error", err => {
      console.error("❌ MongoDB error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });

  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
