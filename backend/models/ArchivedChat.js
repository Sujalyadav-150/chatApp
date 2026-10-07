const mongoose = require("mongoose");

// Messages older than the retention window are moved here by the cron job.
// The schema mirrors Message plus a link to the original document so nothing
// is lost if the job needs to be inspected or replayed.
const archivedChatSchema = new mongoose.Schema({
  // Unique original message id makes archiving idempotent if a job retries.
  originalId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
  roomId: { type: String, required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  messageType: { type: String, enum: ["text", "image", "video", "audio", "file"], default: "text" },
  text: { type: String, trim: true, default: "" },
  mediaUrl: { type: String, default: "" },
  mediaName: { type: String, default: "" },
  mediaSize: { type: Number, default: 0 },
  // Original timestamps of the message (kept so history still sorts correctly).
  messageCreatedAt: { type: Date, index: true },
  messageUpdatedAt: { type: Date },
  archivedAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model("ArchivedChat", archivedChatSchema);