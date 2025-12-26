import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createSite, getSites, updateSite, toggleSite } from "../controllers/site.controller.js";

const router = express.Router();

router.post("/", verifyAccessToken, authorizeRoles("admin"), createSite);
router.get("/", verifyAccessToken, authorizeRoles("admin", "project_manager", "supervisor"), getSites);
router.put("/:id", verifyAccessToken, authorizeRoles("admin"), updateSite);
router.patch("/:id/toggle", verifyAccessToken, authorizeRoles("admin"), toggleSite);

export default router;
