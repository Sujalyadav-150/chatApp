function getMessageDeletion(message, userId, scope) {
  if (scope !== "me" && scope !== "everyone") {
    throw Object.assign(new Error("Choose who to delete the message for"), { status: 400 });
  }

  if (scope === "everyone" && String(message.senderId) !== String(userId)) {
    throw Object.assign(new Error("Only the sender can delete this message for everyone"), { status: 403 });
  }

  return { scope, userId: String(userId) };
}

module.exports = { getMessageDeletion };
