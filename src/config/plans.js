// config/plans.js

/**
 * Plan definitions for FR-9.1 (limits) and FR-9.2 (feature flags).
 *
 * limits.sites        — max sites per client
 * limits.pm           — max project managers per client
 * limits.supervisor   — max supervisors per client
 * limits.devices.*    — max devices of each type per client
 *
 * NOTE: BARRIER is NOT a registered device type.
 * The barrier is physically controlled by the ANPR camera via the on-site agent.
 * Barrier automation is feature-gated (barrierAutomation flag) but has no device limit.
 *
 * features.*          — boolean feature flags enforced server-side (FR-9.2)
 *   barrierAutomation — auto barrier trigger on entry/exit (CORE+)
 *   biometricOpening  — fingerprint barrier open (PRO+)
 *   topCamera         — top camera capture (PRO+)
 *   aiAnalytics       — AI/NL analytics queries (ENTERPRISE only)
 *   dedicatedDB       — dedicated MongoDB cluster (ENTERPRISE only)
 */
export const PLANS = {
  LITE: {
    name: "Lite Access",
    limits: {
      sites: 1,
      pm: 1,
      supervisor: 2,
      devices: {
        ANPR: 0,
        BIOMETRIC: 1,
        TOP_CAMERA: 0,
        OVERVIEW: 0,
      },
    },
    features: {
      barrierAutomation: false,
      biometricOpening:  false,
      topCamera:         false,
      aiAnalytics:       false,
      dedicatedDB:       false,
    },
  },

  CORE: {
    name: "Core Monitoring",
    limits: {
      sites: 2,
      pm: 2,
      supervisor: 3,
      devices: {
        ANPR: 1,
        BIOMETRIC: 0,
        TOP_CAMERA: 0,
        OVERVIEW: 1,
      },
    },
    features: {
      barrierAutomation: true,
      biometricOpening:  false,
      topCamera:         false,
      aiAnalytics:       false,
      dedicatedDB:       false,
    },
  },

  PRO: {
    name: "Pro Automation",
    limits: {
      sites: 5,
      pm: 3,
      supervisor: 6,
      devices: {
        ANPR: 1,
        BIOMETRIC: 1,
        TOP_CAMERA: 1,
        OVERVIEW: 2,
      },
    },
    features: {
      barrierAutomation: true,
      biometricOpening:  true,
      topCamera:         true,
      aiAnalytics:       false,
      dedicatedDB:       false,
    },
  },

  ENTERPRISE: {
    name: "Enterprise Local",
    limits: {
      sites: 999,
      pm: 10,
      supervisor: 20,
      devices: {
        ANPR: 10,
        BIOMETRIC: 10,
        TOP_CAMERA: 10,
        OVERVIEW: 10,
      },
    },
    features: {
      barrierAutomation: true,
      biometricOpening:  true,
      topCamera:         true,
      aiAnalytics:       true,
      dedicatedDB:       true,
    },
  },
};
