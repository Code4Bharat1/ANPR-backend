export const getPlanFeatures = (packageType) => {
  switch (packageType) {
    case "LITE":
      return {
        anpr: false,
        biometric: false,
        barrier: true,
        mobileOCR: true,
        localServer: false,
      };

    case "CORE":
      return {
        anpr: true,
        biometric: false,
        barrier: true,
        mobileOCR: true,
        localServer: false,
      };

    case "PRO":
      return {
        anpr: true,
        biometric: true,
        barrier: true,
        mobileOCR: true,
        localServer: false,
      };

    case "ENTERPRISE":
      return {
        anpr: true,
        biometric: true,
        barrier: true,
        mobileOCR: true,
        localServer: true,
      };

    default:
      return {
        anpr: false,
        biometric: false,
        barrier: false,
        mobileOCR: false,
        localServer: false,
      };
  }
};
