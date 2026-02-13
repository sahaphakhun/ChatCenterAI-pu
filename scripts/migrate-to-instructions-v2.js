/**
 * Migration Script: Convert old instructions to new instructions_v2 structure
 *
 * Old structure: Each instruction is a single data item (text or table)
 * New structure: Each instruction contains multiple data items
 *
 * Run: node scripts/migrate-to-instructions-v2.js
 */

const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'chatbot';

function generateInstructionId() {
  return `inst_${crypto.randomBytes(6).toString('hex')}`;
}

function generateDataItemId() {
  return `item_${crypto.randomBytes(8).toString('hex')}`;
}

async function migrate() {
  console.log('🔄 Starting migration to instructions_v2...\n');

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(DB_NAME);

  const oldColl = db.collection('instructions');
  const newColl = db.collection('instructions_v2');

  // Check if instructions_v2 already has data
  const existingCount = await newColl.countDocuments();
  if (existingCount > 0) {
    console.log(`⚠️  instructions_v2 already has ${existingCount} documents.`);
    const answer = await askQuestion('Do you want to clear and recreate? (yes/no): ');
    if (answer.toLowerCase() === 'yes') {
      await newColl.deleteMany({});
      console.log('✅ Cleared instructions_v2\n');
    } else {
      console.log('❌ Migration cancelled.');
      client.close();
      process.exit(0);
    }
  }

  // Fetch all old instructions
  const oldInstructions = await oldColl.find({}).toArray();
  console.log(`📦 Found ${oldInstructions.length} old instructions\n`);

  if (oldInstructions.length === 0) {
    console.log('ℹ️  No instructions to migrate.');
    client.close();
    return;
  }

  // Group by similarity or create individual instructions
  // For simplicity, we'll create one new instruction with all old items as data items
  const now = new Date();

  const newInstruction = {
    instructionId: generateInstructionId(),
    name: 'Default Instruction (จากระบบเดิม)',
    description: 'รวมชุดข้อมูลทั้งหมดจากระบบเดิม',
    dataItems: oldInstructions.map((old, index) => ({
      itemId: generateDataItemId(),
      title: old.title || `ชุดข้อมูลที่ ${index + 1}`,
      type: old.type || 'text',
      content: old.content || '',
      data: old.type === 'table' ? (old.data || null) : null,
      order: index + 1,
      createdAt: old.createdAt || now,
      updatedAt: old.updatedAt || now
    })),
    usageCount: 0,
    createdAt: now,
    updatedAt: now
  };

  // Insert new instruction
  const result = await newColl.insertOne(newInstruction);
  console.log(`✅ Created new instruction: ${newInstruction.name}`);
  console.log(`   ID: ${result.insertedId}`);
  console.log(`   Data Items: ${newInstruction.dataItems.length}`);

  // Optional: Backup old collection
  console.log('\n📋 Backing up old instructions...');
  await oldColl.rename('instructions_backup_' + Date.now());
  console.log('✅ Old collection backed up\n');

  console.log('✅ Migration completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Visit /admin/dashboard to see the new interface');
  console.log('2. You can split the default instruction into multiple ones');
  console.log('3. Configure bots to use the new instruction\n');

  client.close();
}

function askQuestion(question) {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

// Run migration
migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
