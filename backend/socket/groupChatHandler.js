const Message = require("../models/Message");
const Group = require("../models/Group");
const { toPublicMessage } = require("../utils/message");

// Group chat events.
module.exports = function registerGroupChat(io, socket) {
  // Join a group room. Only members are allowed to join.
  socket.on("join_group", async ({ groupId } = {}) => {
    try {
      if (!groupId) return socket.emit("chat_error", { message: "groupId is required" });

      const group = await Group.findById(groupId).select("roomId members");
      if (!group) return socket.emit("chat_error", { message: "Group not found" });

      const isMember = group.members.some((m) => String(m) === String(socket.user.id));
      if (!isMember) {
        return socket.emit("chat_error", { message: "You are not a member of this group" });
      }

      socket.join(group.roomId);
      socket.emit("room_joined", {
        roomId: group.roomId,
        roomType: "group",
        groupId: String(group._id)
      });
    } catch (error) {
      socket.emit("chat_error", { message: error.message });
    }
  });

  // Send a text message to a group.
  socket.on("group_message", async ({ groupId, text } = {}) => {
    try {
      const value = String(text || "").trim();
      if (!groupId || !value) return;

      const group = await Group.findById(groupId).select("roomId members");
      if (!group) return socket.emit("chat_error", { message: "Group not found" });

      const isMember = group.members.some((m) => String(m) === String(socket.user.id));
      if (!isMember) {
        return socket.emit("chat_error", { message: "You are not a member of this group" });
      }

      const message = await Message.create({
        roomId: group.roomId,
        senderId: socket.user.id,
        groupId: group._id,
        messageType: "text",
        text: value
      });

      const populated = await message.populate("senderId", "name email");

      // Everyone currently in the group room receives it.
      io.to(group.roomId).emit("new_message", toPublicMessage(populated));
    } catch (error) {
      socket.emit("chat_error", { message: error.message });
    }
  });
};