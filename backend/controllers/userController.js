const User = require("../models/User");

// Never return the password hash.
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone };
}

// GET /api/users/me - the currently logged-in user.
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/users/check?email=... - validate an email BEFORE opening a chat.
// The frontend calls this so a user can never start a chat with a fake email.
exports.checkUser = async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, exists: false, message: "Email is required" });
    }

    const user = await User.findOne({ email }).select("name email");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, exists: false, message: "No user found with this email" });
    }

    if (String(user._id) === String(req.user.id)) {
      return res
        .status(400)
        .json({ success: false, exists: true, message: "You cannot start a chat with yourself" });
    }

    res.json({
      success: true,
      exists: true,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/users - list other users (used to pick group members).
exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select("name email")
      .sort({ name: 1 })
      .limit(100);

    res.json({
      success: true,
      users: users.map((u) => ({ id: u._id, name: u.name, email: u.email }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};