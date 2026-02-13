/**
 * Reset Migration Script
 * ใช้สำหรับล้าง migration เดิมและเตรียมรัน migration ใหม่
 */

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

async function resetMigration() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db("chatbot");

    console.log("\n" + "=".repeat(60));
    console.log("🔄 Resetting Migration: Instructions V2");
    console.log("=".repeat(60));

    // 1. ลบ migration log
    console.log("\n[1] ลบ migration log...");
    const migrationLogsColl = db.collection("migration_logs");
    const deleteResult = await migrationLogsColl.deleteMany({
      migration: "instructions_to_v2"
    });
    console.log(`   ✓ ลบ migration log: ${deleteResult.deletedCount} รายการ`);

    // 2. ลบข้อมูลใน instructions_v2
    console.log("\n[2] ล้างข้อมูลใน instructions_v2...");
    const v2Coll = db.collection("instructions_v2");
    const v2Count = await v2Coll.countDocuments();
    if (v2Count > 0) {
      await v2Coll.deleteMany({});
      console.log(`   ✓ ลบข้อมูล instructions_v2: ${v2Count} รายการ`);
    } else {
      console.log("   - ไม่มีข้อมูลใน instructions_v2");
    }

    // 3. ตรวจสอบและ restore instruction_library ถ้าถูก backup
    console.log("\n[3] ตรวจสอบ instruction_library...");
    const collections = await db.listCollections().toArray();
    const libraryExists = collections.some(c => c.name === "instruction_library");
    const backupCollections = collections.filter(c =>
      c.name.startsWith("instruction_library_backup_")
    );

    if (!libraryExists && backupCollections.length > 0) {
      // หา backup ล่าสุด
      const latestBackup = backupCollections.sort((a, b) => {
        const timeA = parseInt(a.name.split("_").pop());
        const timeB = parseInt(b.name.split("_").pop());
        return timeB - timeA;
      })[0];

      console.log(`   ! instruction_library ไม่มี แต่พบ backup: ${latestBackup.name}`);
      console.log(`   → กำลัง restore จาก backup...`);

      await db.collection(latestBackup.name).rename("instruction_library");
      console.log(`   ✓ Restore instruction_library จาก ${latestBackup.name}`);
    } else if (libraryExists) {
      console.log("   ✓ instruction_library พร้อมใช้งาน");
      const libCount = await db.collection("instruction_library").countDocuments();
      console.log(`   → มี ${libCount} libraries`);
    } else {
      console.log("   ⚠ ไม่พบ instruction_library และไม่มี backup");
    }

    // 4. แสดงสถานะปัจจุบัน
    console.log("\n[4] สถานะปัจจุบัน:");
    const instrLibCount = libraryExists || backupCollections.length > 0
      ? await db.collection("instruction_library").countDocuments()
      : 0;
    const v2NewCount = await v2Coll.countDocuments();

    console.log(`   - instruction_library: ${instrLibCount} libraries`);
    console.log(`   - instructions_v2: ${v2NewCount} instructions`);
    console.log(`   - migration_logs: ถูกล้างแล้ว`);

    console.log("\n" + "=".repeat(60));
    console.log("✓ Reset Migration เสร็จสิ้น!");
    console.log("\n📝 ขั้นตอนต่อไป:");
    console.log("   1. รีสตาร์ทเซิร์ฟเวอร์: npm start");
    console.log("   2. Migration จะรันอัตโนมัติเมื่อเซิร์ฟเวอร์เริ่มต้น");
    console.log("   3. ตรวจสอบผลลัพธ์ที่ /admin/dashboard");
    console.log("=".repeat(60) + "\n");

  } catch (err) {
    console.error("\n❌ เกิดข้อผิดพลาด:", err);
    console.error("=".repeat(60) + "\n");
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run the script
resetMigration();
