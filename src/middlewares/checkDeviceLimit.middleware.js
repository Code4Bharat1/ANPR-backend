import Device from "../models/Device.model.js";
import Client from "../models/Client.model.js";

export const checkDeviceLimit = async (req, res, next) => {
  const { devicetype } = req.body;
  const clientId = req.user.clientId;

  const client = await Client.findById(clientId);
  if (!client) {
    return res.status(404).json({ message: "Client not found" });
  }

  const allowed = client.deviceLimits?.[devicetype] ?? 0;

  const used = await Device.countDocuments({
    clientId,
    devicetype,
    isEnabled: true,
  });

  if (used >= allowed) {
    return res.status(403).json({
      message: `Device limit exceeded for ${devicetype}. Allowed: ${allowed}`,
    });
  }

  next();
};
