export const checkDeviceLimit = async (req, res, next) => {
  try {
    const { devicetype, siteId } = req.body;
    const clientId = req.user.clientId;

    if (!siteId) {
      return res.status(400).json({
        message: "siteId is required for device creation"
      });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const packageLimits = PLANS[client.packageType] || PLANS.LITE;
    const allowed = packageLimits.limits.devices[devicetype] ?? 0;

    // ✅ SITE-WISE CHECK
    const used = await Device.countDocuments({
      clientId,
      siteId,
      devicetype,
      isEnabled: true
    });

    if (used >= allowed) {
      return res.status(403).json({
        message: `Device limit exceeded for ${devicetype} at this site. Allowed: ${allowed}`
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
