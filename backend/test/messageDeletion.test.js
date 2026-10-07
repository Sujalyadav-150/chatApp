const assert = require("node:assert/strict");
const test = require("node:test");
const { getMessageDeletion } = require("../utils/messageDeletion");

test("allows a sender to delete their message for everyone", () => {
  assert.deepEqual(
    getMessageDeletion({ senderId: "sender-1" }, "sender-1", "everyone"),
    { scope: "everyone", userId: "sender-1" }
  );
});

test("prevents another participant from deleting a message for everyone", () => {
  assert.throws(
    () => getMessageDeletion({ senderId: "sender-1" }, "other-user", "everyone"),
    { message: "Only the sender can delete this message for everyone", status: 403 }
  );
});

test("allows a participant to delete a message only for themselves", () => {
  assert.deepEqual(
    getMessageDeletion({ senderId: "sender-1" }, "other-user", "me"),
    { scope: "me", userId: "other-user" }
  );
});

test("rejects unknown deletion scopes", () => {
  assert.throws(
    () => getMessageDeletion({ senderId: "sender-1" }, "sender-1", "room"),
    { message: "Choose who to delete the message for", status: 400 }
  );
});
