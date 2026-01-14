
import express from "express";
import rateLimit from "express-rate-limit";
import { login, refresh, logout, registerSuperAdmin } from "../controllers/auth.controller.js";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

router.post("/login", authLimiter, login);
router.post("/refresh", refresh);
router.post("/logout", verifyAccessToken, logout);
router.post("/register/superadmin", authLimiter, registerSuperAdmin);

export default router;
