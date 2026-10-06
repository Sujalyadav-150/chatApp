const Message = require("../models/Message");
const Group = require("../models/Group");
const { createRoomId } = require("../utils/room");

// Check that the logged-in user is allowed to read/write this room.
// Prevents a client from reading an arbitrary room by guessing its id.
async function canAccessRoom(user, roomId) {
  if (!roomId) return false;

  // Group rooms are "group_<id>".
  if (roomId.startsWith("group_")) {
    const group = await Group.findOne({ roomId }).select("members");
    if (!group) return false;
    return group.members.some((m) => String(m) === String(user.id));
  }

  // Personal rooms are createRoomId(emailA, emailB) = "<emailA>_<emailB>" sorted.
  // Emails may themselves contain "_", so instead of splitting we strip our own
  // email from either end and verify the result reproduces the same room id.
  const email = String(user.email || "").toLowerCase();
  const room = roomId.toLowerCase();

  const candidates = [];
  if (room.startsWith(`${email}_`)) candidates.push(room.slice(email.length + 1));
  if (room.endsWith(`_${email}`)) candidates.push(room.slice(0, room.length - email.length - 1));

  return candidates.some((other) => other && createRoomId(email, other) === room);
}

// GET /api/messages/:roomId
const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!(await canAccessRoom(req.user, roomId))) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to this room" });
    }

    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 })
      .populate("senderId", "name email");

    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getMessages, canAccessRoom };