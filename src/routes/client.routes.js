import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createClient, getClients, updateClient, toggleClient } from "../controllers/client.controller.js";

const router = express.Router();

router.post("/", verifyAccessToken, authorizeRoles("superadmin"), createClient);
router.get("/", verifyAccessToken, authorizeRoles("superadmin"), getClients);
router.put("/:id", verifyAccessToken, authorizeRoles("superadmin"), updateClient);
router.patch("/:id/toggle", verifyAccessToken, authorizeRoles("superadmin"), toggleClient);

export default router;
