/**
 * Migration Script: Backfill senderId in chat_history
 *
 * Run: node scripts/migrate-chat-history-senderid.js [--force]
 */

const { MongoClient } = require("mongodb");
require("dotenv").config();
const {
  migrateChatHistorySenderId,
  MIGRATION_NAME,
} = require("../utils/chatHistoryMigration");

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017";
const DB_NAME = "chatbot";

async function run() {
  const force = process.argv.includes("--force");

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[Migration] ${MIGRATION_NAME}: start`);
  const result = await migrateChatHistorySenderId(db, {
    force,
    logger: console,
  });
  console.log(`[Migration] ${MIGRATION_NAME}: done`, result);

  await client.close();
}

run().catch((err) => {
  console.error(`[Migration] ${MIGRATION_NAME}: failed`, err);
  process.exit(1);
});
