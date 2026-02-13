/**
 * Drop legacy Facebook comment collections (configs & logs).
 *
 * Use when migrating to the new comment auto-reply system.
 * This script performs destructive drops (no backup).
 *
 * Run (with explicit opt-in):
 *   DROP_LEGACY_FB_COMMENT=1 node scripts/drop-legacy-facebook-comment.js
 *
 * You can wire this into your deploy pipeline; without the env flag it will noop.
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "chatbot";
const SHOULD_DROP =
  process.env.DROP_LEGACY_FB_COMMENT === "1" ||
  process.env.DROP_LEGACY_FB_COMMENT === "true";

const LEGACY_COLLECTIONS = [
  "facebook_comment_configs",
  "facebook_comment_logs",
];

async function dropLegacyCollections() {
  if (!SHOULD_DROP) {
    console.log(
      "⚠️  Skipping drop. Set DROP_LEGACY_FB_COMMENT=1 to perform the cleanup.",
    );
    return;
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // Discover existing collections to avoid errors
    const existing = new Set(
      (
        await db
          .listCollections({ name: { $in: LEGACY_COLLECTIONS } }, { nameOnly: true })
          .toArray()
      ).map((c) => c.name),
    );

    if (existing.size === 0) {
      console.log("ℹ️  No legacy collections found. Nothing to drop.");
      return;
    }

    for (const collName of LEGACY_COLLECTIONS) {
      if (!existing.has(collName)) {
        console.log(`- ${collName}: not found, skipped`);
        continue;
      }
      await db.collection(collName).drop();
      console.log(`✅ Dropped collection: ${collName}`);
    }

    console.log("🏁 Legacy Facebook comment data removed.");
  } catch (err) {
    console.error("❌ Failed to drop legacy collections:", err.message || err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

dropLegacyCollections();
