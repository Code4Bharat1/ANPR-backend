import AuditLog from "../models/AuditLog.model.js";

export const logAudit = async ({
  req,
  action,
  module,
  oldValue = null,
  newValue = null,
}) => {
  try {
    await AuditLog.create({
      userId: req.user?.id || null,
      role: req.user?.role || "public",
      action,
      module,
      oldValue,
      newValue,
      ip: req.ip,
    });
  } catch (e) {
    // audit failure should not break app
  }
};
