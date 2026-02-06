import RefreshToken from "../models/RefreshToken.model.js";
import { generateAccessToken, generateRefreshToken, verifyRefresh } from "../utils/token.util.js";
import { comparePassword, hashPassword } from "../utils/hash.util.js";

// ✅ STATIC MODEL IMPORTS (IMPORTANT)
import SuperAdmin from "../models/superadmin.model.js";
import Client from "../models/Client.model.js";
import ProjectManager from "../models/ProjectManager.model.js";
import Supervisor from "../models/supervisor.model.js";
import { PLANS } from "../config/plans.js";
import { getPlanFeatures } from "../utils/planFeatures.util.js";
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
   LOGIN (EMAIL OR PHONE)
====================================================== */
/* ======================================================
   LOGIN (EMAIL OR PHONE)
====================================================== */
export const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        message: "Email/Phone and password are required",
      });
    }

    /* ================= IDENTIFIER ================= */
    const isEmail = identifier.includes("@");
    const query = isEmail
      ? { email: identifier.toLowerCase().trim() }
      : { mobile: identifier.trim() };

    /* ================= FIND USER ================= */
    let user =
      (await SuperAdmin.findOne(query).select("+password")) ||
      (await Client.findOne(query).select("+password")) ||
      (await ProjectManager.findOne(query).select("+password")) ||
      (await Supervisor.findOne(query).select("+password"));

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Your account is deactivated. Please contact SuperAdmin.",
      });
    }

    /* ================= PASSWORD ================= */
    const matchResult = await comparePassword(password, user.password);
    if (!matchResult) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (matchResult === "PLAIN_MATCH") {
      user.password = await hashPassword(password);
      await user.save();
    }

    /* =====================================================
       🔒 CLIENT + PLAN CHECK (CLIENT / PM / SUPERVISOR)
    ===================================================== */
    let client = null;

    if (user.role === "client") {
      client = user;
    }

    if (
      (user.role === "project_manager" || user.role === "supervisor") &&
      user.clientId
    ) {
      client = await Client.findById(user.clientId);
    }

    if (
      client &&
      client.packageEnd &&
      new Date(client.packageEnd) < new Date()
    ) {
      return res.status(403).json({
        message:
          "Your subscription plan has expired. Please contact SuperAdmin.",
        code: "PLAN_EXPIRED",
        expiredOn: client.packageEnd,
      });
    }

    /* =====================================================
       🎯 PLAN FEATURES (BACKEND DECIDES)
    ===================================================== */
    const features = client
      ? getPlanFeatures(client.packageType)
      : null;

    /* ================= TOKEN ================= */
    let clientId = user.clientId || null;
    if (user.role === "client") clientId = user._id;

    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      clientId,
      siteId: user.siteId || null,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await RefreshToken.deleteMany({ userId: user._id });
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    /* ================= RESPONSE ================= */
    res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        clientId,
        packageType: client?.packageType || null,
      },
      features, // 🔥 FRONTEND USE THIS
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
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token" });
    }

    // Verify the refresh token first
    let decoded;
    try {
      decoded = verifyRefresh(refreshToken);
    } catch (err) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Find stored refresh token
    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Find the user based on role
    const UserModel = ROLE_MODEL_MAP[decoded.role];
    if (!UserModel) {
      return res.status(401).json({ message: "Invalid user role" });
    }

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if account is active
    if (user.isActive === false) {
      return res.status(403).json({
        message: "Account deactivated",
      });
    }

    // Generate new access token
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
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/", // ✅ VERY IMPORTANT
    });

    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};


/* ======================================================
   REGISTER SUPER ADMIN (ONE TIME)
====================================================== */
export const registerSuperAdmin = async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body || {};

    // 1️⃣ Required fields check
    if (!fullName || !email || !password) {
      return res.status(400).json({
        message: "Full name, email and password are required",
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
    if (existing > 2) {
      return res.status(403).json({
        message: "SuperAdmin already exists",
      });
    }

    // 5️⃣ Prevent duplicate email
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
      fullName,                  // ✅ FIXED
      email,
      password: hashedPassword,
      role: "superadmin",
    });

    return res.status(201).json({
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
