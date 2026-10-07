function resolveMessageTarget(roomId, { groupId, receiverEmail } = {}) {
  if (String(roomId).startsWith("group_")) {
    const roomGroupId = String(roomId).slice("group_".length);
    if (!groupId || String(groupId).toLowerCase() !== roomGroupId.toLowerCase() || receiverEmail) {
      throw Object.assign(new Error("Message destination does not match room"), { status: 400 });
    }

    return { type: "group", groupId: String(groupId) };
  }

  if (groupId) {
    throw Object.assign(new Error("Message destination does not match room"), { status: 400 });
  }

  const email = String(receiverEmail || "").trim().toLowerCase();
  if (!email) {
    throw Object.assign(new Error("receiverEmail is required"), { status: 400 });
  }

  return { type: "personal", receiverEmail: email };
}

module.exports = { resolveMessageTarget };
