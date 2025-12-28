// import RefreshToken from "../models/RefreshToken.model.js";
// import { generateAccessToken, generateRefreshToken, verifyRefresh } from "../utils/token.util.js";
// import { comparePassword, hashPassword } from "../utils/hash.util.js";
// import { logAudit } from "../middlewares/audit.middleware.js";
// import SuperAdmin from "../models/superadmin.model.js"; 
// const getModelByRole = async (role) => {
//   if (role === "superadmin") {
//     return (await import("../models/superadmin.model.js")).default;
//   }

//   if (role === "admin" || role === "client") {
//     return (await import("../models/Client.model.js")).default;
//   }

//   if (role === "project_manager") {
//     return (await import("../models/ProjectManager.model.js")).default;
//   }

//   if (role === "supervisor") {
//     return (await import("../models/supervisor.model.js")).default;
//   }

//   return null;
// };

// export const login = async (req, res, next) => {
//   try {
//     const { email, password, role } = req.body;

//     const Model = await getModelByRole(role);
//     if (!Model) {
//       return res.status(400).json({ message: "Invalid role" });
//     }

//     // 🔥 IMPORTANT FIX HERE
//     const user = await Model.findOne({ email }).select("+password");
//     if (!user) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const ok = await comparePassword(password, user.password);
//     if (!ok) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const payload = {
//       id: user._id,
//       role: user.role,
//       clientId: user.clientId || null,
//     };

//     const accessToken = generateAccessToken(payload);
//     const refreshToken = generateRefreshToken(payload);

//     await RefreshToken.create({
//       userId: user._id,
//       role: user.role,
//       token: refreshToken,
//       expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//     });

//     res.json({
//       accessToken,
//       refreshToken,
//       user: {
//         id: user._id,
//         email: user.email,
//         role: user.role,
//       },
//     });
//   } catch (e) {
//     next(e);
//   }
// };


// export const refresh = async (req, res, next) => {
//   try {
//     const { refreshToken } = req.body;
//     const found = await RefreshToken.findOne({ token: refreshToken });
//     if (!found) return res.status(401).json({ message: "Invalid refresh token" });

//     const decoded = verifyRefresh(refreshToken);

//     const newAccess = generateAccessToken({
//       id: decoded.id,
//       role: decoded.role,
//       clientId: decoded.clientId || null,
//     });

//     res.json({ accessToken: newAccess });
//   } catch (e) {
//     next(e);
//   }
// };

// export const logout = async (req, res, next) => {
//   try {
//     const { refreshToken } = req.body;
//     await RefreshToken.deleteOne({ token: refreshToken });

//     await logAudit({ req, action: "LOGOUT", module: "AUTH" });

//     res.json({ message: "Logged out" });
//   } catch (e) {
//     next(e);
//   }
// };
// export const registerSuperAdmin = async (req, res, next) => {
//   try {
//     const { name, email, password } = req.body;

//     // ❗ Allow only ONE SuperAdmin
//     const existing = await SuperAdmin.countDocuments();
//     if (existing > 0) {
//       return res.status(403).json({
//         message: "SuperAdmin already exists. Registration blocked."
//       });
//     }

//     const hashedPassword = await hashPassword(password);

//     const superAdmin = await SuperAdmin.create({
//       name,
//       email,
//       password: hashedPassword,
//       role: "superadmin",
//     });

//     await logAudit({
//       req,
//       action: "REGISTER",
//       module: "SUPERADMIN",
//       newValue: { email }
//     });

//     res.status(201).json({
//       message: "SuperAdmin registered successfully",
//       user: {
//         id: superAdmin._id,
//         name: superAdmin.name,
//         email: superAdmin.email,
//         role: superAdmin.role
//       }
//     });
//   } catch (e) {
//     next(e);
//   }
// };

import RefreshToken from "../models/RefreshToken.model.js";
import { generateAccessToken, generateRefreshToken, verifyRefresh } from "../utils/token.util.js";
import { comparePassword, hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";

// ✅ STATIC MODEL IMPORTS (IMPORTANT)
import SuperAdmin from "../models/superadmin.model.js";
import Client from "../models/Client.model.js";
import ProjectManager from "../models/ProjectManager.model.js";
import Supervisor from "../models/supervisor.model.js";

/* ======================================================
   ROLE → MODEL MAP (SAFE)
====================================================== */
const ROLE_MODEL_MAP = {
  superadmin: SuperAdmin,
  client: Client,
  project_manager: ProjectManager,
  supervisor: Supervisor,
};

/* ======================================================
   LOGIN
====================================================== */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    // 1️⃣ Validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // 2️⃣ Find user in ALL roles (priority order)
    let user =
      (await SuperAdmin.findOne({ email }).select("+password")) ||
      (await Client.findOne({ email }).select("+password")) ||
      (await ProjectManager.findOne({ email }).select("+password")) ||
      (await Supervisor.findOne({ email }).select("+password"));

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 3️⃣ Password check
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 4️⃣ clientId logic
    let clientId = null;
    if (user.role === "client") {
      clientId = user._id;
    } else if (user.clientId) {
      clientId = user.clientId;
    }

    // 5️⃣ Token payload
    const payload = {
      id: user._id,
      role: user.role,   // role backend se aayega
      clientId,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // 6️⃣ Rotate refresh tokens
    await RefreshToken.deleteMany({ userId: user._id });
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await logAudit({
      req,
      action: "LOGIN",
      module: "AUTH",
      newValue: { email: user.email, role: user.role },
    });

    user.password = undefined;

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        clientId,
      },
    });
  } catch (err) {
    next(err);
  }
};
/* ======================================================
   REFRESH TOKEN
====================================================== */
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const decoded = verifyRefresh(refreshToken);

    const newAccessToken = generateAccessToken({
      id: decoded.id,
      role: decoded.role,
      clientId: decoded.clientId,
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   LOGOUT
====================================================== */
export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    await logAudit({
      req,
      action: "LOGOUT",
      module: "AUTH",
    });

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   REGISTER SUPER ADMIN (ONE TIME)
====================================================== */
export const registerSuperAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    // 1️⃣ Required fields check
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    // 2️⃣ Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format",
      });
    }

    // 3️⃣ Password strength
    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    // 4️⃣ Allow only ONE SuperAdmin
    const existing = await SuperAdmin.countDocuments();
    if (existing > 0) {
      return res.status(403).json({
        message: "SuperAdmin already exists",
      });
    }

    // 5️⃣ Prevent duplicate email (extra safety)
    const emailExists = await SuperAdmin.findOne({ email });
    if (emailExists) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    // 6️⃣ Hash password
    const hashedPassword = await hashPassword(password);

    // 7️⃣ Create SuperAdmin
    const superAdmin = await SuperAdmin.create({
      name,
      email,
      password: hashedPassword,
      role: "superadmin",
    });

    res.status(201).json({
      message: "SuperAdmin registered successfully",
      user: {
        id: superAdmin._id,
        email: superAdmin.email,
        role: superAdmin.role,
      },
    });
  } catch (err) {
    next(err);
  }
};
