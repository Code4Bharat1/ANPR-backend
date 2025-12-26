import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createVendor, getVendors, updateVendor } from "../controllers/vendor.controller.js";

const router = express.Router();

router.post("/", verifyAccessToken, authorizeRoles("project_manager"), createVendor);
router.get("/", verifyAccessToken, authorizeRoles("project_manager", "supervisor", "admin"), getVendors);
router.put("/:id", verifyAccessToken, authorizeRoles("project_manager"), updateVendor);

export default router;
