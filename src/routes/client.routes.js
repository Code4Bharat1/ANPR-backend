// import express from "express";
// import { verifyAccessToken } from "../middlewares/auth.middleware.js";
// import { authorizeRoles } from "../middlewares/role.middleware.js";
// import { createClient, getClients, updateClient, toggleClient } from "../controllers/client.controller.js";

// const router = express.Router();

// router.post("/", verifyAccessToken, authorizeRoles("superadmin"), createClient);
// router.get("/", verifyAccessToken, authorizeRoles("superadmin"), getClients);
// router.put("/:id", verifyAccessToken, authorizeRoles("superadmin"), updateClient);
// router.patch("/:id/toggle", verifyAccessToken, authorizeRoles("superadmin"), toggleClient);

// export default router;


import express from "express";
import { verifyAccessToken } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
  createClient,
  getClients,
  updateClient,
  toggleClient,
  getClientDashboard,
  createProjectManager,
  getUsers,
  createSite,
  getDevices,
  getReports,
  createSupervisor,
  getSupervisors,
  getSites,
  getMyProfile

} from "../controllers/client.controller.js";

const router = express.Router();

/**
 * @route   POST /api/clients
 * @desc    Create new client
 * @access  SuperAdmin
 */
router.post(
  "/",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  createClient
);

/**
 * @route   GET /api/clients
 * @desc    Get all clients
 * @access  SuperAdmin
 */
router.get(
  "/",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  getClients
);

/**
 * @route   PUT /api/clients/:id
 * @desc    Update client details
 * @access  SuperAdmin
 */
router.put(
  "/:id",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  updateClient
);

/**
 * @route   PATCH /api/clients/:id/toggle
 * @desc    Enable / Disable client
 * @access  SuperAdmin
 */
router.patch(
  "/:id/toggle",
  verifyAccessToken,
  authorizeRoles("superadmin"),
  toggleClient
);

router.get(
  "/dashboard",
  verifyAccessToken,              // 🔥 MUST
  authorizeRoles("client", "admin"),
  getClientDashboard
);


router.post(
  "/project-managers",
  verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"),    // 🔥 MUST
  createProjectManager
);
router.get("/users", getUsers
  
);
router.post(
  "/sites",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  createSite
);

router.get(
  "/sites",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  getSites
);
router.get("/devices", 
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  getDevices);
router.get("/reports", verifyAccessToken,
  authorizeRoles("client", "admin"),getReports);
router.post("/supervisors", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), createSupervisor);
router.get("/supervisors", verifyAccessToken,                    // 🔥 MUST
  authorizeRoles("client", "admin"), getSupervisors);

/**
 * GET MY PROFILE
 * /api/clients-admin/profile
 */
router.get(
  "/profile",
  verifyAccessToken,
  authorizeRoles("client", "admin"),
  getMyProfile
);

export default router;
