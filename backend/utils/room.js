// Shared helpers for building deterministic room IDs.
// Both the HTTP layer and the Socket.IO layer use these, so the room a client
// joins is always the same one the backend computes.

// One-to-one chat room. The order of the two emails must not matter,
// so we lowercase and sort them:  b@gmail.com + a@gmail.com -> a@gmail.com_b@gmail.com
function createRoomId(emailA, emailB) {
  return [String(emailA).toLowerCase(), String(emailB).toLowerCase()].sort().join("_");
}

// Group rooms get a distinct "group_" prefix so a group room can never
// collide with a personal room (which is always "email_email").
function createGroupRoomId(groupId) {
  return `group_${String(groupId)}`;
}

module.exports = { createRoomId, createGroupRoomId };