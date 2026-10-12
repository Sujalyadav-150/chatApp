async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const subject = "Reset your ChatApp password";
  const safeName = escapeHtml(name || "there");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:28px;border:1px solid #e8e8f2;border-radius:16px;color:#252944"><h2 style="margin-top:0">Reset your ChatApp password</h2><p>Hi ${safeName},</p><p>Click below to choose a new password. This link expires in 15 minutes.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;background:#5955d8;color:#fff;padding:13px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Reset password</a></p><p>If the button does not work, copy this link into your browser:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p style="color:#777c90;font-size:13px">If you did not request this, you can safely ignore this email.</p></div>`;
  const text = `Hi ${name || "there"},\n\nWe received a request to reset your ChatApp password. Use this link within 15 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n\nChatApp Support`;

  // Prefer the HTTP API: Render's free web services may block outbound SMTP ports.
  if (process.env.RESEND_API_KEY) {
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error("MAIL_FROM must be set to a sender verified with Resend.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: `ChatApp Support <${from}>`, to: [to], subject, text, html })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend API failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    return;
  }

  // SMTP fallback for hosts that permit outbound SMTP.
  const nodemailer = require("nodemailer");
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("Email is not configured. Set RESEND_API_KEY and MAIL_FROM, or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD.");
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
  });
  await transporter.sendMail({
    from: `ChatApp Support <${process.env.MAIL_FROM || SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

module.exports = { sendPasswordResetEmail };
