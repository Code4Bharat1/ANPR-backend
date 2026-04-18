
import express from "express";
import rateLimit from "express-rate-limit";
import { login, refresh, logout, registerSuperAdmin, forgotPassword, verifyOtp, resetPassword } from "../controllers/auth.controller.js";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

// Stricter limiter for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many requests. Please try again later." },
});

router.post("/login", authLimiter, login);
router.post("/refresh", refresh);
router.post("/logout", verifyAccessToken, logout);
router.post("/register/superadmin", authLimiter, registerSuperAdmin);

// Forgot password — client only
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/verify-otp", otpLimiter, verifyOtp);
router.post("/reset-password", otpLimiter, resetPassword);

export default router;
