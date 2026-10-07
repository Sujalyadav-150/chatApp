// Scheduled job: move messages older than the retention window from the active
// Chat collection (Message) into ArchivedChat.
//
// Each bounded batch is archived before its source messages are deleted.
// A failed batch remains in Message and can be retried without archive duplicates.
const cron = require("node-cron");
const Message = require("../models/Message");
const ArchivedChat = require("../models/ArchivedChat");
const { archiveOldMessages: archiveMessagesInBatches } = require("./archiveBatch");

// Configurable through .env
const RETENTION_HOURS = Number(process.env.ARCHIVE_AFTER_HOURS) || 24;
const configuredBatchSize = process.env.ARCHIVE_BATCH_SIZE
  ? Number(process.env.ARCHIVE_BATCH_SIZE)
  : 500;
const BATCH_SIZE = Number.isInteger(configuredBatchSize) && configuredBatchSize > 0
  ? configuredBatchSize
  : 500;
const SCHEDULE = process.env.ARCHIVE_CRON || "0 2 * * *"; // daily at 02:00 UTC

if (BATCH_SIZE !== configuredBatchSize) {
  console.error(`[archive] invalid ARCHIVE_BATCH_SIZE "${process.env.ARCHIVE_BATCH_SIZE}", using 500`);
}

// Simple in-memory lock so two runs never overlap.
let running = false;

async function archiveOldMessages() {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
  return archiveMessagesInBatches({ Message, ArchivedChat, cutoff, batchSize: BATCH_SIZE });
}

async function runArchiveSafely() {
  if (running) {
    return { archived: 0, skipped: true };
  }

  running = true;
  try {
    const summary = await archiveOldMessages();
    if (summary.archived) {
      console.log(`[archive] moved ${summary.archived} message(s), deleted ${summary.deleted} from Message`);
    }
    return summary;
  } catch (error) {
    const summary = error.archiveSummary || { archived: 0, deleted: 0 };
    console.error(
      `[archive] failed after archiving ${summary.archived} and deleting ${summary.deleted}; current batch was retained:`,
      error.message
    );
    return { ...summary, error: error.message };
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

module.exports = {
  startArchiveJob,
  runArchiveSafely,
  archiveOldMessages,
  RETENTION_HOURS,
  BATCH_SIZE,
  SCHEDULE
};