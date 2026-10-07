async function archiveOldMessages({ Message, ArchivedChat, cutoff, batchSize }) {
  let archived = 0;
  let deleted = 0;

  while (true) {
    const oldMessages = await Message.find({ createdAt: { $lt: cutoff } })
      .sort({ createdAt: 1, _id: 1 })
      .limit(batchSize)
      .lean();

    if (!oldMessages.length) break;

    const operations = oldMessages.map((message) => ({
      updateOne: {
        filter: { originalId: message._id },
        update: {
          $set: {
            roomId: message.roomId,
            senderId: message.senderId,
            receiverId: message.receiverId,
            groupId: message.groupId,
            deletedFor: message.deletedFor || [],
            deletedForEveryone: message.deletedForEveryone || false,
            messageType: message.messageType,
            text: message.text,
            mediaUrl: message.mediaUrl,
            mediaName: message.mediaName,
            mediaSize: message.mediaSize,
            messageCreatedAt: message.createdAt,
            messageUpdatedAt: message.updatedAt
          },
          $setOnInsert: {
            originalId: message._id,
            archivedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    try {
      await ArchivedChat.bulkWrite(operations, { ordered: false });

      const ids = oldMessages.map((message) => message._id);
      const result = await Message.deleteMany({
        _id: { $in: ids },
        createdAt: { $lt: cutoff }
      });

      archived += oldMessages.length;
      deleted += result.deletedCount;
    } catch (error) {
      error.archiveSummary = { archived, deleted };
      throw error;
    }
  }

  return { archived, deleted };
}

module.exports = { archiveOldMessages };
