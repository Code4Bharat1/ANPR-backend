import Client from "../models/Client.model.js";

/**
 * Blocks the request if the client's credit balance is zero or below.
 * Attach after verifyAccessToken so req.user is populated.
 *
 * Usage:
 *   router.post("/entry", verifyAccessToken, checkCreditBalance, createManualTrip);
 */
export const checkCreditBalance = async (req, res, next) => {
  try {
    const clientId = req.user?.clientId || req.user?._id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        code: "NO_CLIENT_ID",
        message: "Unable to resolve client for credit check",
      });
    }

    const client = await Client.findById(clientId).select(
      "creditBalance creditThreshold"
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        code: "CLIENT_NOT_FOUND",
        message: "Client not found",
      });
    }

    if (client.creditBalance < 2) {
      return res.status(402).json({
        success: false,
        code: "INSUFFICIENT_CREDITS",
        message: "Insufficient credits. At least 2 credits are required per trip. Please top up to continue.",
        data: {
          balance: client.creditBalance,
          threshold: client.creditThreshold,
        },
      });
    }

    // Attach to req so controllers can use it without a second DB hit
    req.clientCreditBalance = client.creditBalance;
    req.clientCreditThreshold = client.creditThreshold;

    next();
  } catch (err) {
    next(err);
  }
};
