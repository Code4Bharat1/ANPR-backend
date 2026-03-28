import express from "express";
import { verifyAccessToken, resolveTenantDB } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { createVendor, getVendors, updateVendor } from "../controllers/vendor.controller.js";

const router = express.Router();

router.use(verifyAccessToken, resolveTenantDB);

router.post("/", authorizeRoles("project_manager"), createVendor);
router.get("/", authorizeRoles("project_manager", "supervisor", "admin","client"), getVendors);
router.put("/:id", authorizeRoles("project_manager"), updateVendor);

export default router;
