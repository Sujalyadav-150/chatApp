// Scheduled job: move messages older than the retention window from the active
// Chat collection (Message) into ArchivedChat.
//
// Safety design (never lose messages):
//   1. find messages older than the cutoff
//   2. insert them into ArchivedChat FIRST
//   3. only delete from Message AFTER the insert succeeded
//   4. if anything throws, we delete nothing - the messages stay in Message
const cron = require("node-cron");
const Message = require("../models/Message");
const ArchivedChat = require("../models/ArchivedChat");

// Configurable through .env
const RETENTION_HOURS = Number(process.env.ARCHIVE_AFTER_HOURS) || 24;
const SCHEDULE = process.env.ARCHIVE_CRON || "0 * * * *"; // every hour

// Simple in-memory lock so two runs never overlap.
let running = false;

async function archiveOldMessages() {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const oldMessages = await Message.find({ createdAt: { $lt: cutoff } }).lean();

  if (!oldMessages.length) {
    return { archived: 0, deleted: 0 };
  }

  // Upsert by originalId so the job is safe to retry. For example, if the
  // process crashes after archiving but before deleting, the next run updates
  // the same archive documents instead of creating duplicates.
  const operations = oldMessages.map((m) => ({
    updateOne: {
      filter: { originalId: m._id },
      update: {
        $set: {
          roomId: m.roomId,
          senderId: m.senderId,
          receiverId: m.receiverId,
          groupId: m.groupId,
          messageType: m.messageType,
          text: m.text,
          mediaUrl: m.mediaUrl,
          mediaName: m.mediaName,
          mediaSize: m.mediaSize,
          messageCreatedAt: m.createdAt,
          messageUpdatedAt: m.updatedAt
        },
        $setOnInsert: {
          originalId: m._id,
          archivedAt: new Date()
        }
      },
      upsert: true
    }
  }));

  // Step 1: archive first. If this fails, nothing is deleted from Message.
  await ArchivedChat.bulkWrite(operations, { ordered: false });

  // Step 2: delete only after all archive writes have completed successfully.
  const ids = oldMessages.map((m) => m._id);
  const result = await Message.deleteMany({ _id: { $in: ids } });

  return { archived: oldMessages.length, deleted: result.deletedCount };
}

async function runArchiveSafely() {
  if (running) {
    return { archived: 0, skipped: true };
  }

  running = true;
  try {
    const summary = await archiveOldMessages();
    if (summary.archived) {
      console.log(`[archive] moved ${summary.archived} message(s) to ArchivedChat`);
    }
    return summary;
  } catch (error) {
    // Never crash the process; nothing was deleted.
    console.error("[archive] failed, no messages were deleted:", error.message);
    return { archived: 0, error: error.message };
  } finally {
    running = false;
  }
}

function startArchiveJob() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[archive] invalid ARCHIVE_CRON "${SCHEDULE}", job not scheduled`);
    return null;
  }

  const task = cron.schedule(SCHEDULE, runArchiveSafely);
  console.log(`[archive] scheduled (${SCHEDULE}), retention ${RETENTION_HOURS}h`);
  return task;
}

module.exports = { startArchiveJob, runArchiveSafely, archiveOldMessages, RETENTION_HOURS, SCHEDULE };