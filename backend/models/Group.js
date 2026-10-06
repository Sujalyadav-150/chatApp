const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Deterministic, unique room ID used with Socket.IO rooms.
    roomId: { type: String, required: true, unique: true, index: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Group", groupSchema);