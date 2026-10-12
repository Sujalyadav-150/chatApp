const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { sendPasswordResetEmail } = require("../services/emailService");

function createToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

exports.signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).trim();
    const exists = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }]
    });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email or phone already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword
    });

    res.status(201).json({
      success: true,
      message: "Signup successful",
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ success: false, message: "Unable to create your account right now" });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Email/phone and password are required" });
    }

    const value = String(identifier).trim();
    const user = await User.findOne({
      $or: [{ email: value.toLowerCase() }, { phone: value }]
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Invalid email/phone or password" });
    }

    const token = createToken(user);
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ success: false, message: "Unable to sign in right now" });
  }
};

// Always return the same public response so an attacker cannot enumerate registered emails.
exports.forgotPassword = async (req, res) => {
  const publicMessage = "If an account exists for that email, a password reset link has been sent. Please check your inbox and spam folder.";
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }

    const user = await User.findOne({ email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const tokenExpires = new Date(Date.now() + 15 * 60 * 1000);

      // Use updateOne instead of document.save(): legacy user records may not
      // contain newer required fields (such as phone), which would trigger
      // unrelated schema validation and block password reset.
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordResetToken: tokenHash, passwordResetExpires: tokenExpires } }
      );

      const baseUrl = (process.env.CLIENT_URL || "").replace(/\/$/, "");
      if (!baseUrl) {
        await User.updateOne(
          { _id: user._id },
          { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } }
        );
        console.error("CLIENT_URL is missing; password reset email was not sent.");
        return res.status(503).json({ success: false, message: "Password reset is not configured yet. Please contact support." });
      }

      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: `${baseUrl}/reset-password.html?token=${rawToken}`
        });
      } catch (mailError) {
        await User.updateOne(
          { _id: user._id },
          { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } }
        );
        console.error("Password reset email failed:", mailError.message);
        return res.status(503).json({ success: false, message: "Unable to send the reset email right now. Please try again later." });
      }
    }

    return res.json({ success: true, message: publicMessage });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process the request right now" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    if (!token || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: !token ? "Reset token is missing or invalid" : "Password must be at least 8 characters"
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "This reset link is invalid or has expired. Request a new one." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // Update only the reset-related fields so legacy records missing phone
    // or other newer required fields can still complete password recovery.
    await User.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { passwordResetToken: 1, passwordResetExpires: 1 }
      }
    );

    return res.json({ success: true, message: "Password reset successful. You can now sign in with your new password." });
  } catch (error) {
    console.error("Reset password error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to reset the password right now" });
  }
};
