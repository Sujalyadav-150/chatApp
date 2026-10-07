const Message = require("../models/Message");
const Group = require("../models/Group");
const User = require("../models/User");
const { createRoomId } = require("../utils/room");
const { toPublicMessage } = require("../utils/message");
const { resolveMessageTarget } = require("../utils/messageTarget");
const { getMessageDeletion } = require("../utils/messageDeletion");

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

    let messageQuery;
    if (roomId.startsWith("group_")) {
      const group = await Group.findOne({ roomId }).select("_id members");
      if (!group || !group.members.some((member) => String(member) === String(req.user.id))) {
        return res.status(403).json({ success: false, message: "You do not have access to this room" });
      }
      messageQuery = { roomId, groupId: group._id, receiverId: null };
    } else {
      if (!(await canAccessRoom(req.user, roomId))) {
        return res
          .status(403)
          .json({ success: false, message: "You do not have access to this room" });
      }
      messageQuery = {
        roomId,
        groupId: null,
        $or: [{ senderId: req.user.id }, { receiverId: req.user.id }],
        deletedFor: { $ne: req.user.id }
      };
    }

    if (roomId.startsWith("group_")) {
      messageQuery.deletedFor = { $ne: req.user.id };
    }

    const messages = await Message.find(messageQuery)
      .sort({ createdAt: 1 })
      .populate("senderId", "name email");

    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    if (!(await canAccessRoom(req.user, roomId))) {
      return res.status(403).json({ success: false, message: "You do not have access to this room" });
    }

    const message = await Message.findOne({ _id: messageId, roomId });
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    const { scope, userId } = getMessageDeletion(message, req.user.id, req.body.scope);
    const io = req.app.get("io");

    if (scope === "everyone") {
      const result = await Message.deleteOne({ _id: message._id, roomId, senderId: req.user.id });
      if (!result.deletedCount) {
        return res.status(404).json({ success: false, message: "Message was already deleted" });
      }
      if (io) io.to(roomId).emit("message_deleted", { roomId, messageId: String(message._id), scope });
    } else {
      const result = await Message.updateOne(
        { _id: message._id, roomId },
        { $addToSet: { deletedFor: req.user.id } }
      );
      if (!result.matchedCount) {
        return res.status(404).json({ success: false, message: "Message was already deleted" });
      }
      if (io) {
        io.to(`user_${userId}`).emit("message_deleted", {
          roomId,
          messageId: String(message._id),
          scope,
          userId
        });
      }
    }

    res.json({ success: true, scope });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const text = String(req.body.text || "").trim();
    const target = resolveMessageTarget(roomId, req.body);
    if (!text) {
      return res.status(400).json({ success: false, message: "Message cannot be empty" });
    }

    let receiverId = null;
    let groupId = null;

    if (target.type === "group") {
      const group = await Group.findOne({ roomId, _id: target.groupId }).select("_id members");
      if (!group) {
        return res.status(404).json({ success: false, message: "Group not found" });
      }

      const isMember = group.members.some((member) => String(member) === String(req.user.id));
      if (!isMember) {
        return res.status(403).json({ success: false, message: "You are not a member of this group" });
      }
      groupId = group._id;
    } else {
      const receiver = await User.findOne({ email: target.receiverEmail }).select("_id email");
      if (!receiver) {
        return res.status(404).json({ success: false, message: "Receiver does not exist" });
      }
      if (String(receiver._id) === String(req.user.id)) {
        return res.status(400).json({ success: false, message: "You cannot message yourself" });
      }

      if (createRoomId(req.user.email, receiver.email) !== roomId.toLowerCase()) {
        return res.status(403).json({ success: false, message: "You do not have access to this room" });
      }
      receiverId = receiver._id;
    }

    const message = await Message.create({
      roomId,
      senderId: req.user.id,
      receiverId,
      groupId,
      messageType: "text",
      text
    });
    const populated = await message.populate("senderId", "name email");
    const payload = toPublicMessage(populated);
    const io = req.app.get("io");
    if (io) io.to(roomId).emit("new_message", payload);

    res.status(201).json({ success: true, message: payload });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

module.exports = { getMessages, sendMessage, deleteMessage, canAccessRoom };