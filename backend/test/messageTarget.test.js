const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveMessageTarget } = require("../utils/messageTarget");

test("resolves a group target only when its id matches the group room", () => {
  assert.deepEqual(resolveMessageTarget("group_abc123", { groupId: "ABC123" }), {
    type: "group",
    groupId: "ABC123"
  });
});

test("resolves a personal target and normalizes the receiver email", () => {
  assert.deepEqual(resolveMessageTarget("a@example.com_b@example.com", {
    receiverEmail: " B@EXAMPLE.COM "
  }), {
    type: "personal",
    receiverEmail: "b@example.com"
  });
});

test("rejects a personal request addressed to a group room", () => {
  assert.throws(
    () => resolveMessageTarget("group_abc123", { receiverEmail: "b@example.com" }),
    { message: "Message destination does not match room", status: 400 }
  );
});

test("rejects a group target sent to a personal room", () => {
  assert.throws(
    () => resolveMessageTarget("a@example.com_b@example.com", { groupId: "abc123" }),
    { message: "Message destination does not match room", status: 400 }
  );
});

test("rejects a group id that does not match the room", () => {
  assert.throws(
    () => resolveMessageTarget("group_abc123", { groupId: "def456" }),
    { message: "Message destination does not match room", status: 400 }
  );
});
