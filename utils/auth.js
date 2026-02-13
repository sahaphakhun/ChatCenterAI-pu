const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { ObjectId } = require("mongodb");

const PASSCODE_COLLECTION = "admin_passcodes";
const DEFAULT_SALT_ROUNDS = Number(
  process.env.ADMIN_PASSCODE_SALT_ROUNDS || 12,
);

function isPasscodeFeatureEnabled(masterPasscode) {
  return typeof masterPasscode === "string" && masterPasscode.trim().length > 0;
}

function sanitizePasscodeInput(passcode) {
  if (typeof passcode !== "string") {
    return "";
  }
  return passcode.trim();
}

function sanitizeLabelInput(label) {
  if (typeof label !== "string") {
    return "";
  }
  return label.trim();
}

async function hashPasscode(passcode, saltRounds = DEFAULT_SALT_ROUNDS) {
  return bcrypt.hash(passcode, saltRounds);
}

async function comparePasscode(candidate, hashValue) {
  try {
    return await bcrypt.compare(candidate, hashValue);
  } catch (err) {
    console.warn("[Auth] cannot compare passcode:", err?.message || err);
    return false;
  }
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function mapPasscodeDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    label: doc.label || "",
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || null,
    createdBy: doc.createdBy || null,
    lastUsedAt: doc.lastUsedAt || null,
    usageCount: typeof doc.usageCount === "number" ? doc.usageCount : 0,
  };
}

async function createPasscode(db, { label, passcode, createdBy }) {
  const sanitizedLabel = sanitizeLabelInput(label);
  const sanitizedPasscode = sanitizePasscodeInput(passcode);
  if (!sanitizedPasscode) {
    throw new Error("กรุณากรอกรหัสผ่าน");
  }
  if (sanitizedPasscode.length < 4) {
    throw new Error("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
  }
  if (!sanitizedLabel) {
    throw new Error("กรุณาตั้งชื่อรหัสผ่าน");
  }

  const coll = db.collection(PASSCODE_COLLECTION);
  const hashed = await hashPasscode(sanitizedPasscode);
  const now = new Date();
  const doc = {
    label: sanitizedLabel,
    codeHash: hashed,
    isActive: true,
    createdAt: now,
    createdBy: createdBy || null,
    lastUsedAt: null,
    usageCount: 0,
  };
  const { insertedId } = await coll.insertOne(doc);
  return mapPasscodeDoc({ ...doc, _id: insertedId });
}

async function listPasscodes(db) {
  const coll = db.collection(PASSCODE_COLLECTION);
  const docs = await coll
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(mapPasscodeDoc);
}

async function togglePasscode(db, id, isActive) {
  if (!ObjectId.isValid(id)) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  const coll = db.collection(PASSCODE_COLLECTION);
  const { value } = await coll.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        isActive: !!isActive,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!value) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการปรับสถานะ");
  }
  return mapPasscodeDoc(value);
}

async function deletePasscode(db, id) {
  if (!ObjectId.isValid(id)) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  const coll = db.collection(PASSCODE_COLLECTION);
  const result = await coll.deleteOne({ _id: new ObjectId(id) });
  if (!result.deletedCount) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการลบ");
  }
  return true;
}

async function findActivePasscode(db, passcode) {
  const coll = db.collection(PASSCODE_COLLECTION);
  const cursor = coll.find({ isActive: { $ne: false } });
  // ตรวจรหัสทีละรายการ เพราะเก็บเป็น hash
  // จำนวนรหัสที่จัดการผ่าน UI มีน้อย จึงไม่กระทบประสิทธิภาพ
  // ถ้าจำนวนเยอะควรเพิ่ม field fingerprint เพื่อค้นหาได้เร็วขึ้น
  // แต่ตอนนี้ยังไม่จำเป็น
  const docs = await cursor.toArray();
  for (const doc of docs) {
    const matched = await comparePasscode(passcode, doc.codeHash);
    if (matched) {
      return doc;
    }
  }
  return null;
}

async function recordPasscodeUsage(db, id, meta = {}) {
  if (!id) return;
  const coll = db.collection(PASSCODE_COLLECTION);
  const update = {
    $set: {
      lastUsedAt: new Date(),
      lastUsedFrom: meta.ipAddress || null,
    },
    $inc: { usageCount: 1 },
  };
  await coll.updateOne({ _id: new ObjectId(id) }, update);
}

async function ensurePasscodeIndexes(db) {
  try {
    const coll = db.collection(PASSCODE_COLLECTION);
    await coll.createIndex({ isActive: 1 });
    await coll.createIndex({ createdAt: -1 });
  } catch (err) {
    console.warn("[Auth] cannot ensure passcode indexes:", err?.message || err);
  }
}

async function verifyPasscode({
  db,
  passcode,
  masterPasscode,
  ipAddress,
}) {
  const sanitizedPasscode = sanitizePasscodeInput(passcode);
  if (!sanitizedPasscode) {
    return { valid: false };
  }

  if (
    isPasscodeFeatureEnabled(masterPasscode) &&
    timingSafeEqualString(masterPasscode, sanitizedPasscode)
  ) {
    return {
      valid: true,
      role: "superadmin",
      passcodeDoc: null,
    };
  }

  const doc = await findActivePasscode(db, sanitizedPasscode);
  if (!doc) {
    return { valid: false };
  }

  await recordPasscodeUsage(db, doc._id, { ipAddress });

  return {
    valid: true,
    role: "admin",
    passcodeDoc: doc,
  };
}

module.exports = {
  PASSCODE_COLLECTION,
  isPasscodeFeatureEnabled,
  sanitizePasscodeInput,
  sanitizeLabelInput,
  createPasscode,
  listPasscodes,
  togglePasscode,
  deletePasscode,
  ensurePasscodeIndexes,
  verifyPasscode,
  mapPasscodeDoc,
};
