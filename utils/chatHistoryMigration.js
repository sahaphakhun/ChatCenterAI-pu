const MIGRATION_NAME = "chat_history_sender_id_backfill";

async function migrateChatHistorySenderId(db, options = {}) {
  const { force = false, logger = console } = options || {};
  if (!db) {
    throw new Error("Database instance is required");
  }

  const migrationLogsColl = db.collection("migration_logs");
  if (!force) {
    const existing = await migrationLogsColl.findOne({
      migration: MIGRATION_NAME,
      completed: true,
    });
    if (existing) {
      logger.log(`[Migration] ${MIGRATION_NAME}: already completed, skip`);
      return { skipped: true, alreadyCompleted: true };
    }
  }

  const chatColl = db.collection("chat_history");
  const filter = {
    $and: [
      {
        $or: [
          { senderId: { $exists: false } },
          { senderId: null },
          { senderId: "" },
        ],
      },
      { userId: { $exists: true, $ne: null, $ne: "" } },
    ],
  };

  const updatePipeline = [
    { $set: { senderId: { $toString: "$userId" } } },
  ];

  const result = await chatColl.updateMany(filter, updatePipeline);

  const indexResults = [];
  try {
    const senderIndex = await chatColl.createIndex(
      { senderId: 1, timestamp: 1 },
      { name: "senderId_timestamp" },
    );
    indexResults.push(senderIndex);
  } catch (err) {
    logger.warn(
      `[Migration] ${MIGRATION_NAME}: create senderId index failed`,
      err?.message || err,
    );
  }

  try {
    const userIndex = await chatColl.createIndex(
      { userId: 1, timestamp: 1 },
      {
        name: "userId_timestamp",
        partialFilterExpression: { userId: { $exists: true } },
      },
    );
    indexResults.push(userIndex);
  } catch (err) {
    logger.warn(
      `[Migration] ${MIGRATION_NAME}: create userId index failed`,
      err?.message || err,
    );
  }

  await migrationLogsColl.updateOne(
    { migration: MIGRATION_NAME },
    {
      $set: {
        migration: MIGRATION_NAME,
        completed: true,
        completedAt: new Date(),
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    },
    { upsert: true },
  );

  logger.log(
    `[Migration] ${MIGRATION_NAME}: matched ${result.matchedCount}, updated ${result.modifiedCount}`,
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    indexes: indexResults,
  };
}

module.exports = { migrateChatHistorySenderId, MIGRATION_NAME };
