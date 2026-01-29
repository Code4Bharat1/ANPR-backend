// import cookieParser from "cookie-parser";
// import express from "express";
// import cors from "cors";
// import rateLimit from "express-rate-limit";
// import helmet from "helmet";
// import dotenv from "dotenv";

// import connectDB from "./src/config/db.js";

// // Routes
// import authRoutes from "./src/routes/auth.routes.js";
// import clientRoutes from "./src/routes/client.routes.js";
// import siteRoutes from "./src/routes/site.routes.js";
// import userRoutes from "./src/routes/user.routes.js";
// import vendorRoutes from "./src/routes/vendor.routes.js";
// import deviceRoutes from "./src/routes/device.routes.js";
// import tripRoutes from "./src/routes/trip.routes.js";
// import reportRoutes from "./src/routes/report.routes.js";
// import superAdminRoutes from "./src/routes/superadmin.routes.js";
// import projectRoutes from "./src/routes/projectManager.routes.js";
// import supervisorRoutes from "./src/routes/supervisor.routes.js";
// import uploadRoutes from "./src/routes/upload.routes.js";
// import plateRoutes from "./src/routes/plate.routes.js";

// // Models (for retention cleanup)
// import Trip from "./src/models/Trip.model.js";
// import AuditLog from "./src/models/AuditLog.model.js";
// import RefreshToken from "./src/models/RefreshToken.model.js";

// // Middleware
// import { errorMiddleware } from "./src/middlewares/error.middleware.js";

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 5000;

// /* =======================
//    TRUST PROXY
// ======================= */
// app.set("trust proxy", 1);

// /* =======================
//    CORS (FIRST — VERY IMPORTANT)
// ======================= */
// const allowedOrigins = [
//   "http://localhost:3000",
//   "https://anpr.nexcorealliance.com",
//   "https://www.anpr.nexcorealliance.com",
//   "https://www.webhooks.nexcorealliance.com",
// ];

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       // Allow Postman / server-to-server
//       if (!origin) return callback(null, true);

//       if (allowedOrigins.includes(origin)) {
//         return callback(null, origin);
//       }

//       return callback(new Error("Not allowed by CORS"));
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// // ✅ PRE-FLIGHT REQUESTS (MANDATORY)
// app.options("*", cors());

// /* =======================
//    FORCE HTTPS (OPTIONS SAFE)
// ======================= */
// app.use((req, res, next) => {
//   // ❗ Never redirect OPTIONS
//   if (req.method === "OPTIONS") {
//     return res.sendStatus(204);
//   }

//   if (
//     process.env.NODE_ENV === "production" &&
//     req.headers["x-forwarded-proto"] !== "https"
//   ) {
//     return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
//   }
//   next();
// });

// /* =======================
//    SECURITY HEADERS
// ======================= */
// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       directives: {
//         defaultSrc: ["'self'"],
//         scriptSrc: ["'self'"],
//         imgSrc: ["'self'", "data:"],
//         connectSrc: [
//           "'self'",
//           "https://api-anpr.nexcorealliance.com", // ✅ IMPORTANT
//         ],
//         objectSrc: ["'none'"],
//       },
//     },
//     frameguard: { action: "deny" },
//     referrerPolicy: { policy: "strict-origin-when-cross-origin" },
//     hsts: {
//       maxAge: 31536000,
//       includeSubDomains: true,
//       preload: true,
//     },
//   })
// );

// /* =======================
//    BODY PARSERS
// ======================= */
// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

// /* =======================
//    GLOBAL RATE LIMIT
// ======================= */
// app.use(
//   rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 500,
//     standardHeaders: true,
//     legacyHeaders: false,
//   })
// );

// /* =======================
//    HEALTH CHECK
// ======================= */
// app.get("/", (req, res) => {
//   res.json({ status: "OK", name: "ANPR Backend" });
// });

// /* =======================
//    API ROUTES
// ======================= */
// app.use("/api/auth", authRoutes);
// app.use("/api/superadmin", superAdminRoutes);
// app.use("/api/client-admin", clientRoutes);
// app.use("/api/sites", siteRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/vendors", vendorRoutes);
// app.use("/api/devices", deviceRoutes);
// app.use("/api/trips", tripRoutes);
// app.use("/api/reports", reportRoutes);
// app.use("/api/project", projectRoutes);
// app.use("/api/supervisor", supervisorRoutes);
// app.use("/api/uploads", uploadRoutes);
// app.use("/api/plate", plateRoutes);

// /* =======================
//    ERROR HANDLER (LAST)
// ======================= */
// app.use(errorMiddleware);

// /* =======================
//    START SERVER
// ======================= */
// await connectDB();

// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });

// /* =======================
//    DATA RETENTION CLEANUP
// ======================= */
// const retentionDays = Number(process.env.DATA_RETENTION_DAYS || 90);
// const ms = 24 * 60 * 60 * 1000;

// setInterval(async () => {
//   try {
//     const cutoff = new Date(Date.now() - retentionDays * ms);

//     await Trip.deleteMany({ createdAt: { $lt: cutoff } });
//     await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
//     await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });

//     console.log("🧹 Retention cleanup done");
//   } catch (e) {
//     console.error("❌ Retention cleanup error:", e.message);
//   }
// }, 6 * 60 * 60 * 1000);

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

// Models
import Trip from "./src/models/Trip.model.js";
import AuditLog from "./src/models/AuditLog.model.js";
import RefreshToken from "./src/models/RefreshToken.model.js";

// Middleware
import { errorMiddleware } from "./src/middlewares/error.middleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* =======================
   TRUST PROXY
======================= */
app.set("trust proxy", 1);

/* =======================
   CORS (FIRST)
======================= */
const allowedOrigins = [
  "http://localhost:3000",
  "https://anpr.nexcorealliance.com",
  "https://www.anpr.nexcorealliance.com",
  "https://www.webhooks.nexcorealliance.com",
  "http://192.168.0.100",
];

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       if (!origin) return callback(null, true); // Postman / server calls

//       if (allowedOrigins.includes(origin)) {
//         return callback(null, origin);
//       }

//       return callback(new Error("Not allowed by CORS"));
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: [
//       "Content-Type",
//       "Authorization",
//       "X-Alpha",
//       "X-Salt",
//       "X-Cue",
//     ],
//   }),
// );

// ✅ FIXED PREFLIGHT HANDLER
// app.options(/.*/, cors());

/* =======================
   FORCE HTTPS (OPTIONS SAFE)
======================= */

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Alpha",
      "X-Salt",
      "X-Cue",
      "x-alpha",
      "x-salt",
      "x-cue",
      "x-camera-ip",
    ],
  }),
);

// ✅ Let cors handle ALL preflight requests
app.options(/.*/, cors());

app.use((req, res, next) => {
  // if (req.method === "OPTIONS") {
  //   return res.sendStatus(204);
  // }

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
        connectSrc: ["'self'", "https://api-anpr.nexcorealliance.com"],
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
  }),
);

/* =======================
   BODY PARSERS
======================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* =======================
   RATE LIMIT
======================= */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/* =======================
   HEALTH CHECK
======================= */
app.get("/", (req, res) => {
  res.json({ status: "OK", name: "ANPR Backend" });
});

/* =======================
   ROUTES
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

const DEFAULT_CAMERA_IP = "192.168.0.100";

function resolveCameraIP(req) {
  return req.headers["x-camera-ip"] || DEFAULT_CAMERA_IP;
}

app.post("/api/v1/auth/login", async (req, res) => {
  try {
    const cameraIP = resolveCameraIP(req);

    const response = await fetch(`http://${cameraIP}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Alpha": "21",
        "X-Salt": "683239",
        "X-Cue": "34db55e07f7b39df480284397f7f42ec",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Auth proxy error:", err);
    res.status(500).json({ message: "Auth proxy failed" });
  }
});

app.post("/api/v1/barrier/actuate", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Missing Authorization token" });
    }

    const cameraIP = resolveCameraIP(req);

    // 🔥 HARD-CODED BODY (unchanged)
    const body = {
      location: "entry",
      action: "up",
    };

    const response = await fetch(
      `http://${cameraIP}/api/v1/analytics/barrier`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Barrier proxy error:", err);
    res.status(500).json({ message: "Barrier proxy failed" });
  }
});

/* =======================
   ERROR HANDLER
======================= */
app.use(errorMiddleware);

/* =======================
   START SERVER
======================= */
await connectDB();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* =======================
   DATA RETENTION CLEANUP
======================= */
const retentionDays = Number(process.env.DATA_RETENTION_DAYS || 90);
const ms = 24 * 60 * 60 * 1000;

setInterval(
  async () => {
    try {
      const cutoff = new Date(Date.now() - retentionDays * ms);

      await Trip.deleteMany({ createdAt: { $lt: cutoff } });
      await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
      await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });

      console.log("🧹 Retention cleanup done");
    } catch (e) {
      console.error("❌ Retention cleanup error:", e.message);
    }
  },
  6 * 60 * 60 * 1000,
);
