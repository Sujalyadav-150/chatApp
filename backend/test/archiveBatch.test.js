const assert = require("node:assert/strict");
const test = require("node:test");
const { archiveOldMessages } = require("../jobs/archiveBatch");

function createModels(messages, { failArchive = false, failFirstDelete = false } = {}) {
  const archive = new Map();
  const batchSizes = [];
  let deleteCalls = 0;

  const Message = {
    find(query) {
      return {
        sort() {
          return this;
        },
        limit(size) {
          this.size = size;
          return this;
        },
        async lean() {
          const batch = messages
            .filter((message) => message.createdAt < query.createdAt.$lt)
            .sort((a, b) => a.createdAt - b.createdAt || a._id.localeCompare(b._id))
            .slice(0, this.size);
          batchSizes.push(batch.length);
          return batch;
        }
      };
    },
    async deleteMany(query) {
      deleteCalls += 1;
      if (failFirstDelete && deleteCalls === 1) throw new Error("delete failed");
      const before = messages.length;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (query._id.$in.includes(messages[i]._id) && messages[i].createdAt < query.createdAt.$lt) {
          messages.splice(i, 1);
        }
      }
      return { deletedCount: before - messages.length };
    }
  };

  const ArchivedChat = {
    async bulkWrite(operations) {
      if (failArchive) throw new Error("archive failed");
      for (const operation of operations) {
        const { filter, update } = operation.updateOne;
        archive.set(filter.originalId, {
          ...archive.get(filter.originalId),
          ...update.$setOnInsert,
          ...update.$set
        });
      }
    }
  };

  return { Message, ArchivedChat, archive, batchSizes, getDeleteCalls: () => deleteCalls };
}

function message(id, createdAt, messageType = "text") {
  return {
    _id: id,
    roomId: "room",
    senderId: "sender",
    messageType,
    text: id,
    createdAt
  };
}

test("archives and deletes old messages in bounded batches, leaving recent messages active", async () => {
  const cutoff = new Date("2026-10-06T00:00:00Z");
  const messages = [
    message("old-1", new Date("2026-10-01T00:00:00Z")),
    message("old-2", new Date("2026-10-02T00:00:00Z"), "audio"),
    { ...message("old-3", new Date("2026-10-03T00:00:00Z")), deletedForEveryone: true },
    message("recent", new Date("2026-10-07T00:00:00Z"))
  ];
  const models = createModels(messages);

  const result = await archiveOldMessages({ ...models, cutoff, batchSize: 2 });

  assert.deepEqual(result, { archived: 3, deleted: 3 });
  assert.deepEqual(models.batchSizes, [2, 1, 0]);
  assert.equal(models.archive.size, 3);
  assert.equal(models.archive.get("old-2").messageType, "audio");
  assert.equal(models.archive.get("old-3").deletedForEveryone, true);
  assert.deepEqual(messages.map(({ _id }) => _id), ["recent"]);
});

test("keeps a batch in Message if writing that batch to ArchivedChat fails", async () => {
  const cutoff = new Date("2026-10-06T00:00:00Z");
  const messages = [message("old-1", new Date("2026-10-01T00:00:00Z"))];
  const models = createModels(messages, { failArchive: true });

  await assert.rejects(
    archiveOldMessages({ ...models, cutoff, batchSize: 2 }),
    /archive failed/
  );
  assert.equal(models.getDeleteCalls(), 0);
  assert.equal(messages.length, 1);
});

test("retries safely when archive succeeds but deleting the active batch fails", async () => {
  const cutoff = new Date("2026-10-06T00:00:00Z");
  const messages = [message("old-1", new Date("2026-10-01T00:00:00Z"))];
  const models = createModels(messages, { failFirstDelete: true });

  await assert.rejects(
    archiveOldMessages({ ...models, cutoff, batchSize: 2 }),
    (error) => {
      assert.deepEqual(error.archiveSummary, { archived: 0, deleted: 0 });
      return /delete failed/.test(error.message);
    }
  );

  const result = await archiveOldMessages({ ...models, cutoff, batchSize: 2 });

  assert.deepEqual(result, { archived: 1, deleted: 1 });
  assert.equal(models.archive.size, 1);
  assert.equal(messages.length, 0);
});
