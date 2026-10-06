const Message = require("../models/Message");
const User = require("../models/User");
const { createRoomId } = require("../utils/room");
const { toPublicMessage } = require("../utils/message");

// Resolve the room for a pair of users. If the client supplied a roomId we
// verify it matches what the server computes, so a client can still do
// socket.emit("join_room", roomId) but cannot spoof an arbitrary room.
async function resolveRoom(socket, { roomId, receiverEmail } = {}) {
  const receiver = await User.findOne({
    email: String(receiverEmail || "").toLowerCase()
  }).select("_id email");

  if (!receiver) {
    throw new Error("Receiver does not exist");
  }

  const expected = createRoomId(socket.user.email, receiver.email);

  if (roomId && String(roomId).toLowerCase() !== expected) {
    throw new Error("Invalid room id");
  }

  return { roomId: expected, receiver };
}

// Personal (one-to-one) chat events.
module.exports = function registerPersonalChat(io, socket) {
  // Join the deterministic room for a pair of users.
  socket.on("join_room", async (payload = {}) => {
    try {
      const { roomId } = await resolveRoom(socket, payload);
      socket.join(roomId);
      socket.emit("room_joined", { roomId, roomType: "personal" });
    } catch (error) {
      socket.emit("chat_error", { message: error.message });
    }
  });

  // Send a text message to a one-to-one chat.
  socket.on("new_message", async ({ roomId, receiverEmail, text } = {}) => {
    try {
      const value = String(text || "").trim();
      if (!value) return;

      const { roomId: room, receiver } = await resolveRoom(socket, { roomId, receiverEmail });

      const message = await Message.create({
        roomId: room,
        senderId: socket.user.id,
        receiverId: receiver._id,
        messageType: "text",
        text: value
      });

      const populated = await message.populate("senderId", "name email");

      // Send only to this room (never a global broadcast).
      io.to(room).emit("new_message", toPublicMessage(populated));
    } catch (error) {
      socket.emit("chat_error", { message: error.message });
    }
  });
};