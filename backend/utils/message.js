// Small helpers shared by controllers and socket handlers.

// Convert a stored message (populated or not) into a plain object for clients.
// senderId becomes { _id, name, email } when it was populated, otherwise the
// raw ObjectId is returned so the frontend never crashes.
function toPublicMessage(messageDoc) {
  const message = messageDoc.toObject ? messageDoc.toObject() : messageDoc;
  const sender = message.senderId;

  return {
    _id: message._id,
    roomId: message.roomId,
    senderId:
      sender && sender._id
        ? { _id: sender._id, name: sender.name, email: sender.email }
        : sender,
    receiverId: message.receiverId || null,
    groupId: message.groupId || null,
    deletedForEveryone: Boolean(message.deletedForEveryone),
    messageType: message.messageType || "text",
    text: message.text || "",
    mediaUrl: message.mediaUrl || "",
    mediaName: message.mediaName || "",
    mediaSize: message.mediaSize || 0,
    createdAt: message.createdAt
  };
}

module.exports = { toPublicMessage };