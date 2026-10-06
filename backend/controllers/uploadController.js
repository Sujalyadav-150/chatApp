const Message = require("../models/Message");
const Group = require("../models/Group");
const User = require("../models/User");
const { uploadBuffer, isConfigured } = require("../services/s3Service");
const { fileTypeFromMime } = require("../middleware/upload");
const { createRoomId, createGroupRoomId } = require("../utils/room");
const { toPublicMessage } = require("../utils/message");

// Work out which room the media belongs to and verify the sender is allowed
// to post there. Throws an error with a status code on any problem.
async function resolveTarget(req) {
  const roomType = String(req.body.roomType || "personal");

  if (roomType === "group") {
    const groupId = req.body.groupId;
    if (!groupId) {
      throw Object.assign(new Error("groupId is required for group media"), { status: 400 });
    }

    const group = await Group.findById(groupId).select("roomId members");
    if (!group) throw Object.assign(new Error("Group not found"), { status: 404 });

    const isMember = group.members.some((m) => String(m) === String(req.user.id));
    if (!isMember) {
      throw Object.assign(new Error("You are not a member of this group"), { status: 403 });
    }

    return { roomId: createGroupRoomId(group._id), receiverId: null, groupId: group._id };
  }

  // Personal chat: the receiver email must exist before we accept the file.
  const receiverEmail = String(req.body.receiverEmail || "").trim().toLowerCase();
  if (!receiverEmail) {
    throw Object.assign(new Error("receiverEmail is required for personal media"), { status: 400 });
  }

  const receiver = await User.findOne({ email: receiverEmail }).select("_id email");
  if (!receiver) throw Object.assign(new Error("Receiver does not exist"), { status: 404 });

  return {
    roomId: createRoomId(req.user.email, receiver.email),
    receiverId: receiver._id,
    groupId: null
  };
}

// POST /api/upload   (multipart/form-data: file, roomType, receiverEmail|groupId)
// Uploads to S3, saves the message, then broadcasts it to the correct room.
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Validate the destination FIRST (cheap, local checks) so a bad receiver or
    // a group the user is not part of fails with a precise error before we ever
    // touch S3.
    const target = await resolveTarget(req);

    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Media upload is disabled: AWS S3 environment variables are not set."
      });
    }

    const { url } = await uploadBuffer({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      contentType: req.file.mimetype
    });

    const message = await Message.create({
      roomId: target.roomId,
      senderId: req.user.id,
      receiverId: target.receiverId,
      groupId: target.groupId,
      messageType: fileTypeFromMime(req.file.mimetype),
      text: String(req.body.text || "").trim(),
      mediaUrl: url,
      mediaName: req.file.originalname,
      mediaSize: req.file.size
    });

    const populated = await message.populate("senderId", "name email");
    const payload = toPublicMessage(populated);

    // Broadcast to the specific room only.
    const io = req.app.get("io");
    if (io) io.to(target.roomId).emit("new_message", payload);

    res.status(201).json({ success: true, message: "File uploaded", data: payload });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};