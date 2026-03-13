#!/usr/bin/env node
/**
 * Rebuild Conversation Threads
 * 
 * One-time migration script that scans chat_history, groups messages by
 * senderId+botId+platform, and creates conversation_threads documents
 * enriched with instruction refs, order data, and auto-tags.
 *
 * Usage:
 *   node scripts/rebuild-conversation-threads.js
 *
 * Or via the admin API:
 *   POST /api/instruction-conversations/:instructionId/rebuild
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");
const ConversationThreadService = require("../services/conversationThreadService");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = "chatbot";

async function main() {
    console.log("════════════════════════════════════════════");
    console.log("  Rebuild Conversation Threads");
    console.log("════════════════════════════════════════════");
    console.log(`MongoDB: ${MONGO_URI}`);
    console.log(`Database: ${DB_NAME}`);
    console.log("");

    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const threadService = new ConversationThreadService(db);

    // Step 1: Ensure indexes
    console.log("[1/3] Creating indexes...");
    await threadService.ensureIndexes();

    // Step 2: Rebuild all threads
    console.log("[2/3] Rebuilding threads from chat_history...");
    const startTime = Date.now();

    const result = await threadService.rebuildAllThreads((processed, total) => {
        const pct = Math.round((processed / total) * 100);
        process.stdout.write(`\r  Progress: ${processed}/${total} (${pct}%)`);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ✅ Done! ${result.processedThreads} threads created from ${result.totalGroups} groups in ${elapsed}s`);

    // Step 3: Summary
    console.log("[3/3] Summary...");
    const threadCount = await db.collection("conversation_threads").countDocuments();
    const withOrdersCount = await db.collection("conversation_threads").countDocuments({ hasOrder: true });
    const purchasedCount = await db.collection("conversation_threads").countDocuments({ outcome: "purchased" });

    console.log(`  Total threads: ${threadCount}`);
    console.log(`  With orders: ${withOrdersCount}`);
    console.log(`  Purchased: ${purchasedCount}`);

    console.log("\n════════════════════════════════════════════");
    console.log("  Migration complete!");
    console.log("════════════════════════════════════════════");

    await client.close();
    process.exit(0);
}

main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
