// config/plans.js
export const PLANS = {
  LITE: {
    name: "Lite Access",
    limits: {
      pm: 1,
      supervisor: 2,
      devices: {
        ANPR: 0,
        BARRIER: 1,
        BIOMETRIC: 1,
      },
    },
  },

  CORE: {
    name: "Core Monitoring",
    limits: {
      pm: 2,
      supervisor: 3,
      devices: {
        ANPR: 1,
        BARRIER: 1,
        BIOMETRIC: 0,
      },
    },
  },

  PRO: {
    name: "Pro Automation",
    limits: {
      pm: 3,
      supervisor: 6,
      devices: {
        ANPR: 1,
        BARRIER: 1,
        BIOMETRIC: 1,
      },
    },
  },

  ENTERPRISE: {
    name: "Enterprise Local",
    limits: {
      pm: 3,
      supervisor: 6,
      devices: {
        ANPR: 1,
        BARRIER: 1,
        BIOMETRIC: 1,
      },
    },
  },
};
