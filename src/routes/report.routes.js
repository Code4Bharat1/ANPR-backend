import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { summary, siteWise } from "../controllers/report.controller.js";

const router = express.Router();

router.get("/summary", verifyAccessToken, authorizeRoles("admin", "project_manager"), summary);
router.get("/site-wise", verifyAccessToken, authorizeRoles("admin", "project_manager"), siteWise);

export default router;
