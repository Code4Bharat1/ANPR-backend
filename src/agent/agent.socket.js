/**
 * Multi-agent registry (FR-5.7)
 *
 * One agent (Raspberry Pi) runs per site. Each agent connects via WebSocket
 * and identifies itself by sending:
 *   { type: "REGISTER", siteId: "<mongoId>" }
 * as its first message after connecting.
 *
 * The registry maps siteId (string) → AgentEntry:
 *   { ws: WebSocket, pendingResolver: Function|null }
 *
 * sendToAgentAndWait(payload, siteId) routes the command to the correct agent
 * and waits up to `timeout` ms for a response.
 *
 * Backward-compat: if siteId is omitted and exactly one agent is connected,
 * that agent is used (preserves behaviour for single-site deployments).
 */

/** @type {Map<string, { ws: import('ws').WebSocket, pendingResolver: Function|null }>} */
const registry = new Map();

/**
 * Called by agent.ws.js when a new WebSocket connection arrives.
 * The agent must send { type: "REGISTER", siteId } as its first message.
 * Until that message arrives the connection is held in a pending slot.
 */
export function registerAgent(ws) {
  // Temporary slot — will be moved to registry once REGISTER message arrives
  let registeredSiteId = null;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      console.error("⚠️ Agent sent non-JSON message, ignoring");
      return;
    }

    // ── REGISTER handshake ──────────────────────────────────
    if (data.type === "REGISTER") {
      const siteId = data.siteId?.toString();
      if (!siteId) {
        console.error("⚠️ Agent sent REGISTER without siteId");
        return;
      }

      registeredSiteId = siteId;
      registry.set(siteId, { ws, pendingResolver: null });
      console.log(`✅ Agent registered for site ${siteId} (total: ${registry.size})`);
      return;
    }

    // ── Response to a pending command ───────────────────────
    if (registeredSiteId) {
      const entry = registry.get(registeredSiteId);
      if (entry?.pendingResolver) {
        entry.pendingResolver(data);
        entry.pendingResolver = null;
      }
    }
  });

  ws.on("close", () => {
    if (registeredSiteId) {
      registry.delete(registeredSiteId);
      console.log(`❌ Agent disconnected for site ${registeredSiteId} (remaining: ${registry.size})`);
    }
  });
}

/**
 * Remove all entries for a given WebSocket (called on unexpected close
 * before REGISTER arrives).
 */
export function removeAgent(ws) {
  for (const [siteId, entry] of registry.entries()) {
    if (entry.ws === ws) {
      registry.delete(siteId);
      console.log(`❌ Agent removed for site ${siteId}`);
      break;
    }
  }
}

/**
 * Send a command to the agent for a specific site and wait for its response.
 *
 * @param {object} payload   - JSON payload to send (e.g. { type: "OPEN_BARRIER" })
 * @param {string} siteId    - MongoDB ObjectId string of the target site
 * @param {number} [timeout] - ms to wait before rejecting (default 5000)
 * @returns {Promise<object>} - resolves with the agent's response JSON
 * @throws  Error if agent is offline or times out
 */
export function sendToAgentAndWait(payload, siteId, timeout = 5000) {
  // ── Resolve target entry ────────────────────────────────
  let entry = siteId ? registry.get(siteId.toString()) : null;

  // Backward-compat: single-agent fallback
  if (!entry && registry.size === 1) {
    entry = registry.values().next().value;
  }

  if (!entry) {
    const msg = siteId
      ? `Agent offline for site ${siteId}`
      : "No agent connected";
    throw new Error(msg);
  }

  return new Promise((resolve, reject) => {
    entry.pendingResolver = resolve;

    entry.ws.send(JSON.stringify(payload));

    setTimeout(() => {
      if (entry.pendingResolver === resolve) {
        entry.pendingResolver = null;
        reject(new Error("Agent timeout"));
      }
    }, timeout);
  });
}

/**
 * Returns true if an agent is connected for the given siteId.
 * Used by status endpoints to report agent connectivity.
 */
export function isAgentOnline(siteId) {
  if (siteId) return registry.has(siteId.toString());
  return registry.size > 0;
}

/**
 * Returns all currently connected siteIds (for diagnostics).
 */
export function getConnectedSites() {
  return Array.from(registry.keys());
}
