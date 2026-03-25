import jwt from "jsonwebtoken";
import { getConnection } from "../config/tenantDB.js";

export const verifyAccessToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No access token" });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = decoded;
    next();
  });
};

/**
 * Resolves the correct MongoDB connection for the requesting client
 * and attaches it to req.db.
 *
 * - Shared-DB clients  → req.db = default mongoose.connection (no overhead)
 * - Dedicated clients  → req.db = their own cached connection
 *
 * Must be placed AFTER verifyAccessToken in the middleware chain.
 * Controllers use req.db.model("Trip") instead of importing Trip directly
 * only when they need tenant-aware queries. Most controllers can continue
 * using imported models (which hit the shared DB) — only ENTERPRISE-specific
 * data isolation requires req.db.
 */
export const resolveTenantDB = async (req, res, next) => {
  try {
    const clientId = req.user?.clientId;
    req.db = await getConnection(clientId);
    next();
  } catch (err) {
    console.error("❌ resolveTenantDB error:", err.message);
    next(err);
  }
};
