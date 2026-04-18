import crypto from "crypto";
import RefreshToken from "../models/RefreshToken.model.js";
import { generateAccessToken, generateRefreshToken, verifyRefresh } from "../utils/token.util.js";
import { comparePassword, hashPassword } from "../utils/hash.util.js";
import { sendPasswordResetOtp } from "../utils/email.util.js";

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

    if (!fullName || !email || !password) {
      return res.status(400).json({
        message: "Full name, email and password are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const existing = await SuperAdmin.countDocuments();
    if (existing > 2) {
      return res.status(403).json({
        message: "SuperAdmin already exists",
      });
    }

    const emailExists = await SuperAdmin.findOne({ email });
    if (emailExists) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    // ❌ REMOVE THIS
    // const hashedPassword = await hashPassword(password);

    // ✅ Just pass plain password
    const superAdmin = await SuperAdmin.create({
      fullName,
      email,
      password, // ✅ schema will hash it
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


/* ======================================================
   FORGOT PASSWORD — STEP 1: REQUEST OTP (CLIENT ONLY)
====================================================== */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Only look up in Client model — no other roles allowed
    const client = await Client.findOne({ email: normalizedEmail }).select(
      "+passwordResetOtp +passwordResetOtpExpiry +passwordResetOtpAttempts"
    );

    // Explicitly reject non-client emails with a distinct code
    if (!client || client.isActive === false) {
      return res.status(404).json({
        code: "NOT_CLIENT",
        message: "No active client account found with this email.",
      });
    }

    // Rate-limit: block if a valid OTP was sent less than 60 seconds ago
    if (
      client.passwordResetOtpExpiry &&
      client.passwordResetOtpExpiry > new Date(Date.now() + 9 * 60 * 1000)
    ) {
      return res.status(429).json({
        message: "Please wait before requesting another OTP.",
      });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    client.passwordResetOtp = otp;
    client.passwordResetOtpExpiry = otpExpiry;
    client.passwordResetOtpAttempts = 0;
    await client.save();

    await sendPasswordResetOtp(normalizedEmail, otp);

    return res.json({
      message: "OTP sent successfully.",
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   FORGOT PASSWORD — STEP 2: VERIFY OTP (CLIENT ONLY)
====================================================== */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const client = await Client.findOne({ email: normalizedEmail }).select(
      "+passwordResetOtp +passwordResetOtpExpiry +passwordResetOtpAttempts"
    );

    if (!client) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Check expiry
    if (!client.passwordResetOtpExpiry || client.passwordResetOtpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Check attempts (max 5)
    if (client.passwordResetOtpAttempts >= 5) {
      // Invalidate OTP
      client.passwordResetOtp = undefined;
      client.passwordResetOtpExpiry = undefined;
      client.passwordResetOtpAttempts = 0;
      await client.save();
      return res.status(400).json({
        message: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    if (client.passwordResetOtp !== otp.trim()) {
      client.passwordResetOtpAttempts += 1;
      await client.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP is valid — issue a short-lived reset token (store as OTP field reuse)
    // We'll use a signed token approach: generate a random token, store its hash
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Reuse OTP field to store the reset token hash, keep same expiry window (10 min)
    client.passwordResetOtp = `VERIFIED:${resetTokenHash}`;
    client.passwordResetOtpAttempts = 0;
    await client.save();

    return res.json({
      message: "OTP verified successfully",
      resetToken, // send plain token to frontend
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   FORGOT PASSWORD — STEP 3: RESET PASSWORD (CLIENT ONLY)
====================================================== */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        message: "Email, reset token, and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const client = await Client.findOne({ email: normalizedEmail }).select(
      "+password +passwordResetOtp +passwordResetOtpExpiry +passwordResetOtpAttempts"
    );

    if (!client) {
      return res.status(400).json({ message: "Invalid reset request" });
    }

    // Check expiry
    if (!client.passwordResetOtpExpiry || client.passwordResetOtpExpiry < new Date()) {
      return res.status(400).json({ message: "Reset session expired. Please start over." });
    }

    // Validate reset token
    const expectedHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const storedValue = client.passwordResetOtp || "";

    if (!storedValue.startsWith("VERIFIED:") || storedValue !== `VERIFIED:${expectedHash}`) {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    // Update password (pre-save hook will hash it)
    client.password = newPassword;
    client.passwordResetOtp = undefined;
    client.passwordResetOtpExpiry = undefined;
    client.passwordResetOtpAttempts = 0;
    await client.save();

    // Invalidate all refresh tokens for this client
    await RefreshToken.deleteMany({ userId: client._id });

    return res.json({ message: "Password reset successfully. Please log in." });
  } catch (err) {
    next(err);
  }
};
