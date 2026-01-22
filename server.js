import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import dotenv from "dotenv";

import connectDB from "./src/config/db.js";

// Routes
import authRoutes from "./src/routes/auth.routes.js";
import clientRoutes from "./src/routes/client.routes.js";
import siteRoutes from "./src/routes/site.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import vendorRoutes from "./src/routes/vendor.routes.js";
import deviceRoutes from "./src/routes/device.routes.js";
import tripRoutes from "./src/routes/trip.routes.js";
import reportRoutes from "./src/routes/report.routes.js";
import superAdminRoutes from "./src/routes/superadmin.routes.js";
import projectRoutes from "./src/routes/projectManager.routes.js";
import supervisorRoutes from "./src/routes/supervisor.routes.js";
import uploadRoutes from "./src/routes/upload.routes.js";
import plateRoutes from "./src/routes/plate.routes.js";

// Models (for retention cleanup)
import Trip from "./src/models/Trip.model.js";
import AuditLog from "./src/models/AuditLog.model.js";
import RefreshToken from "./src/models/RefreshToken.model.js";

// Middlewares
import { errorMiddleware } from "./src/middlewares/error.middleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* =======================
   TRUST PROXY (IMPORTANT)
======================= */
app.set("trust proxy", 1);

/* =======================
   FORCE HTTPS
======================= */
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" &&
    req.headers["x-forwarded-proto"] !== "https"
  ) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

/* =======================
   SECURITY HEADERS
======================= */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

/* =======================
   CORS (STRICT)
======================= */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://anpr.nexcorealliance.com",
      "https://www.anpr.nexcorealliance.com",
      "https://www.webhooks.nexcorealliance.com",
    ],
    credentials: true,
  })
);

/* =======================
   BODY PARSERS
======================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* =======================
   GLOBAL RATE LIMIT
======================= */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// /* =======================
//    LOGIN RATE LIMIT (CRITICAL)
// ======================= */
// const loginLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 5,
//   message: "Too many login attempts. Try again later.",
// });

// app.use("/api/auth/login", loginLimiter);

/* =======================
   HEALTH CHECK
======================= */
app.get("/", (req, res) =>
  res.json({ status: "OK", name: "ANPR Backend" })
);

/* =======================
   API ROUTES
======================= */
app.use("/api/auth", authRoutes);
app.use("/api/superadmin", superAdminRoutes);
app.use("/api/client-admin", clientRoutes);
app.use("/api/sites", siteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/supervisor", supervisorRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/plate", plateRoutes);

/* =======================
   ERROR HANDLER
======================= */
app.use(errorMiddleware);

/* =======================
   START SERVER
======================= */
await connectDB();

app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

/* =======================
   DATA RETENTION CLEANUP
======================= */
const retentionDays = Number(process.env.DATA_RETENTION_DAYS || 90);
const ms = 24 * 60 * 60 * 1000;

setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - retentionDays * ms);

    await Trip.deleteMany({ createdAt: { $lt: cutoff } });
    await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });

    console.log("🧹 Retention cleanup done");
  } catch (e) {
    console.error("❌ Retention cleanup error:", e.message);
  }
}, 6 * 60 * 60 * 1000);
