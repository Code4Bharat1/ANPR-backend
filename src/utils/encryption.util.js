/**
 * AES-256-GCM encryption for sensitive fields (e.g. dedicated DB connection strings).
 *
 * Requires env var: DB_ENCRYPTION_KEY — 64 hex chars (32 bytes)
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Encrypted format (stored as string): iv:authTag:ciphertext  (all hex)
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX   = process.env.DB_ENCRYPTION_KEY;

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error(
      "DB_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(KEY_HEX, "hex");
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "iv:authTag:ciphertext" (all hex)
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a string produced by encrypt().
 * @param {string} encryptedStr  "iv:authTag:ciphertext"
 * @returns {string} plaintext
 */
export function decrypt(encryptedStr) {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = encryptedStr.split(":");

  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted string format");
  }

  const iv         = Buffer.from(ivHex, "hex");
  const authTag    = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
