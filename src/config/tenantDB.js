/**
 * TenantConnectionManager (FR-dedicated-DB / SRS Section 10)
 *
 * Manages per-client dedicated MongoDB connections for ENTERPRISE clients.
 * Shared-DB clients (LITE/CORE/PRO) always get the default mongoose connection.
 *
 * Usage:
 *   const conn = await getConnection(clientId);
 *   const TripModel = conn.model("Trip");
 *
 * The middleware resolveTenantDB (auth.middleware.js) calls this and attaches
 * the result to req.db so controllers don't need to call it directly.
 */

import mongoose from "mongoose";
import Client from "../models/Client.model.js";
import { decrypt } from "../utils/encryption.util.js";

// clientId (string) → mongoose.Connection  (dedicated clients)
const pool = new Map();

// clientId (string) → true  (confirmed shared-DB clients — skip DB lookup next time)
const sharedCache = new Set();

/**
 * Returns the correct mongoose connection for a client.
 *
 * - Shared-DB clients  → default mongoose connection (mongoose.connection)
 * - Dedicated clients  → a cached or newly created connection to their cluster
 *
 * @param {string|ObjectId} clientId
 * @returns {Promise<mongoose.Connection>}
 */
export async function getConnection(clientId) {
  if (!clientId) return mongoose.connection;

  const key = clientId.toString();

  // Fast path: already confirmed shared
  if (sharedCache.has(key)) return mongoose.connection;

  // Fast path: dedicated connection already open and healthy
  const cached = pool.get(key);
  if (cached && cached.readyState === 1) return cached;

  // Fetch client config from the shared DB (Client model always lives there)
  const client = await Client.findById(clientId)
    .select("+dbConfig.connectionString")
    .lean();

  if (!client) return mongoose.connection;

  // Not a dedicated-DB client — cache this decision and return shared
  if (
    client.dbConfig?.mode !== "dedicated" ||
    !client.dbConfig?.connectionString
  ) {
    // Only cache as shared if mode is explicitly shared (not dedicated with missing URI)
    if (client.dbConfig?.mode !== "dedicated") {
      sharedCache.add(key);
    }
    return mongoose.connection;
  }

  // Decrypt the stored connection string
  let uri;
  try {
    uri = decrypt(client.dbConfig.connectionString);
  } catch (err) {
    console.error(`❌ Failed to decrypt DB connection string for client ${key}:`, err.message);
    return mongoose.connection;
  }

  // Create a new connection
  console.log(`🔌 Opening dedicated DB connection for client ${key}`);
  const conn = await mongoose.createConnection(uri, {
    dbName: client.dbConfig.dbName || undefined,
  }).asPromise();

  _registerModels(conn);
  pool.set(key, conn);

  conn.on("disconnected", () => {
    console.warn(`⚠️ Dedicated DB disconnected for client ${key}`);
    pool.delete(key);
  });

  conn.on("error", (err) => {
    console.error(`❌ Dedicated DB error for client ${key}:`, err.message);
    pool.delete(key);
  });

  return conn;
}

/**
 * Call this after provisioning or deprovisioning a dedicated DB for a client
 * so the next request re-evaluates their connection.
 */
export function invalidateTenantCache(clientId) {
  const key = clientId.toString();
  sharedCache.delete(key);
  const conn = pool.get(key);
  if (conn) {
    conn.close().catch(() => {});
    pool.delete(key);
  }
}

/**
 * Returns all active dedicated DB connections (used by cron jobs).
 * @returns {mongoose.Connection[]}
 */
export function getAllConnections() {
  return [...pool.values()].filter(conn => conn.readyState === 1);
}

/**
 * Gracefully close all dedicated connections (call on server shutdown).
 */
export async function closeAllConnections() {
  const promises = [];
  for (const [key, conn] of pool.entries()) {
    promises.push(conn.close().catch(() => {}));
    pool.delete(key);
  }
  await Promise.all(promises);
}

/**
 * Register every Mongoose model schema on a dedicated connection.
 */
function _registerModels(conn) {
  const modelNames = mongoose.modelNames();
  for (const name of modelNames) {
    if (!conn.modelNames().includes(name)) {
      const schema = mongoose.model(name).schema;
      conn.model(name, schema);
    }
  }
}
