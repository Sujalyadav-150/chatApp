const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

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

    const exists = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }]
    });

    if (exists) {
      return res.status(409).json({ success: false, message: "Email or phone already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword
    });

    res.status(201).json({
      success: true,
      message: "Signup successful",
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [
        { email: String(identifier).toLowerCase() },
        { phone: identifier }
      ]
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email/phone or password" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
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
    res.status(500).json({ success: false, message: error.message });
  }
};