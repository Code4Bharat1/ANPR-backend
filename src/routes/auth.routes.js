import express from "express";
import { login, refresh, logout, registerSuperAdmin } from "../controllers/auth.controller.js";


const router = express.Router();
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/register/superadmin", registerSuperAdmin);

export default router;
