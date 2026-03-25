/**
 * FR-5: Barrier Automation
 *
 * Architecture note (see agent-architecture.md):
 *   - Barrier is NOT a registered device. It is physically part of the ANPR camera.
 *   - Commands flow: Backend → WebSocket → Agent (Pi) → Camera HTTP API → Barrier
 *   - Agent responds with BARRIER_OPENED / ERROR — backend persists the result as a BarrierEvent.
 *   - FR-5.4 (current state) is served by reading the last BarrierEvent for the site.
 *   - FR-5.2 (CLOSE) is wired on the backend; the agent does not yet implement it
 *     (action: "down" gap noted in agent-architecture.md).
 */

import { sendToAgentAndWait } from "../agent/agent.socket.js";
import BarrierEvent from "../models/BarrierEvent.model.js";
import { logAudit } from "../middlewares/audit.middleware.js";

/* ======================================================
   HELPER — persist a BarrierEvent after every command
====================================================== */
async function persistBarrierEvent({
  siteId,
  clientId,
  tripId = null,
  action,
  trigger,
  triggeredBy = null,
  state,
  errorMessage = null,
}) {
  try {
    await BarrierEvent.create({
      siteId,
      clientId,
      tripId,
      action,
      trigger,
      triggeredBy,
      state,
      errorMessage,
    });
  } catch (err) {
    // Non-blocking — event persistence must never crash the main flow (NFR-R1)
    console.error("⚠️ Failed to persist BarrierEvent:", err.message);
  }
}

/* ======================================================
   FR-5.1 / FR-5.5: OPEN BARRIER (manual)
   POST /api/barrier/open
   Auth: supervisor, project_manager, admin  +  barrierAutomation feature flag
====================================================== */
export async function openBarrier(req, res) {
  const { siteId, clientId } = req.user;
  const { tripId = null } = req.body;

  let state = "UNKNOWN";
  let errorMessage = null;

  try {
    const response = await sendToAgentAndWait({ type: "OPEN_BARRIER" }, siteId);

    if (response.type === "BARRIER_OPENED") {
      state = "OPEN";
    } else {
      state = "ERROR";
      errorMessage = response.error || "Unexpected agent response";
    }
  } catch (err) {
    state = "ERROR";
    errorMessage = err.message;
  }

  // FR-5.3: persist regardless of outcome
  await persistBarrierEvent({
    siteId,
    clientId,
    tripId,
    action: "OPEN",
    trigger: "MANUAL",
    triggeredBy: req.user._id,
    state,
    errorMessage,
  });

  await logAudit({
    req,
    action: "OPEN_BARRIER",
    module: "BARRIER",
    newValue: { trigger: "MANUAL", state, tripId },
  });

  if (state !== "OPEN") {
    return res.status(503).json({
      success: false,
      state,
      message: errorMessage || "Barrier command failed",
      timestamp: new Date(),
    });
  }

  return res.json({
    success: true,
    state,
    message: "Barrier opened",
    timestamp: new Date(),
  });
}

/* ======================================================
   FR-5.2 / FR-5.5: CLOSE BARRIER (manual)
   POST /api/barrier/close
   Auth: supervisor, project_manager, admin  +  barrierAutomation feature flag
   Note: Agent does not yet implement CLOSE_BARRIER (action: "down" gap).
         Backend is ready; agent update needed on the Pi side.
====================================================== */
export async function closeBarrier(req, res) {
  const { siteId, clientId } = req.user;

  let state = "UNKNOWN";
  let errorMessage = null;

  try {
    const response = await sendToAgentAndWait({ type: "CLOSE_BARRIER" }, siteId);

    if (response.type === "BARRIER_CLOSED") {
      state = "CLOSED";
    } else {
      state = "ERROR";
      errorMessage = response.error || "Unexpected agent response";
    }
  } catch (err) {
    state = "ERROR";
    errorMessage = err.message;
  }

  await persistBarrierEvent({
    siteId,
    clientId,
    action: "CLOSE",
    trigger: "MANUAL",
    triggeredBy: req.user._id,
    state,
    errorMessage,
  });

  await logAudit({
    req,
    action: "CLOSE_BARRIER",
    module: "BARRIER",
    newValue: { trigger: "MANUAL", state },
  });

  if (state !== "CLOSED") {
    return res.status(503).json({
      success: false,
      state,
      message: errorMessage || "Barrier close command failed",
      timestamp: new Date(),
    });
  }

  return res.json({
    success: true,
    state,
    message: "Barrier closed",
    timestamp: new Date(),
  });
}

/* ======================================================
   FR-5.4: GET BARRIER STATUS (last known state)
   GET /api/barrier/status
   Auth: supervisor, project_manager, admin
   Returns the most recent BarrierEvent for the caller's site.
====================================================== */
export async function getBarrierStatus(req, res) {
  try {
    const siteId = req.user?.siteId || req.query.siteId;

    if (!siteId) {
      return res.status(400).json({ success: false, message: "siteId required" });
    }

    const last = await BarrierEvent.findOne({ siteId })
      .sort({ createdAt: -1 })
      .lean();

    if (!last) {
      return res.json({
        success: true,
        state: "UNKNOWN",
        lastUpdated: null,
        message: "No barrier events recorded for this site",
      });
    }

    return res.json({
      success: true,
      state: last.state,
      action: last.action,
      trigger: last.trigger,
      lastUpdated: last.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/* ======================================================
   INTERNAL: triggerBarrierForTrip
   Called by trip.controller.js on auto entry/exit (FR-5.6).
   Non-blocking — never throws; always persists the outcome.
====================================================== */
export async function triggerBarrierForTrip({
  siteId,
  clientId,
  tripId,
  trigger, // "AUTO_ENTRY" | "AUTO_EXIT"
  triggeredBy,
}) {
  let state = "UNKNOWN";
  let errorMessage = null;

  try {
    const response = await sendToAgentAndWait({ type: "OPEN_BARRIER" }, siteId);

    if (response.type === "BARRIER_OPENED") {
      state = "OPEN";
    } else {
      state = "ERROR";
      errorMessage = response.error || "Unexpected agent response";
    }
  } catch (err) {
    state = "ERROR";
    errorMessage = err.message;
  }

  await persistBarrierEvent({
    siteId,
    clientId,
    tripId,
    action: "OPEN",
    trigger,
    triggeredBy,
    state,
    errorMessage,
  });

  return { state, errorMessage };
}

/* ======================================================
   LEGACY: loginBarrier — kept for backward compat
====================================================== */
export async function loginBarrier(req, res) {
  try {
    const siteId = req.user?.siteId;
    const response = await sendToAgentAndWait({ type: "LOGIN_BARRIER" }, siteId);

    if (response.type !== "LOGIN_OK") {
      throw new Error(response.error || "Login failed");
    }

    return res.json({ success: true, message: "Barrier login successful" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
