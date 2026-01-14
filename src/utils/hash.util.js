import bcrypt from "bcryptjs";

/* 🔐 Hash password */
export const hashPassword = async (plain) => {
  return bcrypt.hash(plain, 10);
};

/* 🔍 Compare password (HASH + PLAIN fallback) */
export const comparePassword = async (plain, stored) => {
  // ✅ Case 1: Already hashed password
  if (stored.startsWith("$2")) {
    return bcrypt.compare(plain, stored);
  }

  // ⚠️ Case 2: Legacy plain-text password
  if (plain === stored) {
    return "PLAIN_MATCH"; // special signal
  }

  return false;
};
