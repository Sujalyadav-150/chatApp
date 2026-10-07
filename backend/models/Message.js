const mongoose = require("mongoose");

// One collection for both personal and group chat (as required).
// - Personal message : receiverId is set, groupId is null.
// - Group message    : groupId is set, receiverId is null.
const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null, index: true },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // "text" | "image" | "video" | "audio" | "file"
    messageType: { type: String, enum: ["text", "image", "video", "audio", "file"], default: "text" },
    text: { type: String, trim: true, default: "" },
    mediaUrl: { type: String, default: "" },
    mediaName: { type: String, default: "" },
    mediaSize: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Supports the archive job's bounded oldest-first scan.
messageSchema.index({ createdAt: 1, _id: 1 });

module.exports = mongoose.model("Message", messageSchema);