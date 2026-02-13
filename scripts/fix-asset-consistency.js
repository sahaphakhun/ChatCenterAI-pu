/**
 * Fix Asset Data Consistency
 *
 * Checks for orphaned metadata (fileId/thumbFileId pointing to non-existent files)
 * and fixes them by setting those IDs to null.
 */

require("dotenv").config();
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  console.log("🔍 Starting asset consistency check...\n");

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("✅ Connected to MongoDB\n");

  const db = client.db("chatbot");

  // Check instruction assets
  console.log("=".repeat(60));
  console.log("📋 Checking INSTRUCTION ASSETS");
  console.log("=".repeat(60));
  await checkAndFixAssets(
    db,
    "instruction_assets",
    "instructionAssets"
  );

  // Check followup assets
  console.log("\n" + "=".repeat(60));
  console.log("📋 Checking FOLLOW-UP ASSETS");
  console.log("=".repeat(60));
  await checkAndFixAssets(
    db,
    "follow_up_assets",
    "followupAssets"
  );

  await client.close();
  console.log("\n✅ Done!");
}

async function checkAndFixAssets(db, collectionName, bucketName) {
  const coll = db.collection(collectionName);
  const bucket = new GridFSBucket(db, { bucketName });

  const assets = await coll.find({}).toArray();
  console.log(`\nFound ${assets.length} assets in ${collectionName}`);

  let fixedCount = 0;
  let okCount = 0;

  for (const asset of assets) {
    const label = asset.label || asset.fileName || asset._id.toString();
    let needsUpdate = false;
    const updates = {};

    // Check main file
    if (asset.fileId) {
      const exists = await checkFileExists(bucket, asset.fileId);
      if (!exists) {
        console.log(
          `❌ MISSING: ${label} - fileId ${asset.fileId} not found in GridFS`
        );
        updates.fileId = null;
        needsUpdate = true;
      }
    }

    // Check thumbnail file
    const thumbId = asset.thumbFileId || asset.thumbId;
    if (thumbId) {
      const exists = await checkFileExists(bucket, thumbId);
      if (!exists) {
        console.log(
          `❌ MISSING: ${label} - thumbFileId ${thumbId} not found in GridFS`
        );
        updates.thumbFileId = null;
        if (asset.thumbId) updates.thumbId = null;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      console.log(`   🔧 Fixing metadata for: ${label}`);
      await coll.updateOne({ _id: asset._id }, { $set: updates });
      fixedCount++;
    } else {
      okCount++;
    }
  }

  console.log(`\n📊 Results for ${collectionName}:`);
  console.log(`   ✅ OK: ${okCount}`);
  console.log(`   🔧 Fixed: ${fixedCount}`);
}

async function checkFileExists(bucket, fileId) {
  try {
    const objectId = toObjectId(fileId);
    if (!objectId) return false;

    const files = await bucket.find({ _id: objectId }).toArray();
    return files.length > 0;
  } catch (err) {
    return false;
  }
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id);
  } catch (e) {
    return null;
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
