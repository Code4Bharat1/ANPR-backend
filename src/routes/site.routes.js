import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {   createClientSite, getAllSites, toggleClientSite, updateClientSite } from "../controllers/site.controller.js";

const router = express.Router();

router.post("/", verifyAccessToken, authorizeRoles("admin","client"), createClientSite);
router.get("/", verifyAccessToken, authorizeRoles("admin","client", "project_manager", "supervisor"), getAllSites);
router.put("/:id", verifyAccessToken, authorizeRoles("admin","client"), updateClientSite);
router.patch("/:id/toggle", verifyAccessToken, authorizeRoles("admin","client"), toggleClientSite);

export default router;
