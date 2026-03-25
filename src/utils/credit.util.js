import mongoose from "mongoose";
import Client from "../models/Client.model.js";
import CreditLedger from "../models/CreditLedger.model.js";

/**
 * Atomically deducts 1 credit from a client and writes a ledger entry.
 * Must be called inside an existing mongoose session, or will create its own.
 *
 * @param {Object} opts
 * @param {string|ObjectId} opts.clientId
 * @param {string|ObjectId} opts.tripId
 * @param {"ENTRY"|"EXIT"} opts.eventType
 * @param {string|ObjectId} opts.performedBy  - userId who triggered the event
 * @param {string} opts.performedByRole
 * @param {number} [opts.amount=1]  - number of credits to deduct
 * @param {mongoose.ClientSession} [opts.session]  - pass existing session if available
 *
 * @returns {{ balanceBefore, balanceAfter, ledgerEntry }}
 * @throws  Error if balance is insufficient (double-guard)
 */
export async function deductCredit({
  clientId,
  tripId,
  eventType,
  performedBy,
  performedByRole,
  amount = 1,
  session: externalSession,
}) {
  const ownSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());

  if (ownSession) session.startTransaction();

  try {
    // Fetch current balance inside the session for isolation
    const client = await Client.findById(clientId)
      .select("creditBalance")
      .session(session);

    if (!client) throw new Error("Client not found during credit deduction");

    if (client.creditBalance < amount) {
      throw Object.assign(new Error("Insufficient credits"), {
        code: "INSUFFICIENT_CREDITS",
        statusCode: 402,
      });
    }

    const balanceBefore = client.creditBalance;
    const balanceAfter = balanceBefore - amount;

    // Atomic decrement — prevents race conditions
    await Client.findByIdAndUpdate(
      clientId,
      { $inc: { creditBalance: -amount } },
      { session }
    );

    const [ledgerEntry] = await CreditLedger.create(
      [
        {
          clientId,
          tripId: tripId || null,
          eventType,
          credits: -amount,
          balanceBefore,
          balanceAfter,
          performedBy,
          performedByRole,
        },
      ],
      { session }
    );

    if (ownSession) {
      await session.commitTransaction();
      session.endSession();
    }

    return { balanceBefore, balanceAfter, ledgerEntry };
  } catch (err) {
    if (ownSession) {
      await session.abortTransaction();
      session.endSession();
    }
    throw err;
  }
}
