import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { summary, siteWise } from "../controllers/report.controller.js";

const router = express.Router();

router.use(verifyAccessToken, resolveTenantDB);

router.get("/summary", authorizeRoles("admin", "project_manager"), summary);
router.get("/site-wise", authorizeRoles("admin", "project_manager"), siteWise);

export default router;
