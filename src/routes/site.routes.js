import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createClientSite, getAllSites, toggleClientSite, updateClientSite } from "../controllers/site.controller.js";

const router = express.Router();

router.use(verifyAccessToken, resolveTenantDB);

router.post("/", authorizeRoles("admin","client"), createClientSite);
router.get("/", authorizeRoles("admin","client", "project_manager", "supervisor"), getAllSites);
router.put("/:id", authorizeRoles("admin","client"), updateClientSite);
router.patch("/:id/toggle", authorizeRoles("admin","client"), toggleClientSite);

export default router;
