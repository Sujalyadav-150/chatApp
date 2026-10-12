const nodemailer = require("nodemailer");

let cachedTransporter;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.");
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
  });

  return cachedTransporter;
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from: `ChatApp Support <${from}>`,
    to,
    subject: "Reset your ChatApp password",
    text: `Hi ${name || "there"},\n\nWe received a request to reset your ChatApp password. Use this link within 15 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n\nChatApp Support`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:28px;border:1px solid #e8e8f2;border-radius:16px;color:#252944"><h2 style="margin-top:0">Reset your ChatApp password</h2><p>Hi ${escapeHtml(name || "there")},</p><p>Click below to choose a new password. This link expires in 15 minutes.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;background:#5955d8;color:#fff;padding:13px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Reset password</a></p><p>If the button does not work, copy this link into your browser:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p style="color:#777c90;font-size:13px">If you did not request this, you can safely ignore this email.</p></div>`
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

module.exports = { sendPasswordResetEmail };
