import { PLANS } from "../config/plans.js";

/**
 * Resolve the effective feature flags for a client.
 *
 * Priority: client.featuresOverride (per-client SuperAdmin override, FR-9.4)
 *           > plan defaults from PLANS config
 *
 * @param {object} client  — Mongoose Client document (lean or hydrated)
 * @returns {object}       — feature flags map
 */
export const getPlanFeatures = (client) => {
  // Legacy string-only call (backward compat — some callers pass packageType string)
  if (typeof client === "string") {
    const plan = PLANS[client];
    return plan ? { ...plan.features } : getDefaultFeatures();
  }

  const plan = PLANS[client?.packageType];
  const base = plan ? { ...plan.features } : getDefaultFeatures();

  // FR-9.4: Per-client overrides set by SuperAdmin take precedence
  if (client?.featuresOverride && typeof client.featuresOverride === "object") {
    return { ...base, ...client.featuresOverride };
  }

  return base;
};

/**
 * Resolve the effective plan limits for a client.
 * Merges plan defaults with any per-client limit overrides (FR-9.4).
 *
 * @param {object} client  — Mongoose Client document
 * @returns {object}       — limits map { sites, pm, supervisor, devices: {} }
 */
export const getPlanLimits = (client) => {
  const plan = PLANS[client?.packageType];
  const base = plan
    ? {
        sites:      plan.limits.sites,
        pm:         plan.limits.pm,
        supervisor: plan.limits.supervisor,
        devices:    { ...plan.limits.devices },
      }
    : { sites: 0, pm: 0, supervisor: 0, devices: {} };

  // FR-9.4: Per-client device limit overrides (stored in client.deviceLimits)
  if (client?.deviceLimits) {
    base.devices = { ...base.devices, ...client.deviceLimits };
  }
  if (client?.userLimits) {
    if (client.userLimits.pm        != null) base.pm        = client.userLimits.pm;
    if (client.userLimits.supervisor != null) base.supervisor = client.userLimits.supervisor;
  }
  if (client?.siteLimits != null) {
    base.sites = client.siteLimits;
  }

  return base;
};

const getDefaultFeatures = () => ({
  barrierAutomation: false,
  biometricOpening:  false,
  topCamera:         false,
  aiAnalytics:       false,
  dedicatedDB:       false,
});
