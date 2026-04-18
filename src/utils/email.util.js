import nodemailer from "nodemailer";

/**
 * Creates a nodemailer transporter from env vars.
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Optional:
 *   SMTP_FROM  (defaults to SMTP_USER)
 *   SMTP_SECURE (true for port 465, false for others)
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send a password-reset OTP email to a client.
 * @param {string} toEmail  - recipient email
 * @param {string} otp      - 6-digit OTP string
 */
export async function sendPasswordResetOtp(toEmail, otp) {
  const transporter = createTransporter();

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"ANPR SecureGate" <${from}>`,
    to: toEmail,
    subject: "Your Password Reset OTP",
    text: `Your OTP for password reset is: ${otp}\n\nThis OTP is valid for 10 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#1e3a5f;margin-bottom:8px;">Password Reset Request</h2>
        <p style="color:#4b5563;font-size:14px;">Use the OTP below to reset your ANPR SecureGate password.</p>
        <div style="background:#f3f4f6;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px;">This OTP expires in <strong>10 minutes</strong>. If you did not request a password reset, please ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#9ca3af;font-size:12px;">© 2026 ANPR Systems Corp. All rights reserved.</p>
      </div>
    `,
  });
}
