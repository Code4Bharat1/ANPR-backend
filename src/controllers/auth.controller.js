import RefreshToken from "../models/RefreshToken.model.js";
import { generateAccessToken, generateRefreshToken, verifyRefresh } from "../utils/token.util.js";
import { comparePassword, hashPassword } from "../utils/hash.util.js";
import { logAudit } from "../middlewares/audit.middleware.js";
import SuperAdmin from "../models/superadmin.model.js"; 
const getModelByRole = async (role) => {
  if (role === "superadmin") return (await import("../models/superadmin.model.js")).default;
  if (role === "admin") return (await import("../models/admin.model.js")).default;
  if (role === "project_manager") return (await import("../models/ProjectManager.model.js")).default;
  if (role === "supervisor") return (await import("../models/supervisor.model.js")).default;
  return null;
};

export const login = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    const Model = await getModelByRole(role);
    if (!Model) return res.status(400).json({ message: "Invalid role" });

    const user = await Model.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await comparePassword(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { id: user._id, role: user.role, clientId: user.clientId || null };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await RefreshToken.create({
      userId: user._id,
      role: user.role,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await logAudit({ req, action: "LOGIN", module: "AUTH", newValue: { role, email } });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, role: user.role, name: user.name, email: user.email, clientId: user.clientId || null },
    });
  } catch (e) {
    next(e);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const found = await RefreshToken.findOne({ token: refreshToken });
    if (!found) return res.status(401).json({ message: "Invalid refresh token" });

    const decoded = verifyRefresh(refreshToken);

    const newAccess = generateAccessToken({
      id: decoded.id,
      role: decoded.role,
      clientId: decoded.clientId || null,
    });

    res.json({ accessToken: newAccess });
  } catch (e) {
    next(e);
  }
};

export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await RefreshToken.deleteOne({ token: refreshToken });

    await logAudit({ req, action: "LOGOUT", module: "AUTH" });

    res.json({ message: "Logged out" });
  } catch (e) {
    next(e);
  }
};
export const registerSuperAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // ❗ Allow only ONE SuperAdmin
    const existing = await SuperAdmin.countDocuments();
    if (existing > 0) {
      return res.status(403).json({
        message: "SuperAdmin already exists. Registration blocked."
      });
    }

    const hashedPassword = await hashPassword(password);

    const superAdmin = await SuperAdmin.create({
      name,
      email,
      password: hashedPassword,
      role: "superadmin",
    });

    await logAudit({
      req,
      action: "REGISTER",
      module: "SUPERADMIN",
      newValue: { email }
    });

    res.status(201).json({
      message: "SuperAdmin registered successfully",
      user: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role
      }
    });
  } catch (e) {
    next(e);
  }
};