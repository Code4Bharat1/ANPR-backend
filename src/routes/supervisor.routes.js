// routes/supervisor.routes.js
import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    createSupervisor,
    getSupervisors,
    assignSite,
    toggleSupervisor,
    supervisorDashboard
} from "../controllers/supervisor.controller.js";

const router = express.Router();

router.post(
    "/",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    createSupervisor
);

router.get(
    "/",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    getSupervisors
);

router.patch(
    "/:id/assign-site",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    assignSite
);

router.patch(
    "/:id/toggle",
    verifyAccessToken,
    authorizeRoles("project_manager"),
    toggleSupervisor
);
router.get(
  "/dashboard",
  verifyAccessToken,
  authorizeRoles("supervisor"),
  supervisorDashboard
);


export default router;
