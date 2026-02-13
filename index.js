// -----------------------------------
// Original code with #DELETEMANY logic added
// -----------------------------------
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const util = require("util");
const { google } = require("googleapis");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const { OpenAI } = require("openai");
const line = require("@line/bot-sdk");
const sharp = require("sharp"); // <--- เพิ่มตรงนี้ ตามต้นฉบับ
const axios = require("axios");
const path = require("path");
const os = require("os");
const http = require("http");
const socketIo = require("socket.io");
const InstructionDataService = require("./services/instructionDataService");
const createNotificationService = require("./services/notificationService");
const slipOkService = require("./services/slipOkService");
// Middleware & misc packages for UI
const helmet = require("helmet");
const cors = require("cors");
const moment = require("moment-timezone");
const FormData = require("form-data");
const fs = require("fs");
const crypto = require("crypto");
const XLSX = require("xlsx");
const multer = require("multer");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const rateLimit = require("express-rate-limit");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const ASSETS_DIR =
  process.env.ASSETS_DIR ||
  path.join(__dirname, "public", "assets", "instructions");
const FOLLOWUP_ASSETS_DIR =
  process.env.FOLLOWUP_ASSETS_DIR ||
  path.join(__dirname, "public", "assets", "followup");
const DEFAULT_AUDIO_ATTACHMENT_RESPONSE =
  "ขออภัยค่ะ ขณะนี้ระบบยังไม่รองรับไฟล์เสียง กรุณาพิมพ์ข้อความหรือส่งรูปภาพแทน";

const PORT = process.env.PORT || 3000;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_MASTER_PASSCODE = (process.env.ADMIN_MASTER_PASSCODE || "").trim();
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || "change-me-please-admin-session-secret";
const ADMIN_SESSION_TTL_SECONDS = Number(
  process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 12,
);
const SESSION_COOKIE_NAME =
  process.env.ADMIN_SESSION_COOKIE_NAME || "admin_session";
const GOOGLE_CLIENT_EMAIL =
  "aitar-888@eminent-wares-446512-j8.iam.gserviceaccount.com";
const GOOGLE_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGhyeINArKZgaV\nitEcK+o89ilPYeRNTNZgJT7VNHB5hgNLLeAcFLJ7IlCIqTLMoJEnnoDQil6aKaz8\nExVL83uSXRrzk4zQvtt3tIP31+9wOCb9D4ZGWfVP1tD0qdD4WJ1qqg1j1/8879pH\nUeQGEMuCnyVbcQ3GbYQjyYb3wEz/Qv7kMVggF+MIaGGw2NQwM0XcufSFtyxvvX2S\nb8uGc1A8R+Dn/tmcgMODhbtEgcMg6yXI5Y26MPfDjVrEbk0lfCr7IGFJX4ASYeKl\n0jhm0RGb+aya2cb55auLN3VPO5MQ+cOp8gHBf5GiC/YgF1gbRgF5b7LgmENBxSfH\nb3WVQodLAgMBAAECggEACKB14M7LdekXZHyAQrZL0EitbzQknLv33Xyw2B3rvJ7M\nr4HM/nC4eBj7y+ciUc8GZQ+CWc2GzTHTa66+mwAia1qdYbPp3LuhGM4Leq5zn/o+\nA3rJuG6PS4qyUMy89msPXW5fSj/oE535QREiFKYP2dtlia2GI4xoag+x9uZwfMUO\nWKEe7tiUoZQEiGhwtjLq9lyST4kGGmlhNee9OyhDJcw4uCt8Cepr++hMDleWUF6c\nX0nbGmoSS0sZ5Boy8ATMhw/3luaOAlTUEz/nVDvbbWlNL9etwLKiAVw+AQXsPHNW\nNWF7gyEIsEi0qSM3PtA1X7IdReRXHqmfiZs0J3qSQQKBgQD1+Yj37Yuqj8hGi5PY\n+M0ieMdGcbUOmJsM1yUmBMV4bfaTiqm504P6DIYAqfDDWeozcHwcdpG1AfFAihEi\nh6lb0qRk8YaGbzvac8mWhwo/jDA5QB97fjFa6uwtlewZ0Er/U3QmOeVVnVC1y1b0\nrbJD5yjvI3ve+gpwAz0glpIMiwKBgQDOnpD7p7ylG4NQunqmzzdozrzZP0L6EZyE\n141st/Hsp9rtO9/ADuH6WhpirQ516l5LLv7mLPA8S9CF/cSdWF/7WlxBPjM8WRs9\nACFNBJIwUfjzPnvECmtsayzRlKuyCAspnNSkzgtdtvf2xI82Z3BGov9goZfu+D4A\n36b1qXsIQQKBgQCO1CojhO0vyjPKOuxL9hTvqmBUWFyBMD4AU8F/dQ/RYVDn1YG+\npMKi5Li/E+75EHH9EpkO0g7Do3AaQNG4UjwWVJcfAlxSHa8Mp2VsIdfilJ2/8KsX\nQ2yXVYh04/Rn/No/ro7oT4AKmcGu/nbstxuncEgFrH4WOOzspATPsn72BwKBgG5N\nBAT0NKbHm0B7bIKkWGYhB3vKY8zvnejk0WDaidHWge7nabkzuLtXYoKO9AtKxG/K\ndNUX5F+r8XO2V0HQLd0XDezecaejwgC8kwp0iD43ZHkmQBgVn+dPB6wSe94coSjj\nyjj4reSnipQ3tmRKsAtldIN3gI5YA3Gf85dtlHqBAoGAD5ePt7cmu3tDZhA3A8f9\no8mNPvqz/WGs7H2Qgjyfc3jUxEGhVt1Su7J1j+TppfkKtJIDKji6rVA9oIjZtpZT\ngxnU6hcYuiwbLh3wGEFIjP1XeYYILudqfWOEbwnxD1RgMkCqfSHf/niWlfiH6p3F\ndnBsLY/qXdKfS/OXyezAm4M=\n-----END PRIVATE KEY-----\n";
const GOOGLE_DOC_ID = "1U-2OPVVI_Gz0-uFonrRNrcFopDqmPGUcJ4qJ1RdAqxY";
const SPREADSHEET_ID = "15nU46XyAh0zLAyD_5DJPfZ2Gog6IOsoedSCCMpnjEJo";
// FLOW_TEXT และรายละเอียด flow ต่าง ๆ ถูกลบออก เนื่องจากไม่ได้ใช้งานแล้ว
const {
  isPasscodeFeatureEnabled,
  ensurePasscodeIndexes,
  verifyPasscode,
  createPasscode,
  listPasscodes,
  togglePasscode,
  deletePasscode,
  sanitizePasscodeInput,
  sanitizeLabelInput,
  mapPasscodeDoc,
} = require("./utils/auth");
const {
  extractBase64ImagesFromContent,
  detectImageMimeType,
} = require("./utils/chatImageUtils");
const {
  SHORT_LINK_COLLECTION,
  isValidShortCode,
  resolveShortLink,
} = require("./utils/shortLinks");
const {
  migrateChatHistorySenderId,
} = require("./utils/chatHistoryMigration");

function resolveInstructionAssetUrl(url, fallbackFileName) {
  const base =
    typeof PUBLIC_BASE_URL === "string"
      ? PUBLIC_BASE_URL.replace(/\/$/, "")
      : "";
  const candidate = (() => {
    if (typeof url === "string" && url.trim()) {
      return url.trim();
    }
    if (fallbackFileName) {
      return `/assets/instructions/${fallbackFileName}`;
    }
    return null;
  })();
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  const pathPart = candidate.startsWith("/")
    ? candidate
    : `/assets/instructions/${candidate}`;
  if (base) {
    return `${base}${pathPart}`;
  }
  return pathPart;
}

// Line Client จะถูกสร้างเมื่อต้องการใช้งานจริง (ไม่สร้างตั้งแต่เริ่มต้น)
let lineClient = null;

// ฟังก์ชันสำหรับสร้าง Line Client เมื่อต้องการใช้งาน
function createLineClient(channelAccessToken, channelSecret) {
  if (!channelAccessToken || !channelSecret) {
    throw new Error(
      "Channel Access Token และ Channel Secret จำเป็นสำหรับการใช้งาน Line Bot",
    );
  }

  const lineConfig = {
    channelAccessToken,
    channelSecret,
  };

  return new line.Client(lineConfig);
}

const LINE_BOT_CREDENTIAL_CACHE_TTL_MS = 5 * 60 * 1000;
const lineBotCredentialCache = new Map();

async function getLineBotCredentials(botId) {
  const id = typeof botId === "string" ? botId.trim() : botId ? String(botId) : "";
  if (!ObjectId.isValid(id)) return null;

  const cached = lineBotCredentialCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < LINE_BOT_CREDENTIAL_CACHE_TTL_MS) {
    return cached.credentials;
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const bot = await db.collection("line_bots").findOne(
    { _id: new ObjectId(id) },
    { projection: { channelAccessToken: 1, channelSecret: 1 } },
  );

  const credentials =
    bot && bot.channelAccessToken && bot.channelSecret
      ? {
        channelAccessToken: bot.channelAccessToken,
        channelSecret: bot.channelSecret,
      }
      : null;

  lineBotCredentialCache.set(id, { fetchedAt: Date.now(), credentials });
  return credentials;
}

async function getLineClientForContext(botId = null) {
  const credentials = await getLineBotCredentials(botId);
  if (credentials) {
    return createLineClient(
      credentials.channelAccessToken,
      credentials.channelSecret,
    );
  }

  if (lineClient) {
    return lineClient;
  }

  if (LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_SECRET) {
    lineClient = createLineClient(LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET);
    return lineClient;
  }

  return null;
}
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
let commentIndexesEnsured = false;

async function ensureFacebookCommentIndexes(db) {
  if (commentIndexesEnsured) return;
  try {
    await db.collection("facebook_page_posts").createIndexes([
      { key: { botId: 1, postId: 1 }, unique: true },
      { key: { pageId: 1 } },
      { key: { lastCommentAt: -1 } },
    ]);
    await db.collection("facebook_comment_policies").createIndexes([
      { key: { botId: 1, scope: 1 }, unique: true },
    ]);
    await db.collection("facebook_comment_events").createIndexes([
      { key: { commentId: 1 }, unique: true },
      { key: { postId: 1, createdAt: -1 } },
    ]);
    commentIndexesEnsured = true;
  } catch (err) {
    console.warn(
      "[DB] ไม่สามารถตั้งค่า index สำหรับ Facebook comment ได้:",
      err?.message || err,
    );
  }
}

// ============================ CSP Helpers ============================
const cspImgSrc = ["'self'", "data:", "blob:"];
const registerCspOrigin = (value) => {
  if (!value || typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  try {
    const url = new URL(trimmed);
    if (url.origin && !cspImgSrc.includes(url.origin)) {
      cspImgSrc.push(url.origin);
    }
  } catch (_) {
    // Ignore non-absolute URLs (self already covers relative paths)
  }
};

registerCspOrigin(PUBLIC_BASE_URL);
registerCspOrigin(process.env.FOLLOWUP_PUBLIC_BASE_URL);
registerCspOrigin(process.env.FOLLOWUP_ASSETS_BASE_URL);
registerCspOrigin(process.env.ASSETS_BASE_URL);

// ============================ UI Middleware ============================
// Security headers (relaxed CSP ให้โหลด resource จาก CDN ได้)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-hashes'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
        ],
        imgSrc: cspImgSrc,
        fontSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com",
        ],
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
      },
    },
  }),
);
app.use(cors());

// Static assets (CSS/JS/img)
app.use(express.static(path.join(__dirname, "public")));
// Serve instruction assets from configurable directory (supports mounted volumes)
try {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }
  app.use("/assets/instructions", express.static(ASSETS_DIR, { maxAge: "7d" }));
  console.log("[Static] Serving instruction assets from:", ASSETS_DIR);

  if (!fs.existsSync(FOLLOWUP_ASSETS_DIR)) {
    fs.mkdirSync(FOLLOWUP_ASSETS_DIR, { recursive: true });
  }
  app.use(
    "/assets/followup",
    express.static(FOLLOWUP_ASSETS_DIR, { maxAge: "7d" }),
  );
  console.log("[Static] Serving follow-up assets from:", FOLLOWUP_ASSETS_DIR);
} catch (e) {
  console.warn("[Static] Could not ensure asset directories:", e?.message || e);
}

const buildInstructionLookupNames = (fileName) => {
  if (!fileName) return [];
  const safeDecode = (() => {
    try {
      return decodeURIComponent(fileName);
    } catch (_) {
      return fileName;
    }
  })();
  const baseName = fileName
    .replace(/(_thumb)?\.(jpe?g|png|webp)$/i, "")
    .trim();
  const variants = [
    fileName,
    fileName.toLowerCase(),
    safeDecode,
    safeDecode.toLowerCase(),
    baseName,
    baseName.toLowerCase(),
    baseName.replace(/[_\s]+/g, "-"),
  ];
  return Array.from(
    new Set(variants.filter((value) => typeof value === "string" && value)),
  );
};

app.get("/assets/instructions/:fileName", async (req, res, next) => {
  const { fileName } = req.params;
  if (!fileName) return next();

  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const queryOr = [{ fileName }, { thumbFileName: fileName }];
    const lookupNames = buildInstructionLookupNames(fileName);
    for (const name of lookupNames) {
      queryOr.push({ label: name });
      queryOr.push({ slug: name });
    }
    const doc = await coll.findOne({ $or: queryOr });

    if (!doc) return next();

    const isThumbRequest =
      fileName === doc.thumbFileName ||
      fileName.endsWith("_thumb.jpg") ||
      fileName.endsWith("_thumb.jpeg");

    const { stream, mime, missingReferences } = await resolveInstructionAssetStream(
      db,
      doc,
      { isThumbRequest },
    );

    const variantMissingCompletely = (variant) => {
      const refs = missingReferences?.[variant] || {};
      const hasId = variant === "main" ? Boolean(doc.fileId) : Boolean(doc.thumbFileId);
      const hasFileName =
        variant === "main" ? Boolean(doc.fileName) : Boolean(doc.thumbFileName);
      const hasUrl = variant === "main" ? Boolean(doc.url) : Boolean(doc.thumbUrl);
      const idGone = !hasId || refs.id === true;
      const fileGone = !hasFileName || refs.filename === true;
      const urlGone = !hasUrl;
      return idGone && fileGone && urlGone;
    };

    if (!stream) {
      const mainMissing = variantMissingCompletely("main");
      const thumbMissing = variantMissingCompletely("thumb");

      if (mainMissing && thumbMissing) {
        await performInstructionAssetDeletion(db, doc);
      } else if (
        missingReferences?.main?.id ||
        missingReferences?.main?.filename ||
        missingReferences?.thumb?.id ||
        missingReferences?.thumb?.filename
      ) {
        await markInstructionAssetMissingVariants(db, doc, missingReferences);
      }
      return res.sendStatus(404);
    }

    if (
      missingReferences?.main?.id ||
      missingReferences?.main?.filename ||
      missingReferences?.thumb?.id ||
      missingReferences?.thumb?.filename
    ) {
      await markInstructionAssetMissingVariants(db, doc, missingReferences);
    }

    res.set("Content-Type", mime || doc.mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    stream.on("error", (err) => {
      console.error(
        `[Asset Error] Failed to stream instruction asset: ${fileName}`,
        {
          error: err.message,
          code: err.code,
          fileName,
        },
      );
      if (err.code === "FileNotFound") {
        markInstructionAssetMissingVariants(db, doc, {
          main: { id: !isThumbRequest, filename: !isThumbRequest },
          thumb: { id: isThumbRequest, filename: isThumbRequest },
        }).catch(() => { });
        res.status(404).end();
        return;
      }
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error(
      `[Asset Error] Error in instruction asset route: ${fileName}`,
      {
        error: err.message,
        stack: err.stack,
        fileName,
      },
    );
    next(err);
  }
});

app.get("/assets/followup/:fileName", async (req, res, next) => {
  try {
    const { fileName } = req.params;
    if (!fileName) return next();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_assets");
    const doc = await coll.findOne({
      $or: [{ fileName }, { thumbName: fileName }, { thumbFileName: fileName }],
    });

    if (!doc) return next();

    const bucket = new GridFSBucket(db, { bucketName: "followupAssets" });
    const isThumb =
      fileName === doc.thumbName ||
      fileName === doc.thumbFileName ||
      fileName.endsWith("_thumb.jpg") ||
      fileName.endsWith("_thumb.jpeg");
    const targetName = isThumb
      ? doc.thumbFileName || doc.thumbName
      : doc.fileName;
    const targetId = isThumb ? doc.thumbFileId || null : doc.fileId || null;
    if (!targetName) return next();
    let fileObjectId = toObjectId(targetId);

    if (!fileObjectId) {
      const files = await bucket
        .find({ filename: targetName })
        .sort({ uploadDate: -1 })
        .limit(1)
        .toArray();
      if (!files.length) return next();
      fileObjectId = files[0]._id;
    }

    const stream = bucket.openDownloadStream(fileObjectId);

    res.set("Content-Type", doc.mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    stream.on("error", (err) => {
      console.error(`[Asset Error] Failed to stream followup asset: ${fileName}`, {
        error: err.message,
        code: err.code,
        fileName,
        targetName,
        targetId,
        fileObjectId,
      });
      if (err.code === "FileNotFound") return next();
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error(`[Asset Error] Error in followup asset route: ${fileName}`, {
      error: err.message,
      stack: err.stack,
      fileName,
    });
    next(err);
  }
});

app.get("/assets/chat-images/:messageId/:imageIndex", async (req, res) => {
  try {
    const { messageId, imageIndex } = req.params;
    if (!ObjectId.isValid(messageId)) {
      return res.sendStatus(404);
    }

    const index = Number.parseInt(imageIndex, 10);
    if (!Number.isFinite(index) || index < 0) {
      return res.sendStatus(404);
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const doc = await db.collection("chat_history").findOne(
      { _id: new ObjectId(messageId) },
      { projection: { content: 1 } },
    );

    if (!doc) {
      return res.sendStatus(404);
    }

    const images = extractBase64ImagesFromContent(doc.content);
    const payload = images[index];
    if (!payload || !payload.base64) {
      return res.sendStatus(404);
    }

    const buffer = Buffer.from(payload.base64, "base64");
    if (!buffer.length) {
      return res.sendStatus(404);
    }

    const contentType = payload.mime || detectImageMimeType(payload.base64);
    res.set("Content-Type", contentType || "image/jpeg");
    res.set("Cache-Control", "no-store");
    return res.end(buffer);
  } catch (err) {
    console.error("[Chat Images] ไม่สามารถดึงรูปภาพแชทได้:", err?.message || err);
    return res.sendStatus(500);
  }
});

// Avoid favicon 404s in environments without a favicon
app.get("/favicon.ico", (req, res) => res.sendStatus(204));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================ Multer Configuration ============================
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // ตรวจสอบว่าเป็นไฟล์ Excel หรือไม่
    if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.match(/\.(xlsx|xls)$/)
    ) {
      cb(null, true);
    } else {
      cb(new Error("กรุณาเลือกไฟล์ Excel เท่านั้น (.xlsx หรือ .xls)"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Multer for image uploads (Instruction Assets)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(jpe?g|png|webp)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("กรุณาอัพโหลดเฉพาะไฟล์รูปภาพ (jpg, png, webp)"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
  },
});

// ฟังก์ชันสำหรับอ่านไฟล์ Excel และแปลงเป็น instructions
function processExcelToInstructions(buffer, originalName) {
  try {
    console.log(`[Excel] เริ่มประมวลผลไฟล์: ${originalName}`);

    // อ่านไฟล์ Excel
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;

    console.log(
      `[Excel] พบแท็บใน Excel: ${sheetNames.length} แท็บ (${sheetNames.join(", ")})`,
    );

    const instructions = [];

    sheetNames.forEach((sheetName, index) => {
      try {
        const worksheet = workbook.Sheets[sheetName];

        // แปลงข้อมูลในแท็บเป็น JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          console.log(`[Excel] แท็บ "${sheetName}" ว่างเปล่า ข้าม...`);
          return;
        }

        // ถ้ามีข้อมูลมากกว่า 1 แถว ให้ถือเป็นตาราง
        if (jsonData.length > 1 && jsonData[0] && jsonData[0].length > 0) {
          const headers = jsonData[0];
          const dataRows = jsonData.slice(1);

          // กรองแถวที่มีข้อมูล
          const validRows = dataRows.filter(
            (row) =>
              row &&
              row.some(
                (cell) => cell !== undefined && cell !== null && cell !== "",
              ),
          );

          if (validRows.length > 0) {
            // สร้าง instruction แบบตาราง
            const tableData = {
              columns: headers.map((h) => h || ""),
              rows: validRows
                .map((row) => {
                  const rowObj = {};
                  headers.forEach((header, idx) => {
                    if (
                      header &&
                      row[idx] !== undefined &&
                      row[idx] !== null &&
                      row[idx] !== ""
                    ) {
                      rowObj[header] = String(row[idx]);
                    }
                  });
                  return rowObj;
                })
                .filter((obj) => Object.keys(obj).length > 0),
            };

            instructions.push({
              type: "table",
              title: sheetName,
              content: `ข้อมูลจากแท็บ "${sheetName}" ในไฟล์ ${originalName}`,
              data: tableData,
              source: "excel",
              fileName: originalName,
              sheetName: sheetName,
            });

            console.log(
              `[Excel] สร้าง instruction ตาราง "${sheetName}": ${tableData.rows.length} แถว`,
            );
          }
        } else if (
          jsonData.length === 1 &&
          jsonData[0] &&
          jsonData[0].length > 0
        ) {
          // ถ้ามีแค่ 1 แถว ให้ถือเป็นข้อความ
          const textContent = jsonData[0].join(" ").trim();
          if (textContent) {
            instructions.push({
              type: "text",
              title: sheetName,
              content: textContent,
              source: "excel",
              fileName: originalName,
              sheetName: sheetName,
            });

            console.log(
              `[Excel] สร้าง instruction ข้อความ "${sheetName}": ${textContent.length} อักขระ`,
            );
          }
        }
      } catch (sheetError) {
        console.error(
          `[Excel] ข้อผิดพลาดในการประมวลผลแท็บ "${sheetName}":`,
          sheetError,
        );
      }
    });

    console.log(
      `[Excel] ประมวลผลเสร็จสิ้น: สร้าง ${instructions.length} instructions`,
    );
    return instructions;
  } catch (error) {
    console.error("[Excel] ข้อผิดพลาดในการประมวลผลไฟล์ Excel:", error);
    throw new Error("ไม่สามารถประมวลผลไฟล์ Excel ได้: " + error.message);
  }
}

function sanitizeSheetName(name, fallback) {
  const invalidChars = /[\\/?*\[\]:]/g;
  let sanitized = (name || "").replace(invalidChars, " ").trim();
  if (!sanitized) {
    sanitized = fallback;
  }
  if (sanitized.length > 31) {
    sanitized = sanitized.substring(0, 31).trim();
  }
  return sanitized || fallback;
}

function buildInstructionText(instructions, options = {}) {
  const { tableMode = "placeholder", emptyText = "_ไม่มีเนื้อหา_" } = options;
  const normalizeText = (text) => {
    if (!text) return "";
    return String(text).replace(/\r\n/g, "\n");
  };

  return instructions
    .map((instruction, idx) => {
      const indexLabel = idx + 1;
      const title =
        instruction.title && instruction.title.trim()
          ? instruction.title.trim()
          : `Instruction ${indexLabel}`;
      const lines = [`#${indexLabel} ${title}`];

      if (instruction.type === "table" && instruction.data) {
        const content = normalizeText(instruction.content).trim();
        if (content) {
          lines.push("");
          lines.push(...content.split("\n"));
        }

        if (tableMode === "json") {
          const tableJson = JSON.stringify(instruction.data, null, 2);
          lines.push("");
          lines.push(...tableJson.split("\n"));
        } else if (tableMode === "placeholder") {
          lines.push("");
          lines.push("[TABLE DATA]");
        }
      } else {
        const content = normalizeText(instruction.content).trim();
        lines.push("");
        if (content) {
          lines.push(...content.split("\n"));
        } else if (emptyText) {
          lines.push(emptyText);
        }
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

async function ensureCategoryIndexes(db) {
  try {
    const categories = db.collection("categories");
    // Unique categoryId per bot
    await categories.createIndex({ botId: 1, platform: 1, categoryId: 1 }, { unique: true });
    await categories.createIndex({ botId: 1, platform: 1, name: 1 });
    await categories.createIndex({ isActive: 1, createdAt: -1 });

    const categoryTables = db.collection("category_tables");
    await categoryTables.createIndex({ categoryId: 1 }, { unique: true });
    await categoryTables.createIndex({ botId: 1, platform: 1 });

    console.log("[DB] Category indexes ensured");
  } catch (err) {
    console.error("[DB] Error ensuring category indexes:", err);
  }
}

async function ensureNotificationIndexes(db) {
  try {
    await db.collection("line_bot_groups").createIndexes([
      { key: { botId: 1, groupId: 1 }, unique: true },
      { key: { botId: 1, status: 1, lastEventAt: -1 } },
    ]);

    await db.collection("notification_channels").createIndexes([
      { key: { isActive: 1, type: 1 } },
      { key: { senderBotId: 1, groupId: 1 } },
      { key: { "sources.platform": 1, "sources.botId": 1 } },
    ]);

    await db.collection("notification_logs").createIndexes([
      { key: { channelId: 1, createdAt: -1 } },
      { key: { createdAt: -1 } },
    ]);

    console.log("[DB] Notification indexes ensured");
  } catch (err) {
    console.warn(
      "[DB] ไม่สามารถตั้งค่า index สำหรับ Notifications ได้:",
      err?.message || err,
    );
  }
}

async function ensureShortLinkIndexes(db) {
  try {
    const coll = db.collection(SHORT_LINK_COLLECTION);
    await coll.createIndex({ code: 1 }, { unique: true });
    await coll.createIndex({ targetUrl: 1 }, { unique: true });
    await coll.createIndex({ createdAt: -1 });
    console.log("[DB] Short link indexes ensured");
  } catch (err) {
    console.warn(
      "[DB] ไม่สามารถตั้งค่า index สำหรับ Short Links ได้:",
      err?.message || err,
    );
  }
}

let mongoClient = null;
async function connectDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    try {
      const db = mongoClient.db("chatbot");
      await ensurePasscodeIndexes(db);
      await ensureFacebookCommentIndexes(db);
      await ensureCategoryIndexes(db);
      await ensureNotificationIndexes(db);
      await ensureShortLinkIndexes(db);
    } catch (err) {
      console.warn(
        "[DB] ไม่สามารถตั้งค่า index ได้:",
        err?.message || err,
      );
    }
  }
  return mongoClient;
}

const notificationService = createNotificationService({
  connectDB,
  publicBaseUrl: PUBLIC_BASE_URL,
});

/**
 * แก้ไขให้ content เป็น string เสมอ
 */
function normalizeRoleContent(role, content) {
  if (typeof content === "string") {
    return { role, content };
  } else {
    // ถ้าไม่ใช่ string => stringify
    return { role, content: JSON.stringify(content) };
  }
}

const sessionStore = MongoStore.create({
  clientPromise: connectDB(),
  dbName: "chatbot",
  collectionName: "admin_sessions",
  stringify: false,
  ttl: ADMIN_SESSION_TTL_SECONDS,
});

const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: ADMIN_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
  },
});

app.use(sessionMiddleware);
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, res, next) => {
  res.locals.adminUser = req.session?.adminUser || null;
  res.locals.isPasscodeRequired = isPasscodeFeatureEnabled(
    ADMIN_MASTER_PASSCODE,
  );
  next();
});

function isAdminAuthenticated(req) {
  return Boolean(req.session && req.session.adminUser);
}

function registerAdminSession(req, { role, passcodeDoc }) {
  req.session.adminUser = {
    role,
    codeId: passcodeDoc ? String(passcodeDoc._id) : null,
    label: passcodeDoc?.label || null,
    loggedInAt: new Date().toISOString(),
  };
}

function destroyAdminSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function getAdminUserContext(req) {
  if (!isAdminAuthenticated(req)) return null;
  const { role, codeId, label, loggedInAt } = req.session.adminUser;
  return {
    role,
    codeId,
    label,
    loggedInAt,
  };
}

function enforceAdminLogin(req, res, next) {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return next();
  }

  const relaxedPaths = ["/login", "/logout", "/passcodes/self-check"];
  if (relaxedPaths.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  if (isAdminAuthenticated(req)) {
    return next();
  }

  const wantsHTML =
    req.headers.accept && req.headers.accept.includes("text/html");
  if (wantsHTML) {
    return res.redirect("/admin/login");
  }

  return res.status(401).json({
    success: false,
    error: "กรุณาล็อกอินก่อนใช้งาน",
  });
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ในภายหลัง",
    });
  },
});

function requireSuperadmin(req, res, next) {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return res.status(400).json({
      success: false,
      error: "ยังไม่ได้เปิดใช้ระบบรหัสผ่าน",
    });
  }

  if (
    !isAdminAuthenticated(req) ||
    req.session.adminUser.role !== "superadmin"
  ) {
    return res.status(403).json({
      success: false,
      error: "จำเป็นต้องเป็นแอดมินใหญ่ก่อน",
    });
  }

  return next();
}

// อนุญาตทุกคนเมื่อไม่เปิดระบบรหัสผ่าน; ถ้าเปิดต้องล็อกอินอย่างน้อยเป็นแอดมิน
function requireAdmin(req, res, next) {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return next();
  }
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      error: "กรุณาล็อกอินก่อนใช้งาน",
    });
  }
  return next();
}

function buildChatHistoryUserMatch(userId) {
  if (!userId) {
    return { senderId: null };
  }
  return { $or: [{ senderId: userId }, { userId: userId }] };
}

function buildChatHistoryUserQuery(userId, extra = {}) {
  const baseMatch = buildChatHistoryUserMatch(userId);
  if (!extra || Object.keys(extra).length === 0) {
    return baseMatch;
  }
  return { $and: [extra, baseMatch] };
}

async function getChatHistory(userId) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue("enableChatHistory", true);

  if (!enableChatHistory) {
    console.log(`[LOG] การบันทึกประวัติแชทถูกปิดใช้งานสำหรับผู้ใช้: ${userId}`);
    return [];
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  const chats = await coll
    .find(buildChatHistoryUserMatch(userId))
    .sort({ timestamp: 1 })
    .toArray();
  return chats.map((ch) => {
    try {
      const parsed = JSON.parse(ch.content);
      return normalizeRoleContent(ch.role, parsed);
    } catch {
      return normalizeRoleContent(ch.role, ch.content);
    }
  });
}

/**
 * ดึงประวัติแชทที่ถูกทำให้เหมาะสมสำหรับส่งให้ OpenAI
 * - ตัดข้อมูลรูปภาพ (base64) ออกจากข้อความเก่า
 * - เก็บเฉพาะข้อความตัวอักษร และใส่หมายเหตุว่ามีรูปภาพกี่รูป
 * - จำกัดจำนวนข้อความล่าสุดเพื่อลด token
 */
async function getAIHistory(userId) {
  // หากปิดการบันทึกประวัติ ก็ไม่มีอะไรให้ส่ง
  const enableChatHistory = await getSettingValue("enableChatHistory", true);
  if (!enableChatHistory) return [];

  // จำกัดจำนวนข้อความล่าสุด (ปรับได้จาก settings), ค่าเริ่มต้น 20
  const historyLimitRaw = await getSettingValue("aiHistoryLimit", 20);
  const historyLimit =
    typeof historyLimitRaw === "number" && historyLimitRaw > 0
      ? Math.min(Math.floor(historyLimitRaw), 100)
      : 20;

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");

  // ดึงเฉพาะข้อความล่าสุดตามจำนวนที่กำหนด แล้วกลับลำดับเป็นเก่าสุด -> ใหม่สุด
  const raw = await coll
    .find(buildChatHistoryUserMatch(userId))
    .sort({ timestamp: -1 })
    .limit(historyLimit)
    .toArray();

  const items = raw.reverse();

  const sanitize = (role, content) => {
    // คืนค่าเป็น string เสมอ และไม่มี base64 ขนาดใหญ่
    const isBase64Like = (str) => {
      if (typeof str !== "string") return false;
      if (str.length < 1024) return false; // เล็กๆ ปล่อยผ่าน
      // รูปแบบพบได้บ่อยของ base64 รูปภาพ
      if (str.startsWith("data:image/")) return true;
      if (str.includes("\n")) return false; // เนื้อความปกติมักมีช่องว่าง/ขึ้นบรรทัด
      const base64Chars = /^[A-Za-z0-9+/=]+$/;
      return base64Chars.test(str.slice(0, Math.min(str.length, 8192)));
    };

    const truncateLong = (str, maxLen = 4000) => {
      if (typeof str !== "string") return "";
      return str.length > maxLen
        ? str.slice(0, maxLen) + "\n[ตัดเนื้อความยาว]"
        : str;
    };

    try {
      // ถ้าเก็บเป็น JSON (เช่น array ของ contentSequence)
      const parsed =
        typeof content === "string" ? JSON.parse(content) : content;

      // กรณีเป็น array: รูปแบบ contentSequence
      if (Array.isArray(parsed)) {
        let textParts = [];
        let imgCount = 0;

        for (const item of parsed) {
          if (!item) continue;
          // รูปแบบใหม่ { type, content, description }
          if (item.type === "text" && typeof item.content === "string") {
            textParts.push(item.content);
          } else if (item.type === "image") {
            imgCount++;
          }
          // รูปแบบเก่า { data: { type, text|base64 } }
          else if (item.data) {
            const d = item.data;
            if (d.type === "text" && typeof d.text === "string") {
              textParts.push(d.text);
            } else if (d.type === "image") {
              imgCount++;
            }
          }
        }

        let text = textParts.join("\n\n");
        if (imgCount > 0) {
          const note = `[มีรูปภาพก่อนหน้า ${imgCount} รูป]`;
          text = text ? `${text}\n\n${note}` : note;
        }
        return truncateLong(text);
      }

      // กรณีเป็น object เดี่ยว (ไม่ใช่ array)
      if (parsed && typeof parsed === "object") {
        // พยายามดึงข้อความถ้ามี
        if (parsed.type === "text" && typeof parsed.content === "string") {
          return truncateLong(parsed.content);
        }
        if (
          parsed.data &&
          parsed.data.type === "text" &&
          typeof parsed.data.text === "string"
        ) {
          return truncateLong(parsed.data.text);
        }
        // ถ้ามีรูปภาพแต่ไม่มีข้อความ ให้ใส่หมายเหตุ
        if (
          parsed.type === "image" ||
          (parsed.data && parsed.data.type === "image")
        ) {
          return "[มีรูปภาพก่อนหน้า 1 รูป]";
        }
        // อย่างอื่นให้ตัดให้สั้นๆ
        return truncateLong(JSON.stringify(parsed));
      }

      // ตกมาที่นี่แปลว่า content เป็น string ปกติ
      if (isBase64Like(content)) {
        return "[ตัดข้อมูลรูปภาพขนาดใหญ่จากประวัติ]";
      }
      return truncateLong(content);
    } catch (_) {
      // parse ไม่ได้: ตรวจจับ base64 แล้วตัดทิ้ง
      if (isBase64Like(content)) {
        return "[ตัดข้อมูลรูปภาพขนาดใหญ่จากประวัติ]";
      }
      return truncateLong(String(content ?? ""));
    }
  };

  const sanitized = items.map((ch) => {
    const msg = {
      role: ch.role,
      content: sanitize(ch.role, ch.content),
    };
    if (ch.tool_calls) msg.tool_calls = ch.tool_calls;
    if (ch.tool_call_id) msg.tool_call_id = ch.tool_call_id;
    if (ch.name) msg.name = ch.name;
    return msg;
  });

  // ลบข้อความว่างที่ไม่มีประโยชน์ต่อบริบท
  return sanitized.filter(
    (m) => m && typeof m.content === "string" && m.content.trim() !== "",
  );
}

// ฟังก์ชันสำหรับดึงข้อมูลโปรไฟล์จาก LINE API
async function getLineUserProfile(userId, botId = null) {
  const client = await getLineClientForContext(botId);
  if (!client) {
    return {
      userId: userId,
      displayName: userId.substring(0, 8) + "...",
      pictureUrl: null,
      statusMessage: null,
    };
  }

  try {
    const profile = await client.getProfile(userId);
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    };
  } catch (error) {
    console.error(
      `[ERROR] ไม่สามารถดึงข้อมูลโปรไฟล์จาก LINE API สำหรับผู้ใช้ ${userId}:`,
      error.message,
    );

    // ถ้าเป็น error เกี่ยวกับ rate limit หรือ temporary error ให้ retry
    if (error.status === 429 || error.status >= 500) {
      console.log(
        `[LOG] พยายาม retry สำหรับผู้ใช้ ${userId} ในอีก 5 วินาที...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const retryProfile = await client.getProfile(userId);
        return {
          userId: retryProfile.userId,
          displayName: retryProfile.displayName,
          pictureUrl: retryProfile.pictureUrl,
          statusMessage: retryProfile.statusMessage,
        };
      } catch (retryError) {
        console.error(
          `[ERROR] Retry ไม่สำเร็จสำหรับผู้ใช้ ${userId}:`,
          retryError.message,
        );
      }
    }

    return {
      userId: userId,
      displayName: userId.substring(0, 8) + "...",
      pictureUrl: null,
      statusMessage: null,
    };
  }
}

// ฟังก์ชันสำหรับบันทึกหรืออัปเดตข้อมูลผู้ใช้
async function saveOrUpdateUserProfile(userId, botId = null) {
  try {
    const profile = await getLineUserProfile(userId, botId);
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_profiles");

    await coll.updateOne(
      { userId: profile.userId },
      {
        $set: {
          ...profile,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return profile;
  } catch (error) {
    console.error(
      `[ERROR] ไม่สามารถบันทึกข้อมูลผู้ใช้ ${userId}:`,
      error.message,
    );
    return null;
  }
}

async function fetchFacebookProfile(psid, accessToken) {
  if (!psid || !accessToken) {
    return null;
  }

  const apiVersion = "v18.0";
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(
    psid,
  )}`;

  try {
    const { data } = await axios.get(url, {
      params: {
        fields: "name,first_name,last_name,profile_pic",
        access_token: accessToken,
      },
    });

    const fullName =
      data?.name ||
      [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();

    if (!fullName) {
      return null;
    }

    return {
      userId: psid,
      platform: "facebook",
      displayName: fullName,
      pictureUrl: data?.profile_pic || null,
      updatedAt: new Date(),
    };
  } catch (error) {
    const status = error?.response?.status;
    const message =
      error?.response?.data?.error?.message || error?.message || "unknown";
    console.warn(
      `[Facebook] ไม่สามารถดึงโปรไฟล์ ${psid} (${status || "n/a"}): ${message}`,
    );
    return null;
  }
}

async function ensureFacebookProfileDisplayName(psid, accessToken) {
  if (!psid || !accessToken) {
    return null;
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("user_profiles");

  const existing = await coll.findOne(
    { userId: psid, platform: "facebook" },
    { projection: { displayName: 1 } },
  );

  if (existing?.displayName && existing.displayName.trim()) {
    return existing;
  }

  const profile = await fetchFacebookProfile(psid, accessToken);
  if (!profile?.displayName) {
    return existing;
  }

  const now = new Date();
  await coll.updateOne(
    { userId: psid, platform: "facebook" },
    {
      $set: {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: psid,
        platform: "facebook",
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return profile;
}

async function saveChatHistory(
  userId,
  userMsg,
  assistantMsg,
  platform = "line",
  botId = null,
) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue("enableChatHistory", true);

  if (!enableChatHistory) {
    console.log(`[LOG] การบันทึกประวัติแชทถูกปิดใช้งานสำหรับผู้ใช้: ${userId}`);
    return;
  }

  // บันทึกหรืออัปเดตข้อมูลผู้ใช้ก่อน (เฉพาะ LINE)
  if (platform === "line") {
    await saveOrUpdateUserProfile(userId, botId);
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  let userMsgToSave =
    typeof userMsg === "string" ? userMsg : JSON.stringify(userMsg);

  // Insert user message and emit to admin chat in realtime
  const userTimestamp = new Date();
  const userMessageDoc = {
    senderId: userId,
    role: "user",
    content: userMsgToSave,
    timestamp: userTimestamp,
    platform,
    botId,
    source: "user",
  };
  const userInsertResult = await coll.insertOne(userMessageDoc);
  if (userInsertResult?.insertedId) {
    userMessageDoc._id = userInsertResult.insertedId;
  }

  try {
    if (typeof io !== "undefined" && io) {
      let emittedUserMessage = userMessageDoc;
      try {
        const normalizedForEmit = normalizeMessageForFrontend(userMessageDoc);
        if (
          normalizedForEmit &&
          normalizedForEmit.role === "user" &&
          normalizedForEmit.contentType === "text" &&
          typeof normalizedForEmit.content === "string" &&
          normalizedForEmit.content.length > 0
        ) {
          const filteredContent = await filterMessage(
            normalizedForEmit.content,
          );
          if (filteredContent !== normalizedForEmit.content) {
            normalizedForEmit.originalContent = normalizedForEmit.content;
          }
          normalizedForEmit.content = filteredContent;
          normalizedForEmit.displayContent = filteredContent;
        }

        emittedUserMessage = {
          ...userMessageDoc,
          ...normalizedForEmit,
        };
      } catch (formatError) {
        emittedUserMessage = { ...userMessageDoc };
      }

      io.emit("newMessage", {
        userId: userId,
        message: emittedUserMessage,
        sender: "user",
        timestamp: emittedUserMessage.timestamp || userTimestamp,
      });
    }
  } catch (_) {
    // non-fatal: socket emit failure should not block saving history
  }

  try {
    const previewText = buildFollowUpPreview(userMsgToSave);
    await scheduleFollowUpForUser(userId, {
      platform,
      botId,
      messageTimestamp: userTimestamp,
      preview: previewText,
    });
  } catch (scheduleError) {
    console.error("[FollowUp] ตั้งเวลาติดตามไม่สำเร็จ:", scheduleError.message);
  }

  // Insert assistant message (only when we actually have content)
  const assistantText =
    typeof assistantMsg === "string" ? assistantMsg.trim() : "";
  if (assistantText) {
    const assistantTimestamp = new Date();
    const assistantMessageDoc = {
      senderId: userId,
      role: "assistant",
      content: assistantMsg,
      timestamp: assistantTimestamp,
      platform,
      botId,
      source: "ai",
    };
    const assistantInsertResult = await coll.insertOne(assistantMessageDoc);
    if (assistantInsertResult?.insertedId) {
      assistantMessageDoc._id = assistantInsertResult.insertedId;
    }

    try {
      if (typeof io !== "undefined" && io) {
        io.emit("newMessage", {
          userId,
          message: assistantMessageDoc,
          sender: "assistant",
          timestamp: assistantTimestamp,
        });
      }
    } catch (_) {
      // ไม่ต้องหยุดการทำงานหากไม่สามารถแจ้งเตือนผ่าน socket ได้
    }
  }

  // วิเคราะห์การติดตามลูกค้าหลังจากบันทึกข้อความของผู้ใช้
  const shouldAnalyzeFollowUp =
    typeof userMsgToSave === "string" ? userMsgToSave.trim().length > 0 : true;
  if (shouldAnalyzeFollowUp) {
    maybeAnalyzeFollowUp(userId, platform, botId).catch((error) => {
      console.error("[FollowUp] Background analyze error:", error.message);
    });
  }
}

/**
 * บันทึกการโต้ตอบของ Tool (Tool Call + Tool Result) ลงในประวัติแชท
 * ฟังก์ชันนี้ช่วยให้ AI จำได้ว่าทำอะไรไปแล้ว (Memory Persistence)
 */
async function saveToolInteraction(
  userId,
  toolCallMsg,
  toolResultMsg,
  platform = "line",
  botId = null,
) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue("enableChatHistory", true);
  if (!enableChatHistory) return;

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  const timestamp = new Date();

  // 1. บันทึก Assistant Message ที่มีการเรียก Tool (tool_calls)
  // เพื่อให้ AI รู้ว่ามันเป็นคนเรียกฟังก์ชันนี้เอง
  let assistantRes = { insertedId: null };
  if (toolCallMsg) {
    const assistantDoc = {
      senderId: "bot",
      role: "assistant", // เก็บเป็น assistant เพื่อให้สอดคล้องกับ Role ของ OpenAI
      content: toolCallMsg.content || "", // ปกติจะเป็น null หรือ empty string สำหรับ tool call
      tool_calls: toolCallMsg.tool_calls, // เก็บ array ของการเรียก tool (สำคัญมาก)
      timestamp: new Date(timestamp.getTime() - 100), // ให้เวลาน้อยกว่า result นิดหน่อย เพื่อเรียงลำดับถูก
      platform,
      botId,
      source: "bot",
      isToolCall: true, // flag ช่วยในการกรองถ้าต้องการ
    };

    assistantRes = await coll.insertOne(assistantDoc);
  }

  // 2. บันทึก Tool Message (ผลลัพธ์จาก Tool)
  // เพื่อให้ AI เห็นผลลัพธ์ว่าทำสำเร็จหรือไม่ ได้ค่าอะไรกลับมา
  // นี่คือส่วนที่ AI จะเห็น Order ID ที่สร้างไป
  const toolDoc = {
    senderId: "system",
    role: "tool", // Role เป็น tool ตามมาตรฐาน OpenAI
    content: toolResultMsg.content, // ผลลัพธ์ JSON string
    tool_call_id: toolResultMsg.tool_call_id, // link กับ call ข้างบน
    name: toolResultMsg.name,
    timestamp: timestamp,
    platform,
    botId,
    source: "system",
    isToolResult: true,
  };

  const toolRes = await coll.insertOne(toolDoc);

  return { assistantId: assistantRes.insertedId, toolId: toolRes.insertedId };
}

async function getUserStatus(userId) {

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("active_user_status");
  let userStatus = await coll.findOne({ senderId: userId });
  if (!userStatus) {
    userStatus = { senderId: userId, aiEnabled: true, updatedAt: new Date() };
    await coll.insertOne(userStatus);
  }
  return userStatus;
}

async function setUserStatus(userId, aiEnabled) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("active_user_status");
  await coll.updateOne(
    { senderId: userId },
    { $set: { aiEnabled, updatedAt: new Date() } },
    { upsert: true },
  );
}

/**
 * ตรวจจับและดำเนินการตาม keyword ที่ตั้งไว้
 * @param {string} message - ข้อความที่จะตรวจสอบ
 * @param {object} keywordSettings - การตั้งค่า keywords จาก bot config
 * @param {string} userId - User ID ของผู้รับข้อความ
 * @param {string} platform - แพลตฟอร์ม (line/facebook)
 * @param {string} botId - Bot ID
 * @param {boolean} isFromAdmin - เป็นข้อความจากแอดมินหรือไม่
 * @returns {Promise<{action: string|null, message: string, sendResponse: boolean}>} - action ที่ดำเนินการและข้อความตอบกลับ
 */
async function detectKeywordAction(
  message,
  keywordSettings,
  userId,
  platform,
  botId,
  isFromAdmin = false,
) {
  // ต้องเป็นข้อความจากแอดมินเท่านั้น
  if (!isFromAdmin) {
    return { action: null, message: "", sendResponse: false };
  }

  if (!keywordSettings || !message) {
    return { action: null, message: "", sendResponse: false };
  }

  const trimmedMessage = message.trim();

  const normalizeForComparison = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    let normalized = value;
    try {
      normalized = normalized.normalize("NFC");
    } catch (_) {
      // หาก normalize ใช้ไม่ได้ (เช่น environment เก่า) ให้ใช้ค่าดั้งเดิม
    }
    return normalized.trim().replace(/\s+/g, " ").toLowerCase();
  };

  const parseKeywords = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
    }
    if (typeof raw !== "string") {
      return [];
    }
    return raw
      .split(/[\n,|]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  };

  const matchesKeyword = (input, setting) => {
    const candidates =
      Array.isArray(setting.keywords) && setting.keywords.length > 0
        ? setting.keywords
        : setting.keyword
          ? [setting.keyword]
          : [];

    if (!candidates.length) {
      return false;
    }

    const normalizedInput = normalizeForComparison(input);
    if (!normalizedInput) {
      return false;
    }

    return candidates.some((candidate) => {
      const normalizedCandidate = normalizeForComparison(candidate);
      if (!normalizedCandidate) return false;
      return normalizedInput.includes(normalizedCandidate);
    });
  };

  // รองรับทั้งรูปแบบเก่า (string) และรูปแบบใหม่ (object)
  const normalizeKeywordSetting = (setting) => {
    if (!setting) {
      return { keyword: "", keywords: [], response: "" };
    }
    if (typeof setting === "string") {
      const keywords = parseKeywords(setting);
      return {
        keyword: keywords[0] || "",
        keywords,
        response: "",
      };
    }
    if (Array.isArray(setting)) {
      const keywords = parseKeywords(setting);
      return {
        keyword: keywords[0] || "",
        keywords,
        response: "",
      };
    }
    return {
      keyword: setting.keyword || "",
      keywords: parseKeywords(setting.keywords || setting.keyword || ""),
      response: typeof setting.response === "string" ? setting.response : "",
    };
  };

  const enableAI = normalizeKeywordSetting(keywordSettings.enableAI);
  const disableAI = normalizeKeywordSetting(keywordSettings.disableAI);
  const disableFollowUp = normalizeKeywordSetting(
    keywordSettings.disableFollowUp,
  );

  // ตรวจสอบ keyword สำหรับเปิด AI
  if (matchesKeyword(trimmedMessage, enableAI)) {
    await setUserStatus(userId, true);
    console.log(
      `[Keyword] เปิด AI สำหรับผู้ใช้ ${userId} ด้วย keyword: "${trimmedMessage}"`,
    );
    const responseMessage = enableAI.response.trim();
    const sendResponse = responseMessage.length > 0;
    return {
      action: "enableAI",
      message: responseMessage || `✅ เปิดระบบ AI สำหรับผู้ใช้นี้แล้ว`,
      sendResponse: sendResponse,
    };
  }

  // ตรวจสอบ keyword สำหรับปิด AI
  if (matchesKeyword(trimmedMessage, disableAI)) {
    await setUserStatus(userId, false);
    try {
      await cancelFollowUpTasksForUser(userId, platform, botId, {
        reason: "disable_ai_keyword",
      });
    } catch (followUpError) {
      console.error(
        `[Keyword] ไม่สามารถยกเลิกงานติดตามสำหรับผู้ใช้ ${userId} หลังจากปิด AI:`,
        followUpError?.message || followUpError,
      );
    }
    console.log(
      `[Keyword] ปิด AI สำหรับผู้ใช้ ${userId} ด้วย keyword: "${trimmedMessage}"`,
    );
    const responseMessage = disableAI.response.trim();
    const sendResponse = responseMessage.length > 0;
    return {
      action: "disableAI",
      message: responseMessage || `⏸️ ปิดระบบ AI สำหรับผู้ใช้นี้แล้ว`,
      sendResponse: sendResponse,
    };
  }

  // ตรวจสอบ keyword สำหรับปิดระบบติดตาม
  if (matchesKeyword(trimmedMessage, disableFollowUp)) {
    await cancelFollowUpTasksForUser(userId, platform, botId, {
      reason: "keyword_cancel",
    });
    console.log(
      `[Keyword] ปิดระบบติดตามสำหรับผู้ใช้ ${userId} ด้วย keyword: "${trimmedMessage}"`,
    );
    const responseMessage = disableFollowUp.response.trim();
    const sendResponse = responseMessage.length > 0;
    return {
      action: "disableFollowUp",
      message: responseMessage || `🔕 ปิดระบบติดตามสำหรับผู้ใช้นี้แล้ว`,
      sendResponse: sendResponse,
    };
  }

  return { action: null, message: "", sendResponse: false };
}

/**
 * ฟังก์ชันสำหรับลบประวัติการสนทนาทั้งหมดของ user
 */
async function clearUserChatHistory(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  await coll.deleteMany(buildChatHistoryUserMatch(userId));
}

const BANGKOK_TZ = "Asia/Bangkok";
const FOLLOW_UP_BASE_CACHE_TTL = 60 * 1000;
let followUpBaseConfigCache = null;
let followUpBaseCacheTimestamp = 0;
const followUpContextCache = new Map();
let followUpTaskTimer = null;
let followUpProcessing = false;
const FOLLOW_UP_TASK_INTERVAL_MS = 30 * 1000;

const DEFAULT_ORDER_PROMPT_BODY = `วิเคราะห์บทสนทนาเพื่อสกัดข้อมูลออเดอร์ โดยให้ความสำคัญกับการสรุปยอดล่าสุดที่สุดในบทสนทนา (ถ้ามีหลายรอบให้ใช้ข้อมูลจากรอบล่าสุดเท่านั้น)

เกณฑ์การพิจารณา:
✅ ถือว่ามีออเดอร์ = ลูกค้าสั่งซื้อสินค้าชัดเจน พร้อมระบุรายละเอียด
❌ ไม่ถือว่ามีออเดอร์ = ถามราคา, ต่อรอง, ลังเล, พิจารณาอยู่, ถามสถานะการจัดส่ง/เลขพัสดุ/ของถึงหรือยัง (เป็นการติดตามออเดอร์เดิม)

ข้อมูลที่ต้องสกัด:
- items: รายการสินค้า [{product: "ชื่อสินค้า", quantity: จำนวน, price: ราคาต่อชิ้น}]
- totalAmount: ยอดรวมทั้งหมด (ถ้าไม่ระบุให้คำนวณจาก items)
- shippingAddress: ที่อยู่จัดส่ง เฉพาะบ้านเลขที่/หมู่/ซอย/ถนน เท่านั้น (ห้ามใส่ตำบล อำเภอ จังหวัด รหัสไปรษณีย์ เพราะมี field แยกต่างหาก) จำเป็นต้องมี ถ้าไม่มีให้สรุปว่าไม่มีออเดอร์
- phone: เบอร์โทรศัพท์ (ถ้าไม่ระบุให้เป็น null)
- email: อีเมลลูกค้าหรือ null
- paymentMethod: วิธีชำระเงิน ("โอนเงิน", "เก็บเงินปลายทาง", หรือ null)
- shippingCost: ค่าส่ง (ตัวเลข; หากไม่ระบุให้ใช้ 0 และถือว่าส่งฟรี)
- customerName: ชื่อลูกค้า (ถ้าไม่ระบุให้เป็น null)
- recipientName: ชื่อผู้รับพัสดุ (ถ้าไม่ระบุให้ใช้ชื่อลูกค้า)
- addressSubDistrict: ตำบล/แขวง (สกัดจากที่อยู่ ถ้าไม่พบให้เป็น null)
- addressDistrict: อำเภอ/เขต (สกัดจากที่อยู่ ถ้าไม่พบให้เป็น null)
- addressProvince: จังหวัด (สกัดจากที่อยู่ ถ้าไม่พบให้เป็น null)
- addressPostalCode: รหัสไปรษณีย์ (สกัดจากที่อยู่ ถ้าไม่พบให้เป็น null)
- transferDate: วันที่โอนเงิน (รูปแบบ YYYY-MM-DD หรือ null)
- transferTime: เวลาที่โอน (รูปแบบ HH:mm หรือ null)
- paymentReceiver: ผู้รับเงิน (ถ้าไม่พบให้เป็น null)
- notes: หมายเหตุเพิ่มเติม (ถ้าไม่พบให้เป็น null)

⚠️ สำคัญ: shippingAddress ต้องไม่รวมตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ - ให้แยกไปใส่ใน addressSubDistrict, addressDistrict, addressProvince, addressPostalCode แทน

รายละเอียดสินค้าที่สามารถระบุได้เพิ่มเติมแต่เว้นว่างได้:
- shippingName: ชื่อสินค้า (สำหรับขนส่ง)
- color: สีสินค้า
- width: ความกว้าง (เซนติเมตร)
- length: ความยาว (เซนติเมตร)
- height: ความสูง (เซนติเมตร)
- weight: น้ำหนัก (กิโลกรัม)
- หากได้รับข้อมูลที่อยู่หรือชื่อลูกค้าจากออเดอร์ก่อนหน้า ให้ใช้เป็นค่าเริ่มต้นเมื่อไม่มีข้อมูลใหม่`;

const ORDER_PROMPT_JSON_SUFFIX = `ตอบเป็น JSON เท่านั้น: {
  "hasOrder": true/false,
  "orderData": {
    "items": [
      {
        "product": "ชื่อสินค้า",
        "quantity": จำนวน,
        "price": ราคา,
        "shippingName": "ชื่อสำหรับขนส่งหรือ null",
        "color": "สีหรือ null",
        "width": "ความกว้างหรือ null",
        "length": "ความยาวหรือ null",
        "height": "ความสูงหรือ null",
        "weight": "น้ำหนักหรือ null"
      }
    ],
    "totalAmount": จำนวน,
    "shippingAddress": "บ้านเลขที่/หมู่/ซอย/ถนน เท่านั้น (ไม่รวมตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์)",
    "phone": "เบอร์โทรหรือ null",
    "email": "อีเมลหรือ null",
    "paymentMethod": "วิธีชำระหรือ null",
    "shippingCost": จำนวน,
    "customerName": "ชื่อลูกค้าหรือ null",
    "recipientName": "ชื่อผู้รับหรือ null",
    "addressSubDistrict": "ตำบล/แขวงหรือ null",
    "addressDistrict": "อำเภอ/เขตหรือ null",
    "addressProvince": "จังหวัดหรือ null",
    "addressPostalCode": "รหัสไปรษณีย์หรือ null",
    "transferDate": "YYYY-MM-DD หรือ null",
    "transferTime": "HH:mm หรือ null",
    "paymentReceiver": "ผู้รับเงินหรือ null",
    "notes": "หมายเหตุหรือ null"
  },
  "confidence": 0.0-1.0,
  "reason": "เหตุผลสั้นๆ (หากไม่มีที่อยู่ให้สรุปว่าไม่มีออเดอร์)"
}`;

function normalizeFollowUpBotId(botId) {
  if (!botId) return null;
  if (typeof botId === "string") return botId;
  try {
    return botId.toString();
  } catch {
    return String(botId);
  }
}

function getBangkokMoment(value = null) {
  if (value instanceof Date) return moment.tz(value, BANGKOK_TZ);
  if (typeof value === "number") return moment.tz(value, BANGKOK_TZ);
  if (typeof value === "string") return moment.tz(new Date(value), BANGKOK_TZ);
  return moment.tz(BANGKOK_TZ);
}

function getDateKey(date = new Date()) {
  return getBangkokMoment(date).format("YYYY-MM-DD");
}

function sanitizeFollowUpImage(image) {
  if (!image) return null;
  let url = typeof image.url === "string" ? image.url.trim() : "";
  if (!url) return null;

  // แปลง relative URL เป็น absolute URL
  if (url.startsWith("/") && PUBLIC_BASE_URL) {
    url = PUBLIC_BASE_URL.replace(/\/$/, "") + url;
  }

  const previewCandidates = [
    typeof image.previewUrl === "string" ? image.previewUrl.trim() : "",
    typeof image.thumbUrl === "string" ? image.thumbUrl.trim() : "",
  ];
  let previewUrl = previewCandidates.find((value) => value) || url;

  // แปลง relative preview URL เป็น absolute URL
  if (previewUrl.startsWith("/") && PUBLIC_BASE_URL) {
    previewUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + previewUrl;
  }

  const sanitized = {
    url,
    previewUrl,
  };

  if (typeof image.thumbUrl === "string" && image.thumbUrl.trim()) {
    let thumbUrl = image.thumbUrl.trim();
    // แปลง relative thumb URL เป็น absolute URL
    if (thumbUrl.startsWith("/") && PUBLIC_BASE_URL) {
      thumbUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + thumbUrl;
    }
    sanitized.thumbUrl = thumbUrl;
  }

  const assignTrimmed = (field, value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) sanitized[field] = trimmed;
    }
  };

  assignTrimmed("alt", image.alt);
  assignTrimmed("caption", image.caption);
  assignTrimmed("fileName", image.fileName);

  const assetId = image.assetId ?? image.id ?? image._id;
  if (assetId !== undefined && assetId !== null) {
    try {
      const value =
        typeof assetId === "string" ? assetId.trim() : assetId.toString();
      if (value) sanitized.assetId = value;
    } catch {
      const fallback = String(assetId);
      if (fallback) sanitized.assetId = fallback;
    }
  }

  ["width", "height", "size"].forEach((key) => {
    const numeric = Number(image[key]);
    if (Number.isFinite(numeric) && numeric > 0) {
      sanitized[key] = Math.round(numeric);
    }
  });

  return sanitized;
}

function sanitizeFollowUpImages(images) {
  if (!Array.isArray(images)) return [];
  return images.map(sanitizeFollowUpImage).filter(Boolean);
}

function summarizeFollowUpRound(round) {
  if (!round) return "";
  const message = typeof round.message === "string" ? round.message.trim() : "";
  const imageCount = Array.isArray(round.images) ? round.images.length : 0;

  if (message && imageCount > 0) {
    return `${message} • รูปภาพ ${imageCount} รูป`;
  }
  if (message) return message;
  if (imageCount > 0) {
    return `ส่งรูปภาพ ${imageCount} รูป`;
  }
  return "";
}

function normalizeFollowUpRounds(rounds) {
  if (!Array.isArray(rounds)) return [];
  const normalized = [];
  rounds.forEach((item, idx) => {
    if (!item) return;
    const delay = Number(item.delayMinutes);
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const images = sanitizeFollowUpImages(item.images || item.media);

    if (!Number.isFinite(delay) || delay < 1) return;
    if (!message && images.length === 0) return;
    normalized.push({
      delayMinutes: Math.round(delay),
      message,
      images,
      order: idx,
    });
  });
  normalized.sort((a, b) => {
    if (a.delayMinutes === b.delayMinutes) {
      return (a.order || 0) - (b.order || 0);
    }
    return a.delayMinutes - b.delayMinutes;
  });
  return normalized.map((round) => {
    const { order, ...rest } = round;
    return rest;
  });
}

function resetFollowUpConfigCache() {
  followUpBaseConfigCache = null;
  followUpBaseCacheTimestamp = 0;
  followUpContextCache.clear();
}

async function getFollowUpBaseConfig() {
  const now = Date.now();
  if (
    followUpBaseConfigCache &&
    now - followUpBaseCacheTimestamp < FOLLOW_UP_BASE_CACHE_TTL
  ) {
    return followUpBaseConfigCache;
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");
  const keys = [
    "enableFollowUpAnalysis",
    "followUpShowInChat",
    "followUpShowInDashboard",
    "followUpAutoEnabled",
    "followUpRounds",
    "followUpOrderPromptInstructions",
  ];
  const docs = await coll.find({ key: { $in: keys } }).toArray();
  const map = {};
  docs.forEach((doc) => {
    map[doc.key] = doc.value;
  });

  const config = {
    analysisEnabled:
      typeof map.enableFollowUpAnalysis === "boolean"
        ? map.enableFollowUpAnalysis
        : true,
    showInChat:
      typeof map.followUpShowInChat === "boolean"
        ? map.followUpShowInChat
        : true,
    showInDashboard:
      typeof map.followUpShowInDashboard === "boolean"
        ? map.followUpShowInDashboard
        : true,
    autoFollowUpEnabled:
      typeof map.followUpAutoEnabled === "boolean"
        ? map.followUpAutoEnabled
        : false,
    rounds: normalizeFollowUpRounds(map.followUpRounds || []),
    orderPromptInstructions:
      typeof map.followUpOrderPromptInstructions === "string" &&
        map.followUpOrderPromptInstructions.trim().length
        ? map.followUpOrderPromptInstructions.trim()
        : DEFAULT_ORDER_PROMPT_BODY,
  };

  followUpBaseConfigCache = config;
  followUpBaseCacheTimestamp = now;
  return config;
}

async function getFollowUpConfigForContext(platform = "line", botId = null) {
  const normalizedPlatform = platform || "line";
  const normalizedBotId = normalizeFollowUpBotId(botId);
  const cacheKey = `${normalizedPlatform}:${normalizedBotId || "default"}`;
  if (followUpContextCache.has(cacheKey)) {
    return followUpContextCache.get(cacheKey);
  }

  const baseConfig = await getFollowUpBaseConfig();
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_page_settings");

  let query = { platform: normalizedPlatform };
  if (normalizedBotId === null) {
    query.botId = null;
  } else {
    query.botId = { $in: [null, normalizedBotId] };
  }

  const overrides = await coll.find(query).toArray();
  let platformDefaults = {};
  let specificOverrides = {};
  overrides.forEach((doc) => {
    if (!doc) return;
    const settings = doc.settings || {};
    if (doc.botId === null) {
      platformDefaults = { ...platformDefaults, ...settings };
    } else if (doc.botId === normalizedBotId) {
      specificOverrides = { ...specificOverrides, ...settings };
    }
  });

  const merged = {
    ...baseConfig,
    ...platformDefaults,
    ...specificOverrides,
  };

  merged.rounds = normalizeFollowUpRounds(
    (specificOverrides && specificOverrides.rounds) ||
    (platformDefaults && platformDefaults.rounds) ||
    (baseConfig && baseConfig.rounds) ||
    [],
  );

  if (typeof merged.autoFollowUpEnabled !== "boolean") {
    merged.autoFollowUpEnabled = baseConfig.autoFollowUpEnabled !== false;
  }

  const promptText =
    typeof merged.orderPromptInstructions === "string"
      ? merged.orderPromptInstructions.trim()
      : "";
  merged.orderPromptInstructions = promptText || DEFAULT_ORDER_PROMPT_BODY;

  followUpContextCache.set(cacheKey, merged);
  return merged;
}

async function getOrderPromptBody(platform = "line", botId = null) {
  try {
    const config = await getFollowUpConfigForContext(platform, botId);
    if (
      config &&
      typeof config.orderPromptInstructions === "string" &&
      config.orderPromptInstructions.trim()
    ) {
      return config.orderPromptInstructions.trim();
    }
  } catch (error) {
    console.warn(
      `[Order] ไม่สามารถโหลดคำสั่งวิเคราะห์สำหรับ ${platform}:${botId || "default"
      }: ${error.message}`,
    );
  }
  return DEFAULT_ORDER_PROMPT_BODY;
}

async function listFollowUpPageSettings() {
  const baseConfig = await getFollowUpBaseConfig();
  const client = await connectDB();
  const db = client.db("chatbot");
  const lineBots = await db
    .collection("line_bots")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  const facebookBots = await db
    .collection("facebook_bots")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  const settingsDocs = await db
    .collection("follow_up_page_settings")
    .find({})
    .toArray();

  const settingsMap = {};
  settingsDocs.forEach((doc) => {
    if (!doc || !doc.platform) return;
    const key = `${doc.platform}:${doc.botId || "default"}`;
    settingsMap[key] = doc;
  });

  const buildConfig = (platform, botId = null) => {
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const platformDefault =
      settingsMap[`${platform}:default`] || settingsMap[`${platform}:null`];
    const specific = normalizedBotId
      ? settingsMap[`${platform}:${normalizedBotId}`]
      : null;
    const config = {
      ...baseConfig,
      ...(platformDefault?.settings || {}),
      ...(specific?.settings || {}),
    };
    config.rounds = normalizeFollowUpRounds(
      specific?.settings?.rounds ||
      platformDefault?.settings?.rounds ||
      baseConfig?.rounds ||
      [],
    );
    if (typeof config.autoFollowUpEnabled !== "boolean") {
      config.autoFollowUpEnabled = baseConfig.autoFollowUpEnabled !== false;
    }
    const promptText =
      typeof config.orderPromptInstructions === "string"
        ? config.orderPromptInstructions.trim()
        : "";
    config.orderPromptInstructions = promptText || DEFAULT_ORDER_PROMPT_BODY;
    return config;
  };

  const pages = [];

  lineBots.forEach((bot) => {
    const key = `line:${bot._id.toString()}`;
    const config = buildConfig("line", bot._id.toString());
    const doc = settingsMap[key];
    pages.push({
      id: key,
      platform: "line",
      botId: bot._id.toString(),
      type: "line_bot",
      name:
        bot.name ||
        bot.displayName ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`,
      settings: config,
      hasOverride: !!doc,
      updatedAt: doc?.updatedAt || null,
      metadata: {
        status: bot.status || null,
        description: bot.description || "",
      },
    });
  });

  facebookBots.forEach((bot) => {
    const key = `facebook:${bot._id.toString()}`;
    const config = buildConfig("facebook", bot._id.toString());
    const doc = settingsMap[key];
    pages.push({
      id: key,
      platform: "facebook",
      botId: bot._id.toString(),
      type: "facebook_bot",
      name:
        bot.pageName ||
        bot.name ||
        `Facebook Page (${bot._id.toString().slice(-4)})`,
      settings: config,
      hasOverride: !!doc,
      updatedAt: doc?.updatedAt || null,
      metadata: {
        status: bot.status || null,
        pageId: bot.pageId || null,
      },
    });
  });

  return {
    baseConfig,
    pages,
  };
}

function buildFollowUpPreview(rawContent) {
  try {
    if (rawContent === null || typeof rawContent === "undefined") {
      return "";
    }
    const sanitized = sanitizeContentForFollowUp(rawContent);
    if (!sanitized) return "";
    return sanitized.length > 200 ? `${sanitized.slice(0, 197)}…` : sanitized;
  } catch (error) {
    try {
      const asString =
        typeof rawContent === "string"
          ? rawContent.trim()
          : JSON.stringify(rawContent);
      if (!asString) return "";
      return asString.length > 200 ? `${asString.slice(0, 197)}…` : asString;
    } catch {
      return "";
    }
  }
}

function emitFollowUpScheduleUpdate(payload) {
  try {
    if (io) {
      const sanitized = { ...(payload || {}) };
      Object.keys(sanitized).forEach((key) => {
        if (typeof sanitized[key] === "undefined") {
          delete sanitized[key];
        }
      });
      io.emit("followUpScheduleUpdated", sanitized);
    }
  } catch (_) { }
}

async function scheduleFollowUpForUser(userId, options = {}) {
  try {
    const {
      platform = "line",
      botId = null,
      messageTimestamp = new Date(),
      preview = "",
      configOverride = null,
    } = options || {};

    const normalizedPlatform = platform || "line";
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const contextKey = `${normalizedPlatform}:${normalizedBotId || "default"}`;

    const config =
      configOverride ||
      (await getFollowUpConfigForContext(normalizedPlatform, normalizedBotId));
    if (!config) return null;
    if (config.autoFollowUpEnabled === false) return null;

    const roundsConfig = normalizeFollowUpRounds(config.rounds || []);
    if (roundsConfig.length === 0) return null;

    // ข้ามหากลูกค้าซื้อแล้ว - ตรวจสอบทั้ง follow_up_status และ orders collection
    const status = await getFollowUpStatus(userId);
    if (status?.hasFollowUp) {
      return null;
    }

    // ตรวจสอบ orders collection โดยตรง เพื่อป้องกัน race condition
    // กรณีที่ follow_up_status ยังไม่ถูก update แต่มีออเดอร์แล้วจริง
    const latestOrder = await getLatestOrderForUser(userId);
    if (latestOrder) {
      const reasonCandidate =
        typeof latestOrder.notes === "string" ? latestOrder.notes.trim() : "";
      const followUpReason = reasonCandidate || "ลูกค้ามีออเดอร์แล้ว";
      const followUpUpdatedAt = latestOrder.extractedAt
        ? new Date(latestOrder.extractedAt)
        : new Date();

      console.log(
        `[FollowUp] ข้าม scheduleFollowUp สำหรับ ${userId} - พบออเดอร์แล้ว`,
      );

      // ยกเลิกงานติดตามที่มีอยู่ทั้งหมดของผู้ใช้นี้
      await cancelFollowUpTasksForUser(
        userId,
        normalizedPlatform,
        normalizedBotId,
        { reason: "order_exists" },
      );

      // อัปเดต follow_up_status ให้ตรงกับความเป็นจริง
      await updateFollowUpStatus(userId, {
        hasFollowUp: true,
        followUpReason,
        followUpUpdatedAt,
        platform: normalizedPlatform,
        botId: normalizedBotId,
      });

      return null;
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");

    const dateKey = getDateKey(messageTimestamp);
    const existingTask = await coll.findOne(
      { userId, platform: normalizedPlatform, botId: normalizedBotId, dateKey },
      { sort: { createdAt: -1 } },
    );
    const now = new Date();
    const previewText =
      typeof preview === "string" ? preview : buildFollowUpPreview(preview);

    if (existingTask) {
      // ⚠️ สำคัญ: ห้าม reactivate task ที่ถูก cancel เพราะลูกค้าซื้อแล้ว
      // ป้องกันการส่ง follow-up ไปหาลูกค้าที่ซื้อไปแล้ว
      const orderRelatedCancelReasons = [
        "order_exists",
        "order_detected",
        "already_purchased",
      ];
      if (
        existingTask.canceled &&
        orderRelatedCancelReasons.includes(existingTask.cancelReason)
      ) {
        console.log(
          `[FollowUp] ข้าม reactivate task สำหรับ ${userId} - task ถูก cancel เพราะ "${existingTask.cancelReason}"`,
        );
        return null;
      }

      const shouldResetProgress = !!(existingTask.completed || existingTask.canceled);
      const roundsFromDb = Array.isArray(existingTask.rounds)
        ? existingTask.rounds
        : [];
      const sentRoundsCount = roundsFromDb.reduce(
        (count, round) => (round?.status === "sent" ? count + 1 : count),
        0,
      );
      const completedRounds = shouldResetProgress
        ? 0
        : Math.min(
          roundsConfig.length,
          Math.max(
            typeof existingTask.nextRoundIndex === "number"
              ? existingTask.nextRoundIndex
              : 0,
            sentRoundsCount,
            Array.isArray(existingTask.sentRounds)
              ? existingTask.sentRounds.length
              : 0,
          ),
        );

      const baseMoment = getBangkokMoment(messageTimestamp);
      const rebuiltRounds = roundsConfig.map((round, index) => {
        const scheduledMoment = baseMoment.clone().add(round.delayMinutes, "minutes");
        const sanitizedImages = sanitizeFollowUpImages(round.images);
        const wasSent = !shouldResetProgress && index < completedRounds;
        const existing = roundsFromDb[index] || {};

        return {
          index,
          delayMinutes: round.delayMinutes,
          message: typeof round.message === "string" ? round.message : "",
          images: sanitizedImages,
          scheduledAt: scheduledMoment.toDate(),
          sentAt: wasSent ? existing.sentAt || existing.sent_at || null : null,
          status: wasSent ? "sent" : "pending",
        };
      });

      const nextRoundIndex = shouldResetProgress
        ? 0
        : Math.min(completedRounds, rebuiltRounds.length);
      const nextScheduledAt = rebuiltRounds[nextRoundIndex]?.scheduledAt || null;

      await coll.updateOne(
        { _id: existingTask._id },
        {
          $set: {
            rounds: rebuiltRounds,
            nextRoundIndex,
            nextScheduledAt,
            lastUserMessageAt: messageTimestamp,
            lastUserMessagePreview:
              previewText || existingTask.lastUserMessagePreview || "",
            updatedAt: now,
            contextKey,
            canceled: false,
            completed: false,
            cancelReason: null,
            canceledAt: null,
            ...(shouldResetProgress
              ? {
                sentRounds: [],
                lastSentAt: null,
              }
              : {}),
            configSnapshot: {
              rounds: roundsConfig.map((item) => ({
                delayMinutes: item.delayMinutes,
                message: typeof item.message === "string" ? item.message : "",
                images: sanitizeFollowUpImages(item.images),
              })),
              autoFollowUpEnabled: config.autoFollowUpEnabled !== false,
            },
          },
        },
      );

      emitFollowUpScheduleUpdate({
        userId,
        platform: normalizedPlatform,
        botId: normalizedBotId,
        contextKey,
        status: "scheduled",
        nextScheduledAt,
      });
      return null;
    }

    const baseMoment = getBangkokMoment(messageTimestamp);
    const rounds = roundsConfig.map((round, index) => {
      const scheduledMoment = baseMoment
        .clone()
        .add(round.delayMinutes, "minutes");
      const sanitizedImages = sanitizeFollowUpImages(round.images);

      return {
        index,
        delayMinutes: round.delayMinutes,
        message: typeof round.message === "string" ? round.message : "",
        images: sanitizedImages,
        scheduledAt: scheduledMoment.toDate(),
        sentAt: null,
        status: "pending",
      };
    });

    if (rounds.length === 0) return null;

    const taskDoc = {
      userId,
      platform: normalizedPlatform,
      botId: normalizedBotId,
      dateKey,
      contextKey,
      rounds,
      lastUserMessageAt: messageTimestamp,
      lastUserMessagePreview: previewText,
      nextRoundIndex: 0,
      nextScheduledAt: rounds[0]?.scheduledAt || null,
      lastSentAt: null,
      sentRounds: [],
      canceled: false,
      completed: false,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      configSnapshot: {
        rounds: roundsConfig.map((item) => ({
          delayMinutes: item.delayMinutes,
          message: typeof item.message === "string" ? item.message : "",
          images: sanitizeFollowUpImages(item.images),
        })),
        autoFollowUpEnabled: config.autoFollowUpEnabled !== false,
      },
    };

    await coll.insertOne(taskDoc);
    emitFollowUpScheduleUpdate({
      userId,
      platform: normalizedPlatform,
      botId: normalizedBotId,
      contextKey,
      status: "scheduled",
      nextScheduledAt: taskDoc.nextScheduledAt,
    });
    return taskDoc;
  } catch (error) {
    console.error(
      "[FollowUp] ไม่สามารถตั้งเวลาส่งข้อความติดตามได้:",
      error.message,
    );
    return null;
  }
}

async function cancelFollowUpTasksForUser(
  userId,
  platform = null,
  botId = undefined,
  options = {},
) {
  try {
    const { reason = "manual", dateKey = null } = options || {};
    const normalizedPlatform = platform || null;
    const normalizedBotId =
      botId === undefined ? undefined : normalizeFollowUpBotId(botId);
    const contextKey =
      normalizedPlatform && normalizedBotId !== undefined
        ? `${normalizedPlatform}:${normalizedBotId || "default"}`
        : null;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");
    const now = new Date();
    const query = { userId };

    if (normalizedPlatform) {
      query.platform = normalizedPlatform;
    }
    if (normalizedBotId !== undefined) {
      query.botId = normalizedBotId;
    }
    if (dateKey) {
      query.dateKey = dateKey;
    }

    const result = await coll.updateMany(
      {
        ...query,
        canceled: { $ne: true },
        completed: { $ne: true },
      },
      {
        $set: {
          canceled: true,
          cancelReason: reason,
          canceledAt: now,
          updatedAt: now,
        },
      },
    );

    if (result.modifiedCount > 0) {
      emitFollowUpScheduleUpdate({
        userId,
        platform: normalizedPlatform || undefined,
        botId: normalizedBotId === undefined ? undefined : normalizedBotId,
        contextKey: contextKey || undefined,
        status: "canceled",
        reason,
      });
    }
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถยกเลิกงานติดตามได้:", error.message);
  }
}

async function ensureFollowUpIndexes() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");
    await coll.createIndex({ userId: 1, platform: 1, botId: 1, dateKey: 1 });
    await coll.createIndex({ nextScheduledAt: 1, canceled: 1, completed: 1 });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถสร้างดัชนีได้:", error.message);
  }
}

async function processDueFollowUpTasks(limit = 10) {
  if (followUpProcessing) return;
  followUpProcessing = true;
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");
    const now = new Date();
    const tasks = await coll
      .find({
        canceled: { $ne: true },
        completed: { $ne: true },
        nextScheduledAt: { $lte: now },
      })
      .sort({ nextScheduledAt: 1 })
      .limit(limit)
      .toArray();

    for (const task of tasks) {
      await handleFollowUpTask(task, db);
    }
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถประมวลผลงานติดตาม:", error.message);
  } finally {
    followUpProcessing = false;
  }
}

async function handleFollowUpTask(task, db) {
  const rounds = Array.isArray(task.rounds) ? task.rounds : [];
  const currentIndex =
    typeof task.nextRoundIndex === "number" ? task.nextRoundIndex : 0;
  const round = rounds[currentIndex];
  const coll = db.collection("follow_up_tasks");
  const now = new Date();
  const derivedContextKey =
    task.contextKey ||
    `${task.platform || "line"}:${normalizeFollowUpBotId(task.botId) || "default"}`;


  if (!round) {
    await coll.updateOne(
      { _id: task._id },
      {
        $set: {
          completed: true,
          nextScheduledAt: null,
          updatedAt: now,
        },
      },
    );
    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: "completed",
    });
    return;
  }

  // ตรวจสอบ follow_up_status ก่อน (กรณีถูก mark ว่าซื้อแล้วจากที่อื่น)
  const followUpStatus = await getFollowUpStatus(task.userId);
  if (followUpStatus?.hasFollowUp) {
    console.log(
      `[FollowUp] ยกเลิกการส่งติดตาม ${task.userId} - ถูก mark ว่าซื้อแล้ว`,
    );
    await coll.updateOne(
      { _id: task._id },
      {
        $set: {
          canceled: true,
          cancelReason: "already_purchased",
          canceledAt: now,
          updatedAt: now,
        },
      },
    );
    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: "canceled",
      reason: "already_purchased",
    });
    return;
  }

  // ตรวจสอบออเดอร์ก่อนส่งข้อความติดตาม
  // ป้องกันกรณีลูกค้าสร้างออเดอร์หลังจาก task ถูก schedule
  const latestOrder = await getLatestOrderForUser(task.userId);
  if (latestOrder) {
    const reasonCandidate =
      typeof latestOrder.notes === "string" ? latestOrder.notes.trim() : "";
    const followUpReason = reasonCandidate || "ลูกค้ามีออเดอร์แล้ว";
    const followUpUpdatedAt = latestOrder.extractedAt
      ? new Date(latestOrder.extractedAt)
      : now;

    console.log(
      `[FollowUp] ยกเลิกการส่งติดตาม ${task.userId} - พบออเดอร์แล้ว`,
    );
    await coll.updateOne(
      { _id: task._id },
      {
        $set: {
          canceled: true,
          cancelReason: "order_exists",
          canceledAt: now,
          updatedAt: now,
        },
      },
    );
    await updateFollowUpStatus(task.userId, {
      hasFollowUp: true,
      followUpReason,
      followUpUpdatedAt,
      platform: task.platform || "line",
      botId: normalizeFollowUpBotId(task.botId),
    });
    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: "canceled",
      reason: "order_exists",
    });
    return;
  }

  try {
    await sendFollowUpMessage(task, round, db);

    const nextIndex = currentIndex + 1;
    const hasMore = nextIndex < rounds.length;
    const updateSet = {
      [`rounds.${currentIndex}.sentAt`]: now,
      [`rounds.${currentIndex}.status`]: "sent",
      lastSentAt: now,
      updatedAt: now,
      nextRoundIndex: nextIndex,
      nextScheduledAt: hasMore ? rounds[nextIndex].scheduledAt : null,
      completed: !hasMore,
      contextKey: derivedContextKey,
    };

    await coll.updateOne(
      { _id: task._id },
      {
        $set: updateSet,
        $addToSet: { sentRounds: currentIndex },
      },
    );

    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: updateSet.completed ? "completed" : "progress",
      currentRound: currentIndex,
      nextRound: hasMore ? nextIndex : null,
      nextScheduledAt: updateSet.nextScheduledAt,
    });
  } catch (error) {
    console.error("[FollowUp] ส่งข้อความติดตามไม่สำเร็จ:", error.message);
    await coll.updateOne(
      { _id: task._id },
      {
        $set: {
          [`rounds.${currentIndex}.status`]: "failed",
          [`rounds.${currentIndex}.error`]: error.message,
          canceled: true,
          cancelReason: "send_failed",
          canceledAt: now,
          updatedAt: now,
        },
      },
    );
    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: "failed",
      reason: "send_failed",
    });
  }
}

async function sendFollowUpMessage(task, round, db) {
  const message =
    typeof round?.message === "string" ? round.message.trim() : "";
  let images = sanitizeFollowUpImages(round?.images || []);

  // ถ้า PUBLIC_BASE_URL ไม่ได้ตั้งค่า ให้เตือน
  if (!PUBLIC_BASE_URL) {
    console.warn(
      "[FollowUp Warning] PUBLIC_BASE_URL is not set. Images with relative URLs may fail.",
    );
  }

  // แปลง relative URLs เป็น absolute URLs ถ้า PUBLIC_BASE_URL มี
  if (PUBLIC_BASE_URL) {
    images = images.map((img) => {
      const fixed = { ...img };
      if (img.url && img.url.startsWith("/")) {
        fixed.url = PUBLIC_BASE_URL.replace(/\/$/, "") + img.url;
      }
      if (img.previewUrl && img.previewUrl.startsWith("/")) {
        fixed.previewUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + img.previewUrl;
      }
      if (img.thumbUrl && img.thumbUrl.startsWith("/")) {
        fixed.thumbUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + img.thumbUrl;
      }
      return fixed;
    });
  }


  if (!message && images.length === 0) {
    throw new Error("ไม่มีเนื้อหาสำหรับการติดตาม");
  }

  if (task.platform === "facebook") {
    console.log(`[FollowUp] FB: ${task.userId}, msg:${!!message}, imgs:${images.length}`);

    if (!task.botId) {
      throw new Error("ไม่พบ Facebook Bot สำหรับการส่งข้อความ");
    }
    const query = ObjectId.isValid(task.botId)
      ? { _id: new ObjectId(task.botId) }
      : { _id: task.botId };
    const fbBot = await db.collection("facebook_bots").findOne(query);
    if (!fbBot || !fbBot.accessToken) {
      throw new Error("ไม่พบข้อมูล Facebook Bot");
    }
    const metadata = "follow_up_auto";

    // สร้างข้อความรวม text และรูปภาพ ในรูปแบบที่ sendFacebookMessage รองรับ
    let combinedMessage = message || "";

    // เพิ่ม [cut] เพื่อแยกข้อความถ้ามีทั้ง text และรูป
    if (message && images.length > 0) {
      combinedMessage += "[cut]";
    }

    const followUpAssets = [];
    const followUpLabels = [];
    // เพิ่ม #[IMAGE:...] token สำหรับแต่ละรูป
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const labelSource =
        typeof image.label === "string" && image.label.trim()
          ? image.label.trim()
          : image.fileName || image.alt || `รูปที่ ${i + 1}`;
      combinedMessage += `#[IMAGE:${labelSource}]`;
      if (i < images.length - 1) {
        combinedMessage += "[cut]";
      }
      followUpLabels.push(labelSource);
      followUpAssets.push({
        ...image,
        label: labelSource,
      });
    }


    // สร้าง assetsMap จากรูปภาพที่มี
    const assetsMap = buildAssetsLookup(
      followUpAssets.map((asset) => ({
        ...asset,
        thumbUrl: asset.previewUrl || asset.thumbUrl || asset.url,
        fileName: asset.fileName || "",
      })),
    );


    // ใช้ sendFacebookMessage ที่มี upload/url mode และ fallback
    await sendFacebookMessage(
      task.userId,
      combinedMessage,
      fbBot.accessToken,
      {
        metadata,
        selectedImageCollections: null, // ไม่ใช้ collections แต่ใช้ assetsMap ที่สร้างเอง
      },
      assetsMap,
    );

  } else {
    await sendLineFollowUpMessage(task.userId, message, task.botId, db, images);
  }

  const historyColl = db.collection("chat_history");
  const timestamp = new Date();
  const historyParts = [];
  if (message) {
    historyParts.push({ type: "text", text: message });
  }
  images.forEach((image) => {
    historyParts.push({
      type: "image",
      url: image.url,
      previewUrl: image.previewUrl || image.thumbUrl || image.url,
      alt: image.alt || "",
      caption: image.caption || "",
    });
  });

  let storedContent = "";
  if (historyParts.length === 1 && historyParts[0].type === "text") {
    storedContent = historyParts[0].text;
  } else if (historyParts.length > 0) {
    storedContent = JSON.stringify(historyParts);
  }

  const messageDoc = {
    senderId: task.userId,
    role: "assistant",
    content: storedContent,
    timestamp,
    platform: task.platform || "line",
    botId: task.botId || null,
    source: "follow_up",
  };
  const historyInsertResult = await historyColl.insertOne(messageDoc);
  if (historyInsertResult?.insertedId) {
    messageDoc._id = historyInsertResult.insertedId;
  }

  try {
    if (io) {
      io.emit("newMessage", {
        userId: task.userId,
        message: messageDoc,
        sender: "assistant",
        timestamp,
      });
    }
  } catch (_) { }
}

async function sendLineFollowUpMessage(
  userId,
  message,
  botId,
  db,
  images = [],
) {
  try {
    console.log(`[FollowUp] LINE: ${userId}, msg:${!!message}, imgs:${Array.isArray(images) ? images.length : 0}`);

    const payloads = [];
    const normalizedMessage = normalizeOutgoingText(message);
    const trimmed =
      typeof normalizedMessage === "string" ? normalizedMessage.trim() : "";
    if (trimmed) {
      payloads.push({ type: "text", text: trimmed });
    }
    const media = sanitizeFollowUpImages(images);

    media.forEach((image) => {
      payloads.push({
        type: "image",
        originalContentUrl: image.url,
        previewImageUrl: image.previewUrl || image.thumbUrl || image.url,
      });
    });

    if (!payloads.length) {
      throw new Error("ไม่มีเนื้อหาสำหรับการติดตาม");
    }


    const chunks = [];
    for (let i = 0; i < payloads.length; i += 5) {
      chunks.push(payloads.slice(i, i + 5));
    }

    const sendChunks = async (client) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        await client.pushMessage(userId, chunk.length === 1 ? chunk[0] : chunk);
      }
    };

    if (botId) {
      const query = ObjectId.isValid(botId)
        ? { _id: new ObjectId(botId) }
        : { _id: botId };
      const botDoc = await db.collection("line_bots").findOne(query);
      if (!botDoc || !botDoc.channelAccessToken || !botDoc.channelSecret) {
        throw new Error("ไม่พบข้อมูล Line Bot สำหรับการส่งข้อความ");
      }
      const client = createLineClient(
        botDoc.channelAccessToken,
        botDoc.channelSecret,
      );
      await sendChunks(client);
      return;
    }
    if (!lineClient) {
      throw new Error("Line Client ยังไม่ถูกตั้งค่า");
    }
    await sendChunks(lineClient);
  } catch (error) {
    console.error("[FollowUp Error] Failed to send LINE message:", {
      error: error.message,
      userId,
      botId,
    });
    throw new Error(error.message || "ไม่สามารถส่งข้อความผ่าน LINE ได้");
  }
}

function startFollowUpTaskWorker() {
  if (followUpTaskTimer) return;
  const runner = async () => {
    try {
      await processDueFollowUpTasks();
    } catch (error) {
      console.error("[FollowUp] งานประมวลผลติดตามล้มเหลว:", error.message);
    }
  };
  followUpTaskTimer = setInterval(runner, FOLLOW_UP_TASK_INTERVAL_MS);
  console.log(
    `[FollowUp] Worker เริ่มทำงาน (interval ${FOLLOW_UP_TASK_INTERVAL_MS / 1000}s)`,
  );
  runner();
}

function sanitizeContentForFollowUp(rawContent) {
  if (rawContent === null || typeof rawContent === "undefined") {
    return "";
  }

  const asString =
    typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  const trimmed = asString.trim();
  if (!trimmed) return "";

  // พยายามแปลง JSON เป็นข้อความที่อ่านง่าย
  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      const parts = parsed
        .map((item) => {
          if (item && item.data) {
            if (item.data.type === "text" && item.data.text) {
              return String(item.data.text).trim();
            }
            if (item.data.type === "image") {
              const label = item.data.text
                ? String(item.data.text).trim()
                : "ลูกค้าส่งรูปภาพ";
              return `[รูปภาพ] ${label}`;
            }
            if (item.data.type === "audio") {
              const label = item.data.text
                ? String(item.data.text).trim()
                : "ลูกค้าส่งไฟล์เสียง";
              return `[เสียง] ${label}`;
            }
          }
          if (typeof item === "string") return item.trim();
          return "";
        })
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join(" ").trim();
      }
    } else if (parsed && typeof parsed === "object") {
      if (parsed.type === "text" && parsed.text) {
        return String(parsed.text).trim();
      }
      if (parsed.type === "image") {
        const label = parsed.text
          ? String(parsed.text).trim()
          : "ลูกค้าส่งรูปภาพ";
        return `[รูปภาพ] ${label}`;
      }
      if (parsed.type === "audio") {
        const label = parsed.description
          ? String(parsed.description).trim()
          : "ลูกค้าส่งไฟล์เสียง";
        return `[เสียง] ${label}`;
      }
    }
  } catch (_) {
    // ถ้าไม่สามารถ parse ได้ให้ใช้ข้อความเดิม
  }

  // จำกัดความยาวเพื่อไม่ให้ prompt ยาวเกินไป
  if (trimmed.length > 800) {
    return `${trimmed.slice(0, 790)}…`;
  }
  return trimmed;
}

async function getFollowUpStatus(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_status");
  return coll.findOne({ senderId: userId });
}

async function updateFollowUpStatus(userId, fields) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_status");
  const now = new Date();
  const sanitizedFields = { ...(fields || {}) };
  const normalizedPlatform = sanitizedFields.platform || null;
  const normalizedBotId = normalizeFollowUpBotId(sanitizedFields.botId);

  sanitizedFields.platform = normalizedPlatform;
  sanitizedFields.botId = normalizedBotId;

  const updateDoc = {
    $set: {
      senderId: userId,
      lastAnalyzedAt: now,
      ...sanitizedFields,
    },
  };
  await coll.updateOne({ senderId: userId }, updateDoc, { upsert: true });
}

async function maybeAnalyzeFollowUp(
  userId,
  platform = "line",
  botId = null,
  options = {},
) {
  try {
    const normalizedPlatform = platform || "line";
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const config = await getFollowUpConfigForContext(
      normalizedPlatform,
      normalizedBotId,
    );
    const {
      reasonOverride,
      followUpUpdatedAt: providedTimestamp,
      forceUpdate = false,
    } = options || {};

    if (!config || (!forceUpdate && !config.analysisEnabled)) {
      return;
    }

    const status = await getFollowUpStatus(userId);
    const payloadBase = {
      platform: normalizedPlatform,
      botId: normalizedBotId,
    };

    const existingOrders = await getUserOrders(userId);
    const latestOrder =
      existingOrders && existingOrders.length > 0 ? existingOrders[0] : null;
    const hasOrders = !!latestOrder;

    if (!hasOrders) {
      // ⚠️ สำคัญ: ถ้า status.hasFollowUp เป็น true อยู่แล้ว (ลูกค้าเคยซื้อ/ถูก mark แล้ว)
      // จะไม่ reset เป็น false เพื่อป้องกัน:
      // 1. Race condition ระหว่างการวิเคราะห์หลายข้อความพร้อมกัน
      // 2. การส่ง follow-up ไปหาลูกค้าที่ซื้อแล้วโดยไม่ตั้งใจ
      // 3. กรณี order ถูกลบ แต่ยังไม่ต้องการให้ระบบส่ง follow-up อีก
      if (status?.hasFollowUp === true) {
        console.log(
          `[FollowUp] ข้าม reset hasFollowUp สำหรับ ${userId} - เคยถูก mark ว่าซื้อแล้ว`,
        );
        return;
      }

      const previousUpdatedAt = status?.followUpUpdatedAt || null;
      await updateFollowUpStatus(userId, {
        hasFollowUp: false,
        followUpReason: "",
        followUpUpdatedAt: previousUpdatedAt,
        ...payloadBase,
      });
      return;
    }

    const reasonCandidates = [
      typeof reasonOverride === "string" ? reasonOverride.trim() : "",
      typeof latestOrder.notes === "string" ? latestOrder.notes.trim() : "",
    ].filter(Boolean);

    const reason =
      reasonCandidates.length > 0 ? reasonCandidates[0] : "ลูกค้ามีออเดอร์แล้ว";

    const followUpUpdatedAt = (() => {
      if (providedTimestamp) {
        return new Date(providedTimestamp);
      }
      if (latestOrder.extractedAt) {
        return new Date(latestOrder.extractedAt);
      }
      return new Date();
    })();

    await updateFollowUpStatus(userId, {
      hasFollowUp: true,
      followUpReason: reason,
      followUpUpdatedAt,
      ...payloadBase,
    });

    await cancelFollowUpTasksForUser(
      userId,
      normalizedPlatform,
      normalizedBotId,
      { reason: "order_detected" },
    );

    try {
      if (io) {
        io.emit("followUpTagged", {
          userId,
          hasFollowUp: true,
          followUpReason: reason,
          followUpUpdatedAt,
          platform: normalizedPlatform,
          botId: normalizedBotId,
        });
      }
    } catch (_) { }
  } catch (error) {
    console.error("[FollowUp] วิเคราะห์ไม่สำเร็จ:", error.message);
  }
}

// ============================ Order Analysis Functions ============================

function normalizeShippingCostValue(rawCost) {
  if (typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0) {
    return rawCost;
  }
  if (typeof rawCost === "string") {
    const parsed = parseFloat(
      rawCost.replace(/[^\d.,-]/g, "").replace(/,/g, ""),
    );
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function normalizeCustomerName(rawName) {
  if (typeof rawName !== "string") {
    return null;
  }
  const trimmed = rawName.trim();
  return trimmed.length ? trimmed : null;
}

function sanitizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizeOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(
      value.replace(/[^\d.,-]/g, "").replace(/,/g, ""),
    );
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeOrderAddress(orderData = {}) {
  const addressSource =
    orderData.shippingAddress ||
    orderData.address ||
    orderData.deliveryAddress ||
    orderData.recipientAddress ||
    null;

  let fullAddress = "";
  if (typeof addressSource === "string") {
    fullAddress = addressSource.trim();
  } else if (addressSource && typeof addressSource === "object") {
    const addressParts = [
      addressSource.line1 || addressSource.addressLine1,
      addressSource.line2 || addressSource.addressLine2,
      addressSource.name,
    ].filter(Boolean);
    fullAddress = addressParts.join(" ").trim();
  }

  const subDistrict =
    sanitizeOptionalString(
      orderData.addressSubDistrict ||
      orderData.shippingSubDistrict ||
      orderData.subDistrict ||
      orderData.subdistrict ||
      orderData.tambon ||
      (addressSource && typeof addressSource === "object"
        ? addressSource.subDistrict ||
        addressSource.subdistrict ||
        addressSource.tambon
        : null),
    ) || null;

  const district =
    sanitizeOptionalString(
      orderData.addressDistrict ||
      orderData.shippingDistrict ||
      orderData.district ||
      orderData.amphoe ||
      (addressSource && typeof addressSource === "object"
        ? addressSource.district || addressSource.amphoe
        : null),
    ) || null;

  const province =
    sanitizeOptionalString(
      orderData.addressProvince ||
      orderData.shippingProvince ||
      orderData.province ||
      orderData.state ||
      (addressSource && typeof addressSource === "object"
        ? addressSource.city ||
        addressSource.province ||
        addressSource.state
        : null),
    ) || null;

  const postalCode =
    sanitizeOptionalString(
      orderData.addressPostalCode ||
      orderData.postalCode ||
      orderData.zip ||
      orderData.zipCode ||
      (addressSource && typeof addressSource === "object"
        ? addressSource.postalCode ||
        addressSource.zip ||
        addressSource.zipCode
        : null),
    ) || null;

  return {
    fullAddress,
    subDistrict,
    district,
    province,
    postalCode,
  };
}

const ORDER_EXTRACTION_MODES = Object.freeze({
  REALTIME: "realtime",
  SCHEDULED: "scheduled",
});

const ORDER_REQUIRED_FIELDS_DEFAULT = Object.freeze({
  items: true,
  customerName: false,
  phone: false,
  address: false,
  paymentMethod: false,
});

const ORDER_REQUIRED_FIELD_LABELS = Object.freeze({
  items: "รายการสินค้าอย่างน้อย 1 รายการ",
  customerName: "ชื่อผู้สั่ง/ผู้รับ",
  phone: "เบอร์โทรศัพท์",
  address: "ที่อยู่จัดส่ง",
  paymentMethod: "วิธีชำระเงิน",
});

function normalizeOrderRequiredFields(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const toBool = (value) => parseOptionalBoolean(value) === true;
  return {
    items: true,
    customerName: toBool(source.customerName),
    phone: toBool(source.phone),
    address: toBool(source.address),
    paymentMethod: toBool(source.paymentMethod),
  };
}

async function getOrderRequiredFieldsSetting() {
  const raw = await getSettingValue(
    "orderRequiredFields",
    ORDER_REQUIRED_FIELDS_DEFAULT,
  );
  return normalizeOrderRequiredFields(raw);
}

function listOrderRequiredFieldLabels(requiredFields) {
  const normalized = normalizeOrderRequiredFields(requiredFields);
  return Object.keys(ORDER_REQUIRED_FIELD_LABELS)
    .filter((key) => normalized[key])
    .map((key) => ORDER_REQUIRED_FIELD_LABELS[key]);
}

function formatOrderRequirementText(requiredFields) {
  const labels = listOrderRequiredFieldLabels(requiredFields);
  if (!labels.length) {
    return "เงื่อนไขขั้นต่ำของออเดอร์: รายการสินค้าอย่างน้อย 1 รายการ";
  }
  return `เงื่อนไขขั้นต่ำของออเดอร์: ต้องมี ${labels.join(", ")}`;
}

function formatMissingOrderFields(missingFields = []) {
  if (!Array.isArray(missingFields) || missingFields.length === 0) {
    return "";
  }
  return missingFields
    .map((field) => ORDER_REQUIRED_FIELD_LABELS[field] || field)
    .join(", ");
}

function orderHasCustomerName(orderData = {}) {
  const data = orderData && typeof orderData === "object" ? orderData : {};
  const customerName = normalizeCustomerName(data.customerName);
  const recipientName = normalizeCustomerName(data.recipientName);
  return Boolean(customerName || recipientName);
}

function orderHasPhone(orderData = {}) {
  const data = orderData && typeof orderData === "object" ? orderData : {};
  const phone = sanitizeOptionalString(
    data.phone ||
    data.mobile ||
    data.customerPhone ||
    data.shippingPhone,
  );
  return Boolean(phone);
}

function orderHasAddress(orderData = {}) {
  const data = orderData && typeof orderData === "object" ? orderData : {};
  const addressInfo = normalizeOrderAddress(data);
  return Boolean(
    addressInfo.fullAddress ||
    addressInfo.subDistrict ||
    addressInfo.district ||
    addressInfo.province ||
    addressInfo.postalCode,
  );
}

function orderHasPaymentMethod(orderData = {}) {
  const data = orderData && typeof orderData === "object" ? orderData : {};
  const paymentMethod = sanitizeOptionalString(
    data.paymentMethod || data.paymentType,
  );
  return Boolean(paymentMethod);
}

function validateOrderRequirements(orderData = {}, requiredFields = null) {
  const data = orderData && typeof orderData === "object" ? orderData : {};
  const required = normalizeOrderRequiredFields(requiredFields);
  const missing = [];

  if (required.items) {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) missing.push("items");
  }
  if (required.customerName && !orderHasCustomerName(data)) {
    missing.push("customerName");
  }
  if (required.phone && !orderHasPhone(data)) {
    missing.push("phone");
  }
  if (required.address && !orderHasAddress(data)) {
    missing.push("address");
  }
  if (required.paymentMethod && !orderHasPaymentMethod(data)) {
    missing.push("paymentMethod");
  }

  return { ok: missing.length === 0, missing };
}

const ORDER_STATUS_VALUES = new Set([
  "pending",
  "confirmed",
  "shipped",
  "completed",
  "cancelled",
]);

function normalizeOrderStatus(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ORDER_STATUS_VALUES.has(normalized) ? normalized : null;
}

function sanitizeOrderNotes(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 1000);
}

function normalizeOrderItemsInput(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];
  const normalized = [];

  rawItems.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const product = sanitizeOptionalString(
      item.product || item.name || item.title || item.itemName,
    );
    const quantity = sanitizeOptionalNumber(
      item.quantity ?? item.qty,
    );
    const price = sanitizeOptionalNumber(
      item.price ?? item.unitPrice ?? item.amount,
    );

    if (!product) return;
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(price) || price < 0) return;

    const normalizedItem = {
      product,
      quantity,
      price,
    };

    const shippingName = sanitizeOptionalString(
      item.shippingName || item.shippingProductName || item.productForShipping,
    );
    const color = sanitizeOptionalString(item.color);
    const width = sanitizeOptionalNumber(
      item.width ?? item.widthCm ?? item.itemWidth,
    );
    const length = sanitizeOptionalNumber(
      item.length ?? item.lengthCm ?? item.itemLength,
    );
    const height = sanitizeOptionalNumber(
      item.height ?? item.heightCm ?? item.itemHeight,
    );
    const weight = sanitizeOptionalNumber(item.weight ?? item.weightKg);

    if (shippingName) normalizedItem.shippingName = shippingName;
    if (color) normalizedItem.color = color;
    if (width !== null) normalizedItem.width = width;
    if (length !== null) normalizedItem.length = length;
    if (height !== null) normalizedItem.height = height;
    if (weight !== null) normalizedItem.weight = weight;

    normalized.push(normalizedItem);
  });

  return normalized;
}

function buildOrderDataForTool(rawData = {}, requiredFields = null) {
  if (!rawData || typeof rawData !== "object") {
    return { ok: false, error: "ข้อมูลออเดอร์ไม่ถูกต้อง" };
  }

  const normalizedRequiredFields = normalizeOrderRequiredFields(requiredFields);
  const items = normalizeOrderItemsInput(rawData.items);
  if (!items.length) {
    return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" };
  }

  let totalAmount = sanitizeOptionalNumber(rawData.totalAmount);
  const calculatedFromItems = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );

  // ใช้ totalAmount จาก AI เป็นหลัก (สำหรับโปรโมชั่น)
  // ถ้า AI ไม่ส่ง totalAmount มา ให้คำนวณจาก items
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    totalAmount = calculatedFromItems;
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { ok: false, error: "ยอดรวมไม่ถูกต้อง" };
  }

  const shippingCost = normalizeShippingCostValue(rawData.shippingCost);
  const customerName = normalizeCustomerName(rawData.customerName);
  const recipientName =
    normalizeCustomerName(
      rawData.recipientName ||
      rawData.shippingName ||
      rawData.receiverName ||
      customerName,
    ) || customerName;
  const shippingAddress = sanitizeOptionalString(
    rawData.shippingAddress ||
    rawData.address ||
    rawData.deliveryAddress ||
    rawData.recipientAddress,
  );
  const addressParts = normalizeOrderAddress({
    ...(rawData || {}),
    shippingAddress: shippingAddress || rawData.shippingAddress,
  });
  const phone = sanitizeOptionalString(rawData.phone || rawData.mobile);
  const email = sanitizeOptionalString(rawData.email || rawData.customerEmail);
  const paymentMethod =
    sanitizeOptionalString(rawData.paymentMethod) ||
    (normalizedRequiredFields.paymentMethod ? null : "เก็บเงินปลายทาง");
  const transferDate = sanitizeOptionalString(
    rawData.transferDate || rawData.paymentDate,
  );
  const transferTime = sanitizeOptionalString(
    rawData.transferTime || rawData.paymentTime,
  );
  const paymentReceiver = sanitizeOptionalString(
    rawData.paymentReceiver || rawData.receivedBy,
  );
  const orderNotes = sanitizeOptionalString(rawData.notes);

  const normalized = {
    items,
    totalAmount,
    shippingCost,
  };

  if (shippingAddress) normalized.shippingAddress = shippingAddress;
  if (customerName) normalized.customerName = customerName;
  if (recipientName) normalized.recipientName = recipientName;
  if (phone) normalized.phone = phone;
  if (email) normalized.email = email;
  if (addressParts.subDistrict) {
    normalized.addressSubDistrict = addressParts.subDistrict;
  }
  if (addressParts.district) {
    normalized.addressDistrict = addressParts.district;
  }
  if (addressParts.province) {
    normalized.addressProvince = addressParts.province;
  }
  if (addressParts.postalCode) {
    normalized.addressPostalCode = addressParts.postalCode;
  }
  if (transferDate) normalized.transferDate = transferDate;
  if (transferTime) normalized.transferTime = transferTime;
  if (paymentReceiver) normalized.paymentReceiver = paymentReceiver;
  if (paymentMethod) normalized.paymentMethod = paymentMethod;
  if (orderNotes) normalized.notes = orderNotes;

  return { ok: true, orderData: normalized };
}

function buildOrderDataPatch(rawData = {}) {
  if (!rawData || typeof rawData !== "object") {
    return { ok: false, error: "ข้อมูลออเดอร์ไม่ถูกต้อง" };
  }

  const patch = {};
  const hasItems = Object.prototype.hasOwnProperty.call(rawData, "items");
  const hasTotalAmount = Object.prototype.hasOwnProperty.call(
    rawData,
    "totalAmount",
  );

  if (hasItems) {
    const items = normalizeOrderItemsInput(rawData.items);
    if (!items.length) {
      return { ok: false, error: "รายการสินค้าไม่ถูกต้อง" };
    }
    patch.items = items;
  }

  if (hasTotalAmount) {
    const totalAmount = sanitizeOptionalNumber(rawData.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return { ok: false, error: "ยอดรวมไม่ถูกต้อง" };
    }
    patch.totalAmount = totalAmount;
  } else if (hasItems) {
    patch.totalAmount = patch.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );
  }

  if (Object.prototype.hasOwnProperty.call(rawData, "shippingCost")) {
    patch.shippingCost = normalizeShippingCostValue(rawData.shippingCost);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "customerName")) {
    patch.customerName = normalizeCustomerName(rawData.customerName);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "recipientName")) {
    patch.recipientName = normalizeCustomerName(rawData.recipientName);
  }

  const hasShippingAddress = Object.prototype.hasOwnProperty.call(
    rawData,
    "shippingAddress",
  );
  const hasAddress = Object.prototype.hasOwnProperty.call(rawData, "address");
  const hasDeliveryAddress = Object.prototype.hasOwnProperty.call(
    rawData,
    "deliveryAddress",
  );
  const hasRecipientAddress = Object.prototype.hasOwnProperty.call(
    rawData,
    "recipientAddress",
  );

  if (hasShippingAddress || hasAddress || hasDeliveryAddress || hasRecipientAddress) {
    const shippingAddress = sanitizeOptionalString(
      rawData.shippingAddress ||
      rawData.address ||
      rawData.deliveryAddress ||
      rawData.recipientAddress,
    );
    patch.shippingAddress = shippingAddress || null;
    const addressParts = normalizeOrderAddress({
      ...(rawData || {}),
      shippingAddress: shippingAddress || rawData.shippingAddress,
    });
    patch.addressSubDistrict = addressParts.subDistrict || null;
    patch.addressDistrict = addressParts.district || null;
    patch.addressProvince = addressParts.province || null;
    patch.addressPostalCode = addressParts.postalCode || null;
  }

  if (Object.prototype.hasOwnProperty.call(rawData, "addressSubDistrict")) {
    patch.addressSubDistrict = sanitizeOptionalString(rawData.addressSubDistrict);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "addressDistrict")) {
    patch.addressDistrict = sanitizeOptionalString(rawData.addressDistrict);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "addressProvince")) {
    patch.addressProvince = sanitizeOptionalString(rawData.addressProvince);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "addressPostalCode")) {
    patch.addressPostalCode = sanitizeOptionalString(rawData.addressPostalCode);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "phone")) {
    patch.phone = sanitizeOptionalString(rawData.phone);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "email")) {
    patch.email = sanitizeOptionalString(rawData.email);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "paymentMethod")) {
    const paymentMethod = sanitizeOptionalString(rawData.paymentMethod);
    patch.paymentMethod = paymentMethod || null;
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "transferDate")) {
    patch.transferDate = sanitizeOptionalString(rawData.transferDate);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "transferTime")) {
    patch.transferTime = sanitizeOptionalString(rawData.transferTime);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "paymentReceiver")) {
    patch.paymentReceiver = sanitizeOptionalString(rawData.paymentReceiver);
  }
  if (Object.prototype.hasOwnProperty.call(rawData, "notes")) {
    patch.notes = sanitizeOptionalString(rawData.notes);
  }

  return { ok: true, patch, hasChanges: Object.keys(patch).length > 0 };
}

// ============================ Order Buffer & Cutoff Helpers ============================

const ORDER_BUFFER_COLLECTION = "order_extraction_buffers";


function normalizeAiConfig(raw = {}) {
  const allowedModes = ["responses", "chat"];
  const parseNum = (val) => {
    if (val === undefined || val === null || val === "") return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const apiMode = allowedModes.includes(raw.apiMode) ? raw.apiMode : "responses";
  const cfg = {
    apiMode,
    reasoningEffort: "",
    temperature: null,
    topP: null,
    presencePenalty: null,
    frequencyPenalty: null,
  };

  if (apiMode === "responses") {
    const effort =
      raw.reasoningEffort ||
      raw.reasoning_effort ||
      (raw.reasoning && raw.reasoning.effort);
    cfg.reasoningEffort = effort || "";
  } else {
    cfg.temperature = parseNum(raw.temperature);
    cfg.topP = parseNum(raw.topP ?? raw.top_p);
    cfg.presencePenalty = parseNum(
      raw.presencePenalty ?? raw.presence_penalty,
    );
    cfg.frequencyPenalty = parseNum(
      raw.frequencyPenalty ?? raw.frequency_penalty,
    );
  }

  return cfg;
}

function normalizeOrderPlatform(platform) {
  if (typeof platform !== "string") return "line";
  const normalized = platform.toLowerCase();
  if (["facebook", "line"].includes(normalized)) {
    return normalized;
  }
  return "line";
}

function normalizeOrderBotId(botId) {
  if (!botId) return null;
  if (typeof botId === "string") {
    const trimmed = botId.trim();
    return trimmed.length ? trimmed : null;
  }
  try {
    const str = botId.toString();
    return str.length ? str : null;
  } catch {
    return null;
  }
}

function buildOrderPageKey(platform, botId = null) {
  const normalizedPlatform = normalizeOrderPlatform(platform);
  const normalizedBotId = normalizeOrderBotId(botId);
  return normalizedBotId
    ? `${normalizedPlatform}:${normalizedBotId}`
    : `${normalizedPlatform}:default`;
}

function parseOrderPageKey(pageKey) {
  if (typeof pageKey !== "string" || !pageKey.includes(":")) {
    return { platform: null, botId: null };
  }
  const [platformPart, ...rest] = pageKey.split(":");
  const botIdPart = rest.join(":");
  const platform = normalizeOrderPlatform(platformPart);
  const botId =
    botIdPart && botIdPart !== "default"
      ? normalizeOrderBotId(botIdPart)
      : null;
  return { platform, botId };
}



async function ensureOrderBufferIndexes() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const bufferColl = db.collection(ORDER_BUFFER_COLLECTION);

    await bufferColl.createIndex({ pageKey: 1, userId: 1, timestamp: 1 });
    await bufferColl.createIndex({ pageKey: 1, timestamp: 1 });
    await bufferColl.createIndex({ chatMessageId: 1 }, { sparse: true });
  } catch (error) {
    console.error("[OrderBuffer] ไม่สามารถสร้างดัชนีได้:", error.message);
  }
}

async function markMessagesAsOrderExtracted(
  userId,
  messageIds,
  extractionRoundId,
  orderId = null,
) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return;
  }

  const objectIds = messageIds
    .map((id) => {
      if (!id) return null;
      try {
        return new ObjectId(id);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);

  if (!objectIds.length) {
    return;
  }

  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    const updateDoc = {
      orderExtractionRoundId: extractionRoundId,
      orderExtractionMarkedAt: new Date(),
    };

    if (orderId) {
      try {
        updateDoc.orderId =
          typeof orderId === "string" ? new ObjectId(orderId) : orderId;
      } catch (error) {
        updateDoc.orderId = orderId;
      }
    }

    const match = buildChatHistoryUserQuery(userId, {
      _id: { $in: objectIds },
    });
    await coll.updateMany(match, { $set: updateDoc });
  } catch (error) {
    console.error(
      "[Order] ไม่สามารถมาร์กข้อความที่สกัดแล้วได้:",
      error.message,
    );
  }
}

function buildOrderQuery(params = {}) {
  const query = {};
  const pageKeyParam = params.pageKey;
  let platformFilter = params.platform;
  let botIdFilter = params.botId;

  if (pageKeyParam && pageKeyParam !== "all") {
    const parsed = parseOrderPageKey(pageKeyParam);
    if (parsed.platform) {
      platformFilter = parsed.platform;
    }
    if (parsed.botId || parsed.botId === null) {
      botIdFilter = parsed.botId === null ? "default" : parsed.botId;
    }
  }

  if (platformFilter && platformFilter !== "all") {
    query.platform = normalizeOrderPlatform(platformFilter);
  }

  if (
    typeof botIdFilter === "string" &&
    botIdFilter.length > 0 &&
    botIdFilter !== "all"
  ) {
    if (botIdFilter === "default") {
      const defaultConditions = [
        { botId: null },
        { botId: { $exists: false } },
        { botId: "" },
      ];
      if (!query.$or) {
        query.$or = defaultConditions;
      } else {
        query.$or.push(...defaultConditions);
      }
    } else {
      query.botId = normalizeOrderBotId(botIdFilter);
    }
  }

  const selectedIdsParam = params.selectedIds;
  if (selectedIdsParam) {
    const selectedIds = String(selectedIdsParam)
      .split(",")
      .map((id) => id.trim())
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    if (selectedIds.length) {
      query._id = { $in: selectedIds };
    }
  }

  const status = params.status;
  if (status && status !== "all") {
    query.status = status;
  }

  const timezone = "Asia/Bangkok";
  let startMoment = null;
  let endMoment = null;

  if (params.todayOnly === "true") {
    startMoment = moment().tz(timezone).startOf("day");
    endMoment = moment().tz(timezone).endOf("day");
  } else {
    if (params.startDate) {
      const parsedStart = moment.tz(params.startDate, timezone);
      if (parsedStart.isValid()) {
        startMoment = parsedStart.startOf("day");
      }
    }
    if (params.endDate) {
      const parsedEnd = moment.tz(params.endDate, timezone);
      if (parsedEnd.isValid()) {
        endMoment = parsedEnd.endOf("day");
      }
    }
  }

  if (startMoment || endMoment) {
    query.extractedAt = {};
    if (startMoment) query.extractedAt.$gte = startMoment.toDate();
    if (endMoment) query.extractedAt.$lte = endMoment.toDate();
  }

  return { query, dateRange: { start: startMoment, end: endMoment } };
}

/**
 * ดึงรายการชื่อสินค้าที่เคยสกัดไว้ในระบบ (unique, เรียงตามความถี่)
 * ใช้สำหรับ AI Prompt Enhancement - ให้ AI match ชื่อสินค้ากับที่มีอยู่แล้ว
 */
async function getExistingProductNames(options = {}) {
  const { platform = null, botId = null, limit = 50 } = options || {};

  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    // Build query based on platform/botId
    const matchQuery = {};
    if (platform) matchQuery.platform = platform;
    if (botId) matchQuery.botId = botId;

    // Aggregate to get unique product names with count
    const pipeline = [
      { $match: matchQuery },
      { $unwind: { path: "$orderData.items", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$orderData.items.product",
          count: { $sum: 1 },
          lastUsed: { $max: "$extractedAt" }
        }
      },
      { $match: { _id: { $ne: null, $ne: "", $type: "string" } } },
      { $sort: { count: -1, lastUsed: -1 } },
      { $limit: limit }
    ];

    const results = await db.collection("orders").aggregate(pipeline).toArray();

    // Return array of product names
    return results.map(r => r._id).filter(Boolean);
  } catch (error) {
    console.warn("[Order] ไม่สามารถดึงรายการสินค้าที่มีอยู่:", error.message);
    return [];
  }
}

async function analyzeOrderFromChat(userId, messages, options = {}) {
  if (!OPENAI_API_KEY) {
    console.warn("[Order] ไม่มี OPENAI_API_KEY ข้ามการวิเคราะห์ออเดอร์");
    return null;
  }

  const {
    modelOverride = null,
    previousAddress = null,
    previousCustomerName = null,
    platform = "line",
    botId = null,
  } = options || {};

  // Get page settings
  let pageSettings = null;
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    pageSettings = await db.collection("follow_up_page_settings").findOne({
      platform: platform || "line",
      botId: botId || null,
    });
  } catch (e) {
    console.warn("[Order] ไม่สามารถโหลด page settings:", e.message);
  }

  // Check if order extraction is enabled for this page
  if (pageSettings && pageSettings.orderExtractionEnabled === false) {
    console.log(`[Order] การสกัดออเดอร์ถูกปิดสำหรับ ${platform}/${botId}`);
    return null;
  }

  // Get orderModel from page settings if not overridden
  const orderModel = modelOverride || pageSettings?.orderModel || (await getSettingValue("orderModel", "gpt-4.1-nano"));

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // Use page-specific prompt if available, otherwise use default
  let promptBody;
  if (pageSettings?.orderPromptInstructions && pageSettings.orderPromptInstructions.trim()) {
    promptBody = pageSettings.orderPromptInstructions.trim();
  } else {
    promptBody = (await getOrderPromptBody(platform, botId)).trim();
  }
  const systemPrompt = `${promptBody}\n\n${ORDER_PROMPT_JSON_SUFFIX}`;

  // ดึงรายการสินค้าที่เคยสกัดไว้ในระบบ เพื่อให้ AI ใช้ชื่อเดียวกัน
  const existingProducts = await getExistingProductNames({ platform, botId, limit: 30 });

  // จัดรูปแบบการสนทนาให้อ่านง่าย เรียงจากเก่าไปใหม่
  const formattedConversation = messages
    .map((entry, index) => {
      const speaker = entry.role === "user" ? "ลูกค้า" : "เรา";
      const seq = index + 1;
      return `${seq}. ${speaker}: ${entry.content}`;
    })
    .join("\n");

  const previousContextLines = [];
  if (previousCustomerName) {
    previousContextLines.push(`- ชื่อลูกค้ารอบก่อน: ${previousCustomerName}`);
  }
  if (previousAddress) {
    previousContextLines.push(`- ที่อยู่รอบก่อน: ${previousAddress}`);
  }
  const previousContextText = previousContextLines.length
    ? `ข้อมูลจากออเดอร์ก่อนหน้า:\n${previousContextLines.join("\n")}\nหากลูกค้าไม่ได้ระบุชื่อหรือที่อยู่ใหม่ให้ใช้ข้อมูลก่อนหน้าเป็นค่าเริ่มต้น\n\n`
    : "";

  // สร้างส่วน Product Matching Hint สำหรับ AI
  let productMatchingHint = "";
  if (existingProducts.length > 0) {
    productMatchingHint = `📦 รายการสินค้าที่มีในระบบ (ให้ใช้ชื่อเหล่านี้ถ้าสินค้าตรงกัน):
${existingProducts.map((p, i) => `${i + 1}. "${p}"`).join("\n")}

⚠️ สำคัญ: หากสินค้าที่ลูกค้าสั่งตรงกับรายการด้านบน ให้ใช้ชื่อจากรายการด้านบนแทน
   ตัวอย่าง: ลูกค้าพิมพ์ "เสื้อทีเชิร์ตสีดำ" แต่ในรายการมี "เสื้อยืด - ดำ" → ให้ใช้ "เสื้อยืด - ดำ"
   หากเป็นสินค้าใหม่ที่ไม่มีในรายการ ให้ตั้งชื่อสินค้าใหม่ตามที่เหมาะสม\n\n`;
  }

  const userPrompt = `${productMatchingHint}${previousContextText}บทสนทนาทั้งหมด (จากเก่าสุดถึงใหม่สุด):\n\n${formattedConversation}\n\nวิเคราะห์และสกัดข้อมูลออเดอร์:`;

  try {
    const response = await openai.chat.completions.create({
      model: orderModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // ลดความสุ่มเพื่อความแม่นยำ
    });

    const content = response.choices?.[0]?.message?.content || "";
    const trimmed = content.trim();
    let parsed = null;

    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      // พยายามดึง JSON จากข้อความที่มีคำอื่นปะปน
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed || typeof parsed.hasOrder === "undefined") {
      console.warn("[Order] รูปแบบคำตอบไม่ถูกต้อง:", trimmed);
      return null;
    }

    // ตรวจสอบความถูกต้องของข้อมูล
    if (parsed.hasOrder && parsed.orderData) {
      const orderData = parsed.orderData || {};
      const {
        items,
        totalAmount,
        shippingAddress,
        phone,
        paymentMethod,
        shippingCost,
        customerName,
      } = orderData;

      // ตรวจสอบ items
      if (!Array.isArray(items) || items.length === 0) {
        console.warn("[Order] ไม่มีรายการสินค้า");
        return {
          hasOrder: false,
          orderData: null,
          confidence: 0,
          reason: "ไม่มีรายการสินค้า",
        };
      }

      // ตรวจสอบข้อมูลในแต่ละ item และทำความสะอาดข้อมูล
      const sanitizedItems = [];
      for (const item of items) {
        const productName =
          typeof item.product === "string" ? item.product.trim() : "";
        const quantityNumber = Number(item.quantity);
        const priceNumber = Number(item.price);
        const shippingName =
          sanitizeOptionalString(item.shippingName) ||
          sanitizeOptionalString(item.shippingProductName) ||
          sanitizeOptionalString(item.productForShipping) ||
          null;
        const color = sanitizeOptionalString(item.color) || null;
        const width = sanitizeOptionalNumber(
          item.width ?? item.widthCm ?? item.itemWidth,
        );
        const length = sanitizeOptionalNumber(
          item.length ?? item.lengthCm ?? item.itemLength,
        );
        const height = sanitizeOptionalNumber(
          item.height ?? item.heightCm ?? item.itemHeight,
        );
        const weight = sanitizeOptionalNumber(item.weight ?? item.weightKg);

        if (!productName) {
          console.warn("[Order] ชื่อสินค้าว่าง:", item);
          return {
            hasOrder: false,
            orderData: null,
            confidence: 0,
            reason: "ข้อมูลสินค้าไม่ครบถ้วน",
          };
        }

        if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
          console.warn("[Order] จำนวนสินค้าไม่ถูกต้อง:", item);
          return {
            hasOrder: false,
            orderData: null,
            confidence: 0,
            reason: "ข้อมูลสินค้าไม่ครบถ้วน",
          };
        }

        if (!Number.isFinite(priceNumber) || priceNumber < 0) {
          console.warn("[Order] ราคาสินค้าไม่ถูกต้อง:", item);
          return {
            hasOrder: false,
            orderData: null,
            confidence: 0,
            reason: "ข้อมูลสินค้าไม่ครบถ้วน",
          };
        }

        const sanitizedItem = {
          product: productName,
          quantity: quantityNumber,
          price: priceNumber,
        };

        if (shippingName) {
          sanitizedItem.shippingName = shippingName;
        }
        if (color) {
          sanitizedItem.color = color;
        }
        if (width !== null && width !== undefined) {
          sanitizedItem.width = width;
        }
        if (length !== null && length !== undefined) {
          sanitizedItem.length = length;
        }
        if (height !== null && height !== undefined) {
          sanitizedItem.height = height;
        }
        if (weight !== null && weight !== undefined) {
          sanitizedItem.weight = weight;
        }

        sanitizedItems.push(sanitizedItem);
      }

      // ต้องมีที่อยู่จัดส่ง
      if (
        !shippingAddress ||
        typeof shippingAddress !== "string" ||
        !shippingAddress.trim()
      ) {
        console.warn("[Order] ไม่มีที่อยู่จัดส่ง");
        return {
          hasOrder: false,
          orderData: null,
          confidence: 0,
          reason: "ไม่มีที่อยู่จัดส่ง",
        };
      }

      // คำนวณยอดรวมถ้าไม่ระบุ
      let calculatedTotal = totalAmount;
      if (!calculatedTotal || calculatedTotal <= 0) {
        calculatedTotal = sanitizedItems.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0,
        );
      }

      const normalizedShippingCost = normalizeShippingCostValue(shippingCost);
      const normalizedCustomerName = normalizeCustomerName(customerName);
      const sanitizedEmail =
        sanitizeOptionalString(orderData.email || orderData.customerEmail) ||
        null;
      const sanitizedRecipientName =
        normalizeCustomerName(
          orderData.recipientName || orderData.shippingName || customerName,
        ) || normalizedCustomerName;
      const addressParts = normalizeOrderAddress({
        ...(orderData || {}),
        shippingAddress,
      });
      const transferDate =
        sanitizeOptionalString(
          orderData.transferDate || orderData.paymentDate,
        ) || null;
      const transferTime =
        sanitizeOptionalString(
          orderData.transferTime || orderData.paymentTime,
        ) || null;
      const paymentReceiver =
        sanitizeOptionalString(
          orderData.paymentReceiver || orderData.receivedBy,
        ) || null;
      const sanitizedNotes = sanitizeOptionalString(orderData.notes) || null;
      const shippingAddressText =
        typeof shippingAddress === "string"
          ? shippingAddress.trim()
          : String(shippingAddress || "");
      const paymentMethodValue =
        sanitizeOptionalString(paymentMethod) || "เก็บเงินปลายทาง";
      const sanitizedPhone = sanitizeOptionalString(phone) || null;

      return {
        hasOrder: true,
        orderData: {
          items: sanitizedItems,
          totalAmount: calculatedTotal,
          shippingAddress: shippingAddressText,
          phone: sanitizedPhone,
          email: sanitizedEmail,
          paymentMethod: paymentMethodValue,
          shippingCost: normalizedShippingCost,
          customerName: normalizedCustomerName,
          recipientName: sanitizedRecipientName,
          addressSubDistrict: addressParts.subDistrict,
          addressDistrict: addressParts.district,
          addressProvince: addressParts.province,
          addressPostalCode: addressParts.postalCode,
          transferDate,
          transferTime,
          paymentReceiver,
          notes: sanitizedNotes,
        },
        confidence: parsed.confidence || 0.8,
        reason: parsed.reason || "พบออเดอร์ในบทสนทนา",
      };
    }

    return {
      hasOrder: false,
      orderData: null,
      confidence: parsed.confidence || 0.1,
      reason: parsed.reason || "ไม่พบออเดอร์ในบทสนทนา",
    };
  } catch (error) {
    console.error("[Order] เกิดข้อผิดพลาดในการเรียก OpenAI:", error.message);
    return null;
  }
}

async function saveOrderToDatabase(
  userId,
  platform,
  botId,
  orderData,
  extractedFrom = null,
  isManualExtraction = false,
  options = {},
) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const safeOptions =
      options && typeof options === "object" ? options : {};
    const status = normalizeOrderStatus(safeOptions.status) || "pending";
    const notes = sanitizeOrderNotes(safeOptions.notes);
    const extractedAt =
      safeOptions.extractedAt instanceof Date
        ? safeOptions.extractedAt
        : new Date();

    const normalizedOrderData = {
      ...(orderData || {}),
      shippingCost: normalizeShippingCostValue(orderData?.shippingCost),
      customerName: normalizeCustomerName(orderData?.customerName),
    };

    const orderDoc = {
      userId,
      platform: platform || "line",
      botId: botId || null,
      orderData: normalizedOrderData,
      status,
      extractedAt,
      extractedFrom,
      isManualExtraction,
      updatedAt: new Date(),
      notes,
      notificationStatus: safeOptions.notificationStatus || "pending",
    };

    const result = await coll.insertOne(orderDoc);
    console.log(`[Order] บันทึกออเดอร์สำเร็จ: ${result.insertedId}`);

    return result.insertedId;
  } catch (error) {
    console.error("[Order] บันทึกออเดอร์ไม่สำเร็จ:", error.message);
    return null;
  }
}

/**
 * ฟังก์ชันให้ AI ดู orders ที่มีอยู่แล้วของลูกค้า
 * เพื่อป้องกันการสร้าง order ซ้ำ
 */
async function getOrdersForTool(args = {}, context = {}) {
  const userId = context.userId;
  if (!userId) {
    return { success: false, error: "ไม่พบผู้ใช้", orders: [] };
  }

  try {
    const orders = await getUserOrders(userId);
    const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 10) : 5;
    const recentOrders = orders.slice(0, limit);

    // Format orders สำหรับ AI ให้อ่านง่าย
    const formattedOrders = recentOrders.map((order) => {
      const orderData = order.orderData || {};
      const items = Array.isArray(orderData.items) ? orderData.items : [];
      const itemsSummary = items.map((item) =>
        `${item.product || "สินค้า"} x${item.quantity || 1} (฿${item.price || 0})`
      ).join(", ");

      return {
        orderId: order._id?.toString() || null,
        status: order.status || "pending",
        createdAt: order.extractedAt || order.createdAt || null,
        totalAmount: orderData.totalAmount || null,
        shippingCost: orderData.shippingCost || 0,
        customerName: orderData.customerName || null,
        recipientName: orderData.recipientName || null,
        shippingAddress: orderData.shippingAddress || null,
        addressSubDistrict: orderData.addressSubDistrict || null,
        addressDistrict: orderData.addressDistrict || null,
        addressProvince: orderData.addressProvince || null,
        addressPostalCode: orderData.addressPostalCode || null,
        phone: orderData.phone || null,
        paymentMethod: orderData.paymentMethod || null,
        items: items,
        itemsSummary,
        notes: order.notes || null,
      };
    });

    return {
      success: true,
      totalOrders: orders.length,
      orders: formattedOrders,
      message: orders.length > 0
        ? `พบ ${orders.length} ออเดอร์ (แสดง ${formattedOrders.length} รายการล่าสุด)`
        : "ยังไม่มีออเดอร์ของลูกค้ารายนี้",
    };
  } catch (error) {
    console.error("[Order] ดึง orders สำหรับ AI tool ไม่สำเร็จ:", error.message);
    return { success: false, error: error.message, orders: [] };
  }
}

async function createOrderFromTool(args = {}, context = {}) {
  const userId = context.userId;

  if (!userId) {
    return { success: false, error: "ไม่พบผู้ใช้สำหรับสร้างออเดอร์" };
  }

  // ตรวจสอบ duplicate order: ดูว่ามี order ล่าสุดที่ใกล้เคียงหรือไม่
  try {
    const existingOrders = await getUserOrders(userId);
    if (existingOrders && existingOrders.length > 0) {
      const latestOrder = existingOrders[0];
      const latestOrderData = latestOrder.orderData || {};
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const orderCreatedAt = latestOrder.extractedAt || latestOrder.createdAt;

      // ตรวจสอบว่า order ล่าสุดถูกสร้างภายใน 1 ชั่วโมง
      if (orderCreatedAt && new Date(orderCreatedAt) > oneHourAgo) {
        const newItems = args.orderData?.items || [];
        const existingItems = latestOrderData.items || [];

        // เปรียบเทียบ items คร่าวๆ
        const newItemsSummary = newItems
          .map((i) => `${i.product}:${i.quantity}`)
          .sort()
          .join("|");
        const existingItemsSummary = existingItems
          .map((i) => `${i.product}:${i.quantity}`)
          .sort()
          .join("|");

        if (newItemsSummary === existingItemsSummary && newItemsSummary.length > 0) {
          return {
            success: false,
            error: `พบออเดอร์ที่มีรายการสินค้าเหมือนกันอยู่แล้ว (ID: ${latestOrder._id?.toString()}) สร้างเมื่อ ${new Date(orderCreatedAt).toLocaleString("th-TH")}. กรุณาใช้ update_order แทน หากต้องการแก้ไข`,
            existingOrderId: latestOrder._id?.toString(),
            existingOrder: {
              status: latestOrder.status,
              items: existingItems,
              totalAmount: latestOrderData.totalAmount,
              customerName: latestOrderData.customerName,
              shippingAddress: latestOrderData.shippingAddress,
            },
          };
        }
      }
    }
  } catch (dupCheckErr) {
    console.warn(
      "[Order] ตรวจสอบ duplicate order ไม่สำเร็จ (ดำเนินการต่อ):",
      dupCheckErr.message,
    );
  }

  const requiredFields = await getOrderRequiredFieldsSetting();
  const orderDataPayload =
    args && typeof args.orderData === "object" ? args.orderData : null;
  if (!orderDataPayload) {
    return { success: false, error: "orderData จำเป็น" };
  }

  const normalized = buildOrderDataForTool(orderDataPayload, requiredFields);
  if (!normalized.ok) {
    return { success: false, error: normalized.error };
  }

  const requirementCheck = validateOrderRequirements(
    normalized.orderData,
    requiredFields,
  );
  if (!requirementCheck.ok) {
    return {
      success: false,
      error: `ข้อมูลออเดอร์ยังไม่ครบ: ${formatMissingOrderFields(
        requirementCheck.missing,
      )}`,
      missingFields: requirementCheck.missing,
    };
  }

  const platform = normalizeOrderPlatform(context.platform);
  const botId = normalizeOrderBotId(context.botId);
  let status = "pending";
  if (Object.prototype.hasOwnProperty.call(args, "status")) {
    const normalizedStatus = normalizeOrderStatus(args.status);
    if (!normalizedStatus) {
      return { success: false, error: "สถานะไม่ถูกต้อง" };
    }
    status = normalizedStatus;
  }
  const notes = sanitizeOrderNotes(args.notes);

  const orderId = await saveOrderToDatabase(
    userId,
    platform,
    botId,
    normalized.orderData,
    "ai_tool",
    false,
    { status, notes },
  );

  if (!orderId) {
    return { success: false, error: "ไม่สามารถบันทึกออเดอร์ได้" };
  }

  const orderIdString =
    typeof orderId?.toString === "function"
      ? orderId.toString()
      : String(orderId || "");

  triggerOrderNotification(orderId);

  await maybeAnalyzeFollowUp(userId, platform, botId, {
    forceUpdate: true,
  });

  try {
    if (io) {
      io.emit("orderExtracted", {
        userId,
        orderId: orderIdString,
        orderData: normalized.orderData,
        isManualExtraction: false,
        extractedAt: new Date(),
        source: "ai_tool",
      });
    }
  } catch (_) { }

  return {
    success: true,
    orderId: orderIdString,
    orderData: normalized.orderData,
    status,
  };
}

async function updateOrderFromTool(args = {}, context = {}) {
  const userId = context.userId;
  if (!userId) {
    return { success: false, error: "ไม่พบผู้ใช้สำหรับแก้ไขออเดอร์" };
  }

  const requiredFields = await getOrderRequiredFieldsSetting();
  const platform = normalizeOrderPlatform(context.platform);
  const botId = normalizeOrderBotId(context.botId);

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("orders");

  let order = null;
  let orderIdString = null;

  if (args.orderId) {
    const orderIdRaw =
      typeof args.orderId === "string" ? args.orderId.trim() : "";
    if (!ObjectId.isValid(orderIdRaw)) {
      return { success: false, error: "orderId ไม่ถูกต้อง" };
    }
    orderIdString = orderIdRaw;
    const query = {
      _id: new ObjectId(orderIdRaw),
      userId,
      platform,
    };
    if (botId !== null) {
      query.botId = botId;
    }
    order = await coll.findOne(query);
  } else {
    const query = {
      userId,
      platform,
    };
    if (botId !== null) {
      query.botId = botId;
    }
    order = await coll.findOne(query, { sort: { extractedAt: -1 } });
    if (order?._id) {
      orderIdString = order._id.toString();
    }
  }

  if (!order) {
    return { success: false, error: "ไม่พบออเดอร์สำหรับแก้ไข" };
  }

  let patchResult = { ok: true, patch: {}, hasChanges: false };
  if (args.orderData && typeof args.orderData === "object") {
    patchResult = buildOrderDataPatch(args.orderData);
  }
  if (!patchResult.ok) {
    return { success: false, error: patchResult.error };
  }

  let status = null;
  if (Object.prototype.hasOwnProperty.call(args, "status")) {
    status = normalizeOrderStatus(args.status);
    if (!status) {
      return { success: false, error: "สถานะไม่ถูกต้อง" };
    }
  }

  const notesProvided = Object.prototype.hasOwnProperty.call(args, "notes");
  const notes = notesProvided ? sanitizeOrderNotes(args.notes) : null;

  const updateDoc = {
    updatedAt: new Date(),
  };

  if (patchResult.hasChanges) {
    const mergedOrderData = {
      ...(order.orderData || {}),
      ...patchResult.patch,
    };
    const requirementCheck = validateOrderRequirements(
      mergedOrderData,
      requiredFields,
    );
    if (!requirementCheck.ok) {
      return {
        success: false,
        error: `ข้อมูลออเดอร์ยังไม่ครบ: ${formatMissingOrderFields(
          requirementCheck.missing,
        )}`,
        missingFields: requirementCheck.missing,
      };
    }
    updateDoc.orderData = mergedOrderData;
  }
  if (status) {
    updateDoc.status = status;
  }
  if (notesProvided) {
    updateDoc.notes = notes;
  }

  if (Object.keys(updateDoc).length === 1) {
    return { success: false, error: "ไม่มีข้อมูลสำหรับอัปเดต" };
  }

  await coll.updateOne({ _id: order._id }, { $set: updateDoc });
  const updatedOrder = await coll.findOne({ _id: order._id });

  try {
    if (io) {
      io.emit("orderUpdated", {
        orderId: orderIdString,
        userId,
        orderData: updatedOrder?.orderData || null,
        status: updatedOrder?.status || status || null,
        notes: updatedOrder?.notes || null,
        updatedAt: updatedOrder?.updatedAt || updateDoc.updatedAt,
      });
    }
  } catch (_) { }

  await maybeAnalyzeFollowUp(userId, platform, botId, {
    forceUpdate: true,
  });

  return {
    success: true,
    orderId: orderIdString,
    order: updatedOrder || null,
  };
}


async function triggerOrderNotification(orderId) {
  if (!orderId) return;
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const orders = db.collection("orders");
    const order = await orders.findOne({ _id: new ObjectId(orderId) });

    if (!order) return;
    // Check if already sent
    if (order.notificationStatus === "sent") {
      console.log(`[Notification] Order ${orderId} already notified.`);
      return;
    }

    const result = await notificationService.sendNewOrder(orderId);

    // Update status based on result
    const status = result.success ? "sent" : "failed";
    await orders.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { notificationStatus: status, notificationSentAt: new Date() } }
    );
    console.log(`[Notification] Order ${orderId} notification: ${status}`);

  } catch (err) {
    console.warn(`[Notification] Error triggering for ${orderId}:`, err.message);
  }
}

async function getLatestOrderForUser(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");
    return await coll.findOne({ userId }, { sort: { extractedAt: -1 } });
  } catch (error) {
    console.error("[Order] ดึงออเดอร์ล่าสุดไม่สำเร็จ:", error.message);
    return null;
  }
}

async function getUserOrders(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const orders = await coll
      .find({ userId })
      .sort({ extractedAt: -1 })
      .toArray();

    return orders;
  } catch (error) {
    console.error("[Order] ดึงออเดอร์ไม่สำเร็จ:", error.message);
    return [];
  }
}

async function maybeAnalyzeOrder(
  userId,
  platform = "line",
  botId = null,
  options = {},
) {
  // ฟังก์ชันนี้ถูกปิดการใช้งานถาวรตามนโยบาย AI Tool Only
  return;
}

async function startOrderCutoffScheduler() {
  // ถูกปิดการใช้งานถาวร - ไม่ต้องทำอะไร
  return;
}

async function getFollowUpUsers(filter = {}) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const taskColl = db.collection("follow_up_tasks");
  const profileColl = db.collection("user_profiles");

  const normalizedPlatform = filter.platform || null;
  const normalizedBotId = filter.botId
    ? normalizeFollowUpBotId(filter.botId)
    : null;
  const dateKey = filter.dateKey || getDateKey();

  const query = { dateKey };
  if (normalizedPlatform) {
    query.platform = normalizedPlatform;
  }
  if (filter.botId) {
    query.botId = normalizedBotId;
  }

  const tasks = await taskColl
    .find(query)
    .sort({ nextScheduledAt: 1, createdAt: -1 })
    .limit(200)
    .toArray();
  if (!tasks.length) {
    return {
      users: [],
      summary: {
        total: 0,
        active: 0,
        completed: 0,
        canceled: 0,
        failed: 0,
        dateKey,
      },
    };
  }

  const contextKeys = [
    ...new Set(
      tasks.map((task) => {
        const contextPlatform = task.platform || "line";
        const contextBotId = normalizeFollowUpBotId(task.botId);
        return `${contextPlatform}:${contextBotId || "default"}`;
      }),
    ),
  ];

  const contextConfigEntries = await Promise.all(
    contextKeys.map(async (key) => {
      const [ctxPlatform, ctxBotId] = key.split(":");
      const config = await getFollowUpConfigForContext(
        ctxPlatform,
        ctxBotId === "default" ? null : ctxBotId,
      );
      return { key, config };
    }),
  );

  const contextConfigMap = new Map();
  contextConfigEntries.forEach((entry) => {
    contextConfigMap.set(entry.key, entry.config || {});
  });

  const userIds = [...new Set(tasks.map((task) => task.userId))];
  const profiles =
    userIds.length > 0
      ? await profileColl.find({ userId: { $in: userIds } }).toArray()
      : [];
  const profileMap = new Map();
  profiles.forEach((profile) => {
    profileMap.set(profile.userId, profile);
  });

  const users = tasks
    .map((task) => {
      const profile = profileMap.get(task.userId);
      const contextPlatform = task.platform || "line";
      const contextBotId = normalizeFollowUpBotId(task.botId);
      const configKey = `${contextPlatform}:${contextBotId || "default"}`;
      const config = contextConfigMap.get(configKey) || {};

      if (config.showInDashboard === false) {
        return null;
      }

      const rawRounds = Array.isArray(task.rounds) ? task.rounds : [];
      const sanitizedRounds = rawRounds.map((r) => ({
        index: r?.index ?? 0,
        message: typeof r?.message === "string" ? r.message : "",
        images: sanitizeFollowUpImages(r?.images || []),
        scheduledAt: r?.scheduledAt || null,
        sentAt: r?.sentAt || null,
        status: r?.status || "pending",
      }));
      const totalRounds = sanitizedRounds.length;
      const sentCount = sanitizedRounds.filter(
        (r) => r && r.status === "sent",
      ).length;
      const hasFailed = sanitizedRounds.some((r) => r && r.status === "failed");
      const nextIndex =
        typeof task.nextRoundIndex === "number" ? task.nextRoundIndex : 0;
      const nextRound =
        nextIndex < sanitizedRounds.length ? sanitizedRounds[nextIndex] : null;

      let status = "active";
      if (hasFailed) {
        status = "failed";
      }
      if (task.canceled) {
        status = "canceled";
      } else if (task.completed) {
        status = "completed";
      }

      const displayName = profile?.displayName || `${task.userId.slice(0, 6)}…`;
      const preview = task.lastUserMessagePreview || "";

      return {
        userId: task.userId,
        displayName,
        pictureUrl: profile?.pictureUrl || null,
        platform: contextPlatform,
        botId: contextBotId,
        contextKey: configKey,
        pageId: configKey,
        status,
        lastUserMessagePreview: preview,
        lastUserMessageAt: task.lastUserMessageAt || null,
        lastFollowUpAt: task.lastSentAt || null,
        nextScheduledAt: task.nextScheduledAt || null,
        nextMessage: summarizeFollowUpRound(nextRound),
        totalRounds,
        sentRounds: sentCount,
        rounds: sanitizedRounds,
        canceledReason: task.cancelReason || null,
        dateKey: task.dateKey,
        lastMessage: preview,
        followUpReason: task.cancelReason || "",
        config: {
          analysisEnabled: config.analysisEnabled !== false,
          showInDashboard: config.showInDashboard !== false,
          autoFollowUpEnabled: config.autoFollowUpEnabled !== false,
          rounds: config.rounds || [],
        },
      };
    })
    .filter(Boolean);

  const summary = {
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    completed: users.filter((user) => user.status === "completed").length,
    canceled: users.filter((user) => user.status === "canceled").length,
    failed: users.filter((user) => user.status === "failed").length,
    contexts: contextKeys.length,
    dateKey,
  };

  return { users, summary };
}

async function buildFollowUpOverview() {
  const [{ users, summary }, pageSettings] = await Promise.all([
    getFollowUpUsers({}),
    listFollowUpPageSettings(),
  ]);

  const normalizedSummary = {
    total: summary?.total || 0,
    active: summary?.active || 0,
    completed: summary?.completed || 0,
    canceled: summary?.canceled || 0,
    failed: summary?.failed || 0,
    dateKey: summary?.dateKey || getDateKey(),
  };

  const pageMap = new Map();
  (pageSettings.pages || []).forEach((page) => {
    pageMap.set(page.id, page);
  });

  const groupMap = new Map();
  users.forEach((user) => {
    const contextKey =
      user.contextKey ||
      `${user.platform || "line"}:${user.botId || "default"}`;
    if (!groupMap.has(contextKey)) {
      const pageInfo = pageMap.get(contextKey) || null;
      const label =
        pageInfo?.name || (user.platform === "facebook" ? "Facebook" : "LINE");
      groupMap.set(contextKey, {
        contextKey,
        platform: user.platform || "line",
        botId: user.botId || null,
        pageName: label,
        pageInfo,
        config: user.config || {},
        stats: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 },
        users: [],
      });
    }

    const group = groupMap.get(contextKey);
    group.stats.total += 1;
    if (user.status && group.stats.hasOwnProperty(user.status)) {
      group.stats[user.status] += 1;
    }
    group.users.push(user);
  });

  const groups = Array.from(groupMap.values())
    .map((group) => {
      if (Array.isArray(group.users)) {
        group.users = group.users.sort((a, b) => {
          const aTime = a.nextScheduledAt
            ? new Date(a.nextScheduledAt).getTime()
            : Infinity;
          const bTime = b.nextScheduledAt
            ? new Date(b.nextScheduledAt).getTime()
            : Infinity;
          if (aTime === bTime) {
            return (a.displayName || "").localeCompare(b.displayName || "");
          }
          return aTime - bTime;
        });
      }
      return group;
    })
    .sort((a, b) => a.pageName.localeCompare(b.pageName));
  return { summary: normalizedSummary, groups };
}

async function clearFollowUpStatus(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_status");
  const now = new Date();
  const existing = (await coll.findOne({ senderId: userId })) || {};
  await coll.updateOne(
    { senderId: userId },
    {
      $set: {
        senderId: userId,
        hasFollowUp: false,
        followUpReason: "",
        followUpUpdatedAt: now,
        lastAnalyzedAt: now,
        platform: existing.platform || null,
        botId: normalizeFollowUpBotId(existing.botId),
      },
    },
    { upsert: true },
  );
}

// ตัวแปรเก็บ instructions จาก Google Doc
let googleDocInstructions = "";
async function fetchGoogleDocInstructions() {
  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/documents.readonly"],
    });
    const docs = google.docs({ version: "v1", auth });
    const res = await docs.documents.get({ documentId: GOOGLE_DOC_ID });
    const docBody = res.data.body?.content || [];
    let fullText = "";
    docBody.forEach((block) => {
      if (block.paragraph?.elements) {
        block.paragraph.elements.forEach((elem) => {
          if (elem.textRun?.content) {
            fullText += elem.textRun.content;
          }
        });
      }
    });
    googleDocInstructions = fullText.trim();
  } catch {
    googleDocInstructions = "Error fetching system instructions.";
  }
}

async function getSheetsApi() {
  const sheetsAuth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: sheetsAuth });
}

async function fetchSheetData(spreadsheetId, range) {
  try {
    const sheetsApi = await getSheetsApi();
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];
    return rows;
  } catch {
    return [];
  }
}

/**
 * ข้ามแถวที่ทุก cell ว่าง
 */
function parseSheetRowsToObjects(rows) {
  if (!rows || rows.length < 2) {
    return [];
  }
  const headers = rows[0];
  const dataRows = rows.slice(1);
  return dataRows.reduce((acc, row) => {
    const hasContent = row.some((cell) => cell && cell.trim() !== "");
    if (!hasContent) {
      return acc;
    }
    let obj = {};
    headers.forEach((headerName, colIndex) => {
      obj[headerName] = row[colIndex] || "";
    });
    acc.push(obj);
    return acc;
  }, []);
}

function transformSheetRowsToJSON(rows) {
  return parseSheetRowsToObjects(rows);
}

// ตรงนี้จะเก็บข้อมูล 4 แท็บหลังดึงจาก Google Sheets
let sheetJSON = {
  qnaSteps: [],
  companyDetails: [],
  products: [],
  services: [],
};

// รวม 4 แท็บ ถ้าจะเรียกหลายครั้ง
async function fetchAllSheetsData(spreadsheetId) {
  const [
    rowsQnASteps, // "ลักษณะ/ขั้นตอน การถามตอบ"
    rowsMainFlow, // "Main flow"
    rowsProductFlow, // "Product flow"
    rowsServiceFlow, // "Service flow"
    rowsCompany, // "Company details"
    rowsProducts, // "Products"
    rowsServices, // "Services"
  ] = await Promise.all([
    fetchSheetData(spreadsheetId, "ลักษณะ/ขั้นตอน การถามตอบ!A1:D1000"),
    fetchSheetData(spreadsheetId, "Main flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Product flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Service flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Company details!A1:D30"),
    fetchSheetData(spreadsheetId, "Products!A1:Q40"),
    fetchSheetData(spreadsheetId, "Services!A1:O40"),
  ]);

  return {
    // รวมข้อมูลจาก "ลักษณะ/ขั้นตอน การถามตอบ" + main/product/service flow
    qnaSteps: transformSheetRowsToJSON(rowsQnASteps).concat(
      transformSheetRowsToJSON(rowsMainFlow),
      transformSheetRowsToJSON(rowsProductFlow),
      transformSheetRowsToJSON(rowsServiceFlow),
    ),
    companyDetails: transformSheetRowsToJSON(rowsCompany),
    products: transformSheetRowsToJSON(rowsProducts),
    services: transformSheetRowsToJSON(rowsServices),
  };
}

// === ฟังก์ชันโมเดลเล็ก: วิเคราะห์ Flow และข้อมูลที่ขาด (ฟังก์ชันใหม่ไม่มีการประกาศ openai ซ้ำซ้อน)
// (ลบฟังก์ชัน analyzeFlowGPT4oMini)
// ... existing code ...
// (ลบฟังก์ชัน analyzeImageWithAnotherModel)
// ... existing code ...

// ------------------------
// ระบบคิว (ดีเลย์ 5 วินาที) - ปรับปรุงแล้ว
// ------------------------
const processedIds = new Set();
const userQueues = {}; // { queueKey: { userId, messages: [], timer: null, context: {} } }

function buildQueueKey(userId, options = {}) {
  if (options.queueKey) {
    return options.queueKey;
  }
  const idPart =
    typeof userId === "string" ? userId : String(userId || "unknown");
  const botType = options.botType || options.platform || null;
  const rawBotId = options.botId || options.lineBotId || null;
  if (botType || rawBotId) {
    const botId = rawBotId || "default";
    return `${botType || "bot"}:${botId}:${idPart}`;
  }
  return idPart;
}

function mergeQueueContext(existingContext = {}, newContext = {}) {
  const merged = { ...existingContext, ...newContext };
  if (!merged.botId && merged.lineBotId) {
    merged.botId = merged.lineBotId;
  }
  if (!merged.platform) {
    merged.platform = merged.botType || "line";
  }
  if (!merged.botType) {
    merged.botType = merged.platform || "line";
  }
  if (!merged.platform && merged.botType === "line") {
    merged.platform = "line";
  }
  return merged;
}

// ฟังก์ชันสำหรับวิเคราะห์ประเภทเนื้อหาในคิว
function analyzeQueueContent(messages) {
  const analysis = {
    textCount: 0,
    imageCount: 0,
    hasRecentText: false,
    hasRecentImage: false,
    shouldProcessSeparately: false,
    processingStrategy: "combined", // 'combined', 'text_only', 'image_focused'
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.data?.type === "text") {
      analysis.textCount++;
      if (i >= messages.length - 2) analysis.hasRecentText = true;
    } else if (msg.data?.type === "image") {
      analysis.imageCount++;
      if (i >= messages.length - 2) analysis.hasRecentImage = true;
    }
  }

  // กำหนดกลยุทธ์การประมวลผล
  if (analysis.imageCount === 0) {
    analysis.processingStrategy = "text_only";
  } else if (analysis.textCount === 0) {
    analysis.processingStrategy = "image_focused";
  } else if (
    analysis.imageCount > 2 ||
    (analysis.hasRecentText && analysis.hasRecentImage)
  ) {
    analysis.processingStrategy = "combined";
  } else {
    analysis.processingStrategy = "combined";
  }

  console.log(
    `[LOG] Content Analysis: ${analysis.textCount} texts, ${analysis.imageCount} images, strategy: ${analysis.processingStrategy}`,
  );
  return analysis;
}

function sanitizeTextValue(text, options = {}) {
  if (text === null || text === undefined) {
    return null;
  }

  let sanitized = String(text);
  sanitized = sanitized
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!sanitized) {
    return null;
  }

  const maxLength =
    typeof options.maxLength === "number" && options.maxLength > 0
      ? Math.floor(options.maxLength)
      : 6000;

  if (sanitized.length > maxLength) {
    if (options.keepTail) {
      sanitized = sanitized.slice(-maxLength);
    } else {
      sanitized = sanitized.slice(0, maxLength);
    }
  }

  return sanitized;
}

function isLikelyValidBase64Image(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 16) {
    return false;
  }

  if (/[^A-Za-z0-9+/=\r\n]/.test(trimmed)) {
    return false;
  }

  return trimmed.length % 4 === 0;
}

function cloneQueueMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const cloned = { ...message };
  if (message.data && typeof message.data === "object") {
    cloned.data = { ...message.data };
  }
  return cloned;
}

function filterMessagesForStrategy(messages, strategy = "original") {
  const meta = {
    droppedImages: 0,
    droppedTexts: 0,
    droppedOthers: 0,
    suspectImages: 0,
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], meta };
  }

  if (strategy === "recent_text_only") {
    for (let i = messages.length - 1; i >= 0; i--) {
      const cloned = cloneQueueMessage(messages[i]);
      if (!cloned) continue;
      const data =
        (cloned.data && typeof cloned.data === "object" && cloned.data) ||
        (typeof cloned === "object" ? cloned : null);
      if (!data || data.type !== "text") {
        meta.droppedOthers++;
        continue;
      }

      const sanitizedText = sanitizeTextValue(
        data.text !== undefined ? data.text : data.content,
      );
      if (!sanitizedText) {
        meta.droppedTexts++;
        continue;
      }

      if (data.text !== undefined) {
        data.text = sanitizedText;
      } else {
        data.content = sanitizedText;
      }
      return { messages: [cloned], meta };
    }
    return { messages: [], meta };
  }

  const result = [];
  for (const original of messages) {
    const cloned = cloneQueueMessage(original);
    if (!cloned) {
      meta.droppedOthers++;
      continue;
    }

    const data =
      (cloned.data && typeof cloned.data === "object" && cloned.data) ||
      (typeof cloned === "object" ? cloned : null);
    if (!data || typeof data !== "object") {
      meta.droppedOthers++;
      continue;
    }

    const type = data.type;

    if (type === "text") {
      const sanitizedText = sanitizeTextValue(
        data.text !== undefined ? data.text : data.content,
      );
      if (!sanitizedText) {
        meta.droppedTexts++;
        continue;
      }

      if (data.text !== undefined) {
        data.text = sanitizedText;
      } else {
        data.content = sanitizedText;
      }
    } else if (type === "image") {
      const base64 =
        typeof data.base64 === "string" ? data.base64 : data.content;
      const hasContent = typeof base64 === "string" && base64.trim().length > 0;
      const validBase64 = hasContent && isLikelyValidBase64Image(base64);

      if (!hasContent) {
        meta.droppedImages++;
        continue;
      }

      if (!validBase64) {
        if (strategy === "drop_invalid_images") {
          meta.droppedImages++;
          continue;
        }
        meta.suspectImages++;
      }
    } else if (typeof type === "string") {
      // ชนิดอื่น ๆ เช่น audio, file
      meta.droppedOthers++;
      continue;
    } else {
      meta.droppedOthers++;
      continue;
    }

    result.push(cloned);
  }

  return { messages: result, meta };
}

function buildContentSequenceFromMessages(messages, enableMessageMerging = true) {
  const contentSequence = [];
  const combinedTextParts = [];

  if (!Array.isArray(messages)) {
    return {
      contentSequence,
      combinedTextParts,
      hasImages: false,
      textSegmentCount: 0,
    };
  }

  for (const message of messages) {
    const data =
      (message.data && typeof message.data === "object" && message.data) ||
      (typeof message === "object" ? message : null);
    if (!data || typeof data !== "object") {
      continue;
    }

    if (data.type === "text") {
      const rawText =
        data.text !== undefined ? data.text : data.content !== undefined
          ? data.content
          : null;
      const sanitizedText = sanitizeTextValue(rawText);
      if (!sanitizedText) {
        continue;
      }

      combinedTextParts.push(sanitizedText);
      contentSequence.push({ type: "text", content: sanitizedText });
    } else if (data.type === "image") {
      const base64 =
        typeof data.base64 === "string" ? data.base64 : data.content;
      if (!base64 || !base64.trim()) {
        continue;
      }

      contentSequence.push({
        type: "image",
        content: base64,
        description:
          data.description || data.text || "ผู้ใช้ส่งรูปภาพมา",
      });
    }
  }

  return {
    contentSequence,
    combinedTextParts,
    hasImages: contentSequence.some((entry) => entry.type === "image"),
    textSegmentCount: combinedTextParts.length,
  };
}

function cloneContentSequenceEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const cloned = { ...entry };
  if (entry.payload && typeof entry.payload === "object") {
    cloned.payload = { ...entry.payload };
  }
  return cloned;
}

function filterContentSequenceForStrategy(sequence, strategy = "original") {
  const meta = {
    droppedImages: 0,
    droppedTexts: 0,
    droppedOthers: 0,
    suspectImages: 0,
  };

  if (!Array.isArray(sequence) || sequence.length === 0) {
    return { sequence: [], textParts: [], meta };
  }

  if (strategy === "recent_text_only") {
    for (let i = sequence.length - 1; i >= 0; i--) {
      const cloned = cloneContentSequenceEntry(sequence[i]);
      if (!cloned) {
        meta.droppedOthers++;
        continue;
      }
      if (cloned.type !== "text") {
        meta.droppedOthers++;
        continue;
      }
      const sanitized = sanitizeTextValue(cloned.content);
      if (!sanitized) {
        meta.droppedTexts++;
        continue;
      }
      cloned.content = sanitized;
      return { sequence: [cloned], textParts: [sanitized], meta };
    }
    return { sequence: [], textParts: [], meta };
  }

  const result = [];
  const textParts = [];

  for (const entry of sequence) {
    const cloned = cloneContentSequenceEntry(entry);
    if (!cloned) {
      meta.droppedOthers++;
      continue;
    }

    if (cloned.type === "text") {
      const sanitized = sanitizeTextValue(cloned.content);
      if (!sanitized) {
        meta.droppedTexts++;
        continue;
      }
      cloned.content = sanitized;
      textParts.push(sanitized);
      result.push(cloned);
    } else if (cloned.type === "image") {
      const base64 = typeof cloned.content === "string" ? cloned.content : "";
      const hasContent = base64.trim().length > 0;
      const validBase64 = hasContent && isLikelyValidBase64Image(base64);

      if (!hasContent) {
        meta.droppedImages++;
        continue;
      }

      if (!validBase64) {
        if (strategy === "drop_invalid_images") {
          meta.droppedImages++;
          continue;
        }
        meta.suspectImages++;
      }

      result.push(cloned);
    } else {
      meta.droppedOthers++;
    }
  }

  return { sequence: result, textParts, meta };
}

async function addToQueue(userId, incomingItem, options = {}) {
  console.log(`[LOG] เพิ่มข้อมูลเข้าคิวสำหรับผู้ใช้: ${userId}`);
  const queueKey = buildQueueKey(userId, options);

  if (!userQueues[queueKey]) {
    console.log(
      `[LOG] สร้างคิวใหม่สำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    userQueues[queueKey] = {
      userId,
      messages: [],
      timer: null,
      context: {},
    };
  }

  userQueues[queueKey].context = mergeQueueContext(
    userQueues[queueKey].context,
    options,
  );

  const queue = userQueues[queueKey];
  // ตรวจสอบจำนวนข้อความสูงสุดในคิว
  const maxQueueSetting = await getSettingValue("maxQueueMessages", 10);
  const maxQueueMessages = Number(maxQueueSetting);
  const normalizedMax =
    Number.isFinite(maxQueueMessages) && maxQueueMessages > 0
      ? Math.floor(maxQueueMessages)
      : 10;

  if (queue.messages.length >= normalizedMax) {
    console.log(
      `[LOG] จำนวนข้อความในคิวถึงขีดจำกัด (${normalizedMax}) เริ่มประมวลผลทันที (queueKey: ${queueKey})`,
    );
    // ยกเลิกตัวจับเวลาเดิม
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }
    // ประมวลผลทันทีและรอให้เสร็จ ก่อนเพิ่มข้อความใหม่
    await flushQueue(queueKey);
  }

  queue.messages.push(incomingItem);
  console.log(
    `[LOG] คิวของผู้ใช้ ${userId} (queueKey: ${queueKey}) มีข้อความ ${queue.messages.length} ข้อความ`,
  );

  if (queue.timer) {
    console.log(
      `[LOG] ยกเลิกตัวจับเวลาคิวเดิมสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    clearTimeout(queue.timer);
    queue.timer = null;
  }

  // ใช้ค่าที่ตั้งไว้ในฐานข้อมูล
  const chatDelaySetting = await getSettingValue("chatDelaySeconds", 0);
  const chatDelay = Number(chatDelaySetting);
  const normalizedDelay =
    Number.isFinite(chatDelay) && chatDelay >= 0 ? chatDelay : 5;
  console.log(
    `[LOG] ตั้งเวลาประมวลผลคิวใน ${normalizedDelay} วินาที สำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
  );
  console.log(
    `[LOG] ระบบจะรอข้อความเพิ่มจากผู้ใช้เป็นเวลา ${normalizedDelay} วินาที`,
  );
  queue.timer = setTimeout(() => {
    console.log(
      `[LOG] ครบเวลา delay (${normalizedDelay} วินาที) เริ่มประมวลผลคิวสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    flushQueue(queueKey).catch((err) => {
      console.error(
        `[LOG] เกิดข้อผิดพลาดระหว่างประมวลผลคิวสำหรับผู้ใช้ ${userId} (queueKey: ${queueKey}):`,
        err,
      );
    });
  }, normalizedDelay * 1000);
}

async function flushQueue(queueKey) {
  const queue = userQueues[queueKey];
  if (!queue) {
    console.log(`[LOG] ไม่พบคิวสำหรับ key: ${queueKey}`);
    return;
  }
  const { userId, messages } = queue;
  console.log(
    `[LOG] เริ่มการประมวลผลคิวสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
  );

  if (!messages || messages.length === 0) {
    console.log(
      `[LOG] ไม่พบข้อความในคิวสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    queue.timer = null;
    return;
  }
  const allItems = [...messages];
  console.log(
    `[LOG] มีข้อความ ${allItems.length} ข้อความในคิวของผู้ใช้: ${userId}`,
  );
  queue.messages = [];
  queue.timer = null;

  console.log(`[LOG] เริ่มประมวลผลข้อความทั้งหมดในคิวสำหรับผู้ใช้: ${userId}`);
  await processFlushedMessages(userId, allItems, queue.context);
  console.log(`[LOG] ประมวลผลคิวเสร็จสิ้นสำหรับผู้ใช้: ${userId}`);
}

async function processFlushedMessages(
  userId,
  mergedContent,
  queueContext = {},
) {
  console.log(`[LOG] เริ่มประมวลผลข้อความในคิวสำหรับผู้ใช้: ${userId}`);

  const platform = queueContext.platform || queueContext.botType || "line";
  const botIdForHistory = queueContext.botId || null;
  const aiModelOverride = queueContext.aiModel || null;
  const disableAiReply = !!queueContext.disableAiReply;
  const replyToken =
    mergedContent.length > 0
      ? mergedContent[mergedContent.length - 1].replyToken
      : null;
  const channelAccessToken = queueContext.channelAccessToken;
  const channelSecret = queueContext.channelSecret;
  const lineClientFromContext = queueContext.lineClient;
  const facebookAccessToken =
    queueContext.facebookAccessToken ||
    queueContext.accessToken ||
    queueContext.pageAccessToken ||
    null;
  const isLinePlatform = queueContext.botType === "line" || platform === "line";

  async function replyWithLineText(messageText) {
    if (!isLinePlatform) {
      return false;
    }
    if (!replyToken) {
      console.log(
        `[LOG] ไม่มี replyToken สำหรับผู้ใช้ ${userId} ไม่สามารถส่งข้อความกลับได้`,
      );
      return false;
    }
    const normalizedMessage = normalizeOutgoingText(messageText);
    if (!normalizedMessage) {
      return false;
    }
    try {
      if (channelAccessToken && channelSecret) {
        await sendMessage(
          replyToken,
          normalizedMessage,
          userId,
          true,
          channelAccessToken,
          channelSecret,
        );
        return true;
      }
      if (lineClientFromContext) {
        await lineClientFromContext.replyMessage(replyToken, {
          type: "text",
          text: normalizedMessage,
        });
        return true;
      }
      console.log(
        `[LOG] ไม่สามารถส่งข้อความได้ - ไม่มีข้อมูล Line Client หรือ Channel Credentials สำหรับผู้ใช้ ${userId}`,
      );
      return false;
    } catch (error) {
      console.error("[LOG] ไม่สามารถส่งข้อความตอบกลับได้:", error);
      return false;
    }
  }

  // ตรวจสอบโหมดระบบ
  const systemMode = await getSettingValue("systemMode", "production");
  if (systemMode === "maintenance") {
    console.log(`[LOG] ระบบอยู่ในโหมดบำรุงรักษา ไม่สามารถประมวลผลข้อความได้`);
    if (isLinePlatform) {
      await replyWithLineText(
        "ขออภัยค่ะ ระบบกำลังอยู่ในโหมดบำรุงรักษา กรุณาลองใหม่อีกครั้ง",
      );
    }
    return;
  }

  // กรณีปิด bot/หยุดตอบอัตโนมัติ (ยังคงบันทึกประวัติ + งานติดตาม/ออเดอร์)
  if (disableAiReply) {
    console.log(
      `[LOG] Bot ปิดการตอบอัตโนมัติ - บันทึกข้อความโดยไม่ตอบกลับสำหรับผู้ใช้: ${userId}`,
    );
    await saveChatHistory(userId, mergedContent, "", platform, botIdForHistory);
    return;
  }

  const userStatus = await getUserStatus(userId);
  const aiEnabled = userStatus.aiEnabled;
  console.log(
    `[LOG] สถานะการใช้ AI ของผู้ใช้ ${userId}: ${aiEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}`,
  );

  const history = await getAIHistory(userId);
  console.log(
    `[LOG] ดึงประวัติ (สำหรับ AI) ของผู้ใช้ ${userId}: ${history.length} ข้อความ`,
  );

  // ตรวจสอบการตั้งค่า AI ในระดับระบบ
  const systemAiEnabled = await getSettingValue("aiEnabled", true);
  if (!systemAiEnabled) {
    console.log(`[LOG] AI ถูกปิดใช้งานในระดับระบบ`);
    await saveChatHistory(userId, mergedContent, "", platform, botIdForHistory);
    return;
  }

  if (!aiEnabled) {
    // ถ้า AI ปิดอยู่
    console.log(
      `[LOG] AI ปิดใช้งาน, บันทึกข้อความโดยไม่มีการตอบกลับสำหรับผู้ใช้: ${userId}`,
    );
    await saveChatHistory(userId, mergedContent, "", platform, botIdForHistory);
    return;
  }

  // ตรวจสอบการตั้งค่าการรวมข้อความ
  const enableMessageMerging = await getSettingValue(
    "enableMessageMerging",
    true,
  );

  // บันทึกสถานะเนื้อหาต้นฉบับเพื่อช่วยดีบัก
  analyzeQueueContent(mergedContent);

  let assistantMsg = "";
  const recoveryStrategies = [
    { key: "original", label: "ข้อมูลเดิมทั้งหมด" },
    { key: "drop_invalid_images", label: "ลบรูปภาพที่อาจมีปัญหา" },
    { key: "recent_text_only", label: "ใช้เฉพาะข้อความล่าสุดที่ใช้ได้" },
  ];

  for (
    let attemptIndex = 0;
    attemptIndex < recoveryStrategies.length && !assistantMsg;
    attemptIndex++
  ) {
    const strategy = recoveryStrategies[attemptIndex];
    const { messages: sanitizedMessages, meta } = filterMessagesForStrategy(
      mergedContent,
      strategy.key,
    );

    if (!sanitizedMessages.length) {
      console.warn(
        `[LOG] กลยุทธ์ "${strategy.label}" ไม่พบข้อมูลที่พร้อมใช้งานสำหรับผู้ใช้ ${userId} ข้ามไปยังกลยุทธ์ถัดไป`,
      );
      continue;
    }

    const {
      contentSequence,
      combinedTextParts,
      hasImages,
      textSegmentCount,
    } = buildContentSequenceFromMessages(sanitizedMessages, enableMessageMerging);

    const combinedText = combinedTextParts.join("\n\n");
    const imageCount = contentSequence.filter((c) => c.type === "image").length;

    if (!hasImages && !combinedText) {
      console.warn(
        `[LOG] กลยุทธ์ "${strategy.label}" สำหรับผู้ใช้ ${userId} ไม่มีข้อความหรือรูปภาพหลังทำความสะอาด`,
      );
      continue;
    }

    if (
      meta.droppedImages > 0 ||
      meta.droppedTexts > 0 ||
      meta.droppedOthers > 0 ||
      meta.suspectImages > 0
    ) {
      const adjustments = [];
      if (meta.droppedImages > 0) {
        adjustments.push(`ลบรูปภาพ ${meta.droppedImages} รายการ`);
      }
      if (meta.suspectImages > 0) {
        adjustments.push(`พบรูปภาพที่ต้องจับตา ${meta.suspectImages} รายการ`);
      }
      if (meta.droppedTexts > 0) {
        adjustments.push(`ลบข้อความ ${meta.droppedTexts} รายการ`);
      }
      if (meta.droppedOthers > 0) {
        adjustments.push(`ละเว้นข้อมูลอื่น ${meta.droppedOthers} รายการ`);
      }
      console.log(
        `[LOG] กลยุทธ์ "${strategy.label}" มีการปรับข้อมูล: ${adjustments.join(", ")}`,
      );
    }

    console.log(
      `[LOG] เริ่มสร้าง system instructions (กลยุทธ์ ${strategy.label}, รอบที่ ${attemptIndex + 1}/${recoveryStrategies.length})`,
    );
    const systemInstructions = await buildSystemInstructionsWithContext(
      history,
      queueContext,
    );

    if (hasImages) {
      console.log(
        `[LOG] ประมวลผลแบบ multimodal (กลยุทธ์ ${strategy.label}): ข้อความ ${textSegmentCount} ส่วน, รูปภาพ ${imageCount} รูป`,
      );
      assistantMsg = await getAssistantResponseMultimodal(
        systemInstructions,
        history,
        contentSequence,
        aiModelOverride,
        queueContext.botId,
        platform,
        userId
      );
    } else {
      const preview = combinedText.substring(0, 100);
      console.log(
        `[LOG] ประมวลผลข้อความอย่างเดียว (กลยุทธ์ ${strategy.label}): ${preview}${combinedText.length > 100 ? "..." : ""}`,
      );
      assistantMsg = await getAssistantResponseTextOnly(
        systemInstructions,
        history,
        combinedText,
        aiModelOverride,
        queueContext.botId,
        platform,
        userId
      );
    }

    if (!assistantMsg) {
      console.warn(
        `[LOG] กลยุทธ์ "${strategy.label}" ไม่สามารถสร้างคำตอบได้สำหรับผู้ใช้ ${userId}`,
      );
    }
  }

  if (assistantMsg) {
    console.log(
      `[LOG] ได้รับคำตอบ: ${assistantMsg.substring(0, 100)}${assistantMsg.length > 100 ? "..." : ""}`,
    );
  } else {
    console.warn(
      `[LOG] ไม่สามารถสร้างคำตอบสำหรับผู้ใช้ ${userId} หลังใช้ทุกกลยุทธ์`,
    );
  }

  console.log(`[LOG] บันทึกประวัติการสนทนาสำหรับผู้ใช้: ${userId}`);
  await saveChatHistory(
    userId,
    mergedContent,
    assistantMsg,
    platform,
    botIdForHistory,
  );

  // แจ้งเตือนแอดมินเมื่อมีข้อความใหม่จากผู้ใช้
  try {
    await notifyAdminsNewMessage(userId, {
      content: Array.isArray(mergedContent)
        ? mergedContent.map((item) => item.data?.text || "ไฟล์แนบ").join(" ")
        : mergedContent,
      role: "user",
      timestamp: new Date(),
    });
  } catch (notifyError) {
    console.error("[Socket.IO] ไม่สามารถแจ้งเตือนแอดมินได้:", notifyError);
  }

  if (replyToken && isLinePlatform) {
    console.log(`[LOG] ส่งข้อความตอบกลับให้ผู้ใช้: ${userId}`);

    // กรองข้อความก่อนส่ง
    const filteredMessage = await filterMessage(assistantMsg);
    console.log(
      `[LOG] ข้อความหลังกรอง: ${filteredMessage.substring(0, 100)}${filteredMessage.length > 100 ? "..." : ""}`,
    );

    const sent = await replyWithLineText(filteredMessage);
    if (sent) {
      console.log(`[LOG] ส่งข้อความตอบกลับเรียบร้อยแล้ว`);
    }
  } else if (platform === "facebook") {
    console.log(`[LOG] ส่งข้อความตอบกลับผ่าน Facebook ให้ผู้ใช้: ${userId}`);
    const filteredMessage = await filterMessage(assistantMsg);
    console.log(
      `[LOG] ข้อความหลังกรอง (Facebook): ${filteredMessage.substring(0, 100)}${filteredMessage.length > 100 ? "..." : ""}`,
    );

    if (!facebookAccessToken) {
      console.error("[Facebook] ไม่พบ access token สำหรับการส่งข้อความ");
    } else if (filteredMessage) {
      try {
        await sendFacebookMessage(
          userId,
          filteredMessage,
          facebookAccessToken,
          {
            metadata: "ai_generated",
            selectedImageCollections:
              queueContext.selectedImageCollections || null,
          },
        );
        console.log("[Facebook] ส่งข้อความตอบกลับเรียบร้อยแล้ว");
      } catch (error) {
        console.error("[Facebook] ไม่สามารถส่งข้อความตอบกลับได้:", error);
      }
    }
  }
}

// ------------------------
// webhook
// ------------------------
// Webhook handler จะถูกจัดการผ่าน dynamic webhook routes ที่สร้างขึ้นใหม่
// app.post('/webhook', ...) ถูกลบออกแล้ว

async function captureLineGroupEvent(event, queueOptions = {}) {
  const botId = queueOptions.botId || queueOptions.lineBotId || null;
  const sourceType = event?.source?.type || null;

  if (!botId) return null;
  if (sourceType !== "group" && sourceType !== "room") return null;

  const groupId =
    sourceType === "group" ? event?.source?.groupId : event?.source?.roomId;
  if (!groupId) return null;

  const now = new Date();
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("line_bot_groups");

  const filter = { botId: botId.toString(), groupId };
  const update = {
    $setOnInsert: {
      botId: botId.toString(),
      groupId,
      sourceType,
      createdAt: now,
    },
    $set: {
      lastEventAt: now,
      updatedAt: now,
    },
  };

  if (event?.type === "leave") {
    update.$set.status = "left";
    update.$set.leftAt = now;
  } else {
    update.$set.status = "active";
    if (event?.type === "join") {
      update.$set.joinedAt = now;
    }
  }

  const result = await coll.updateOne(filter, update, { upsert: true });

  const shouldEnrich =
    result?.upsertedCount > 0 ||
    (event?.type === "join" && queueOptions?.lineClient);

  if (shouldEnrich && queueOptions?.lineClient) {
    try {
      const lineClient = queueOptions.lineClient;

      let summary = null;
      if (sourceType === "room" && typeof lineClient.getRoomSummary === "function") {
        summary = await lineClient.getRoomSummary(groupId);
      } else if (
        sourceType === "group" &&
        typeof lineClient.getGroupSummary === "function"
      ) {
        summary = await lineClient.getGroupSummary(groupId);
      }

      let memberCount = null;
      if (
        sourceType === "room" &&
        typeof lineClient.getRoomMembersCount === "function"
      ) {
        const count = await lineClient.getRoomMembersCount(groupId);
        memberCount = typeof count === "number" ? count : count?.count || null;
      } else if (
        sourceType === "group" &&
        typeof lineClient.getGroupMembersCount === "function"
      ) {
        const count = await lineClient.getGroupMembersCount(groupId);
        memberCount = typeof count === "number" ? count : count?.count || null;
      }

      const groupName =
        summary?.groupName || summary?.roomName || summary?.name || null;
      const pictureUrl = summary?.pictureUrl || summary?.picture || null;

      const enrich = {};
      if (groupName) enrich.groupName = groupName;
      if (pictureUrl) enrich.pictureUrl = pictureUrl;
      if (memberCount !== null) enrich.memberCount = memberCount;

      if (Object.keys(enrich).length) {
        await coll.updateOne(filter, { $set: { ...enrich, updatedAt: new Date() } });
      }
    } catch (err) {
      console.warn(
        "[LINE Group] ไม่สามารถดึงข้อมูลกลุ่ม/ห้องได้:",
        err?.message || err,
      );
    }
  }

  return { botId: botId.toString(), sourceType, groupId };
}

function formatSlipOkCurrency(amount) {
  const value =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(value)) return "";
  return `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

function pickSlipOkPersonName(person) {
  if (!person || typeof person !== "object") return "";
  const displayName =
    typeof person.displayName === "string" ? person.displayName.trim() : "";
  const name = typeof person.name === "string" ? person.name.trim() : "";
  if (!displayName && !name) return "";
  if (!displayName) return name;
  if (!name) return displayName;

  if (displayName === name) return displayName;

  const displayLen = displayName.replace(/\s+/g, "").length;
  const nameLen = name.replace(/\s+/g, "").length;
  if (nameLen > displayLen) return name;
  return displayName;
}

function formatSlipOkDateTime(slip) {
  const transDate =
    typeof slip?.transDate === "string" ? slip.transDate.trim() : "";
  const transTime =
    typeof slip?.transTime === "string" ? slip.transTime.trim() : "";

  if (transDate && transTime) {
    const parsedWithSeconds = moment.tz(
      `${transDate} ${transTime}`,
      "YYYYMMDD HH:mm:ss",
      "Asia/Bangkok",
    );
    if (parsedWithSeconds.isValid()) {
      return parsedWithSeconds.format("DD/MM/YYYY HH:mm:ss");
    }

    const parsedNoSeconds = moment.tz(
      `${transDate} ${transTime}`,
      "YYYYMMDD HH:mm",
      "Asia/Bangkok",
    );
    if (parsedNoSeconds.isValid()) {
      return parsedNoSeconds.format("DD/MM/YYYY HH:mm:ss");
    }
  }

  const transTimestamp =
    typeof slip?.transTimestamp === "string" ? slip.transTimestamp.trim() : "";
  if (transTimestamp) {
    const parsed = moment(transTimestamp);
    if (parsed.isValid()) {
      return parsed.tz("Asia/Bangkok").format("DD/MM/YYYY HH:mm:ss");
    }
  }

  return "";
}

function buildSlipOkReplyText(result = {}) {
  const lines = [];

  const ok = result?.ok === true;
  const code = result?.code ?? null;
  const message =
    typeof result?.message === "string" ? result.message.trim() : "";
  const slip = result?.slip && typeof result.slip === "object" ? result.slip : null;

  const slipIsValid = slip?.success === true;

  if (ok && slipIsValid) {
    lines.push("✅ สลิปถูกต้อง");
  } else {
    const codeText = code !== null && code !== undefined ? ` (${code})` : "";
    lines.push(`❌ ตรวจสลิปไม่ผ่าน${codeText}`);
    if (message) {
      lines.push(message);
    }
  }

  if (slip) {
    const amountText = formatSlipOkCurrency(slip.amount);
    if (amountText) {
      lines.push(`💰 จำนวนเงิน: ${amountText}`);
    }

    const senderName = pickSlipOkPersonName(slip.sender);
    if (senderName) {
      lines.push(`👤 ผู้โอน: ${senderName}`);
    }

    const receiverName = pickSlipOkPersonName(slip.receiver);
    if (receiverName) {
      lines.push(`🏦 ผู้รับ: ${receiverName}`);
    }

    const timeText = formatSlipOkDateTime(slip);
    if (timeText) {
      lines.push(`🕒 เวลา: ${timeText}`);
    }

    const sendingBank =
      typeof slip.sendingBank === "string" ? slip.sendingBank.trim() : "";
    if (sendingBank) {
      lines.push(`🏛️ ธนาคารผู้โอน: ${sendingBank}`);
    }

    const receivingBank =
      typeof slip.receivingBank === "string" ? slip.receivingBank.trim() : "";
    if (receivingBank) {
      lines.push(`🏛️ ธนาคารผู้รับ: ${receivingBank}`);
    }
  }

  const text = lines.filter(Boolean).join("\n").trim();
  const MAX_LENGTH = 4000;
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}

async function handleLineGroupSlipOkImage(event, queueOptions = {}) {
  const sourceType = event?.source?.type || "";
  if (sourceType !== "group" && sourceType !== "room") return;
  if (event?.type !== "message") return;

  const message = event?.message || {};
  if (message.type !== "image") return;
  if (!message.id) return;

  const botIdRaw = queueOptions.botId || queueOptions.lineBotId || null;
  const botId = typeof botIdRaw === "string" ? botIdRaw.trim() : botIdRaw ? String(botIdRaw) : "";
  if (!botId) return;

  const groupId =
    sourceType === "group" ? event?.source?.groupId : event?.source?.roomId;
  if (!groupId) return;

  const client = await connectDB();
  const db = client.db("chatbot");
  const channel = await db.collection("notification_channels").findOne({
    isActive: true,
    type: "line_group",
    senderBotId: botId,
    groupId,
    "settings.slipOkEnabled": true,
  });

  if (!channel) return;

  const settings = normalizeNotificationChannelSettings(channel.settings || {});
  if (settings.slipOkEnabled !== true) return;

  const apiUrl = typeof settings.slipOkApiUrl === "string" ? settings.slipOkApiUrl.trim() : "";
  const apiKey = typeof settings.slipOkApiKey === "string" ? settings.slipOkApiKey.trim() : "";

  const lineClientFromContext =
    queueOptions.lineClient || (await getLineClientForContext(botId));
  if (!lineClientFromContext) return;

  if (!apiUrl || !apiKey) {
    const text = "⚠️ ยังไม่ได้ตั้งค่า SlipOK API URL/API Key สำหรับกลุ่มนี้";
    if (event.replyToken) {
      await lineClientFromContext.replyMessage(event.replyToken, {
        type: "text",
        text,
      });
    } else {
      await lineClientFromContext.pushMessage(groupId, { type: "text", text });
    }
    return;
  }

  let imageBuffer = null;
  let contentType = "image/jpeg";

  try {
    const stream = await lineClientFromContext.getMessageContent(message.id);
    if (stream?.headers?.["content-type"]) {
      contentType = stream.headers["content-type"];
    }
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    imageBuffer = Buffer.concat(chunks);
  } catch (err) {
    console.warn(
      "[SlipOK] ไม่สามารถดึงรูปจาก LINE เพื่อใช้ตรวจสลิปได้:",
      err?.message || err,
    );
    const text = "❌ ไม่สามารถดึงรูปจาก LINE เพื่อใช้ตรวจสลิปได้";
    try {
      if (event.replyToken) {
        await lineClientFromContext.replyMessage(event.replyToken, {
          type: "text",
          text,
        });
      } else {
        await lineClientFromContext.pushMessage(groupId, { type: "text", text });
      }
    } catch (_) { }
    return;
  }

  const result = await slipOkService.checkSlipByImageBuffer({
    apiUrl,
    apiKey,
    buffer: imageBuffer,
    filename: `line-slip-${message.id}.jpg`,
    contentType,
  });

  const replyText = buildSlipOkReplyText(result);
  if (!replyText) return;

  await (event.replyToken
    ? lineClientFromContext.replyMessage(event.replyToken, {
      type: "text",
      text: replyText,
    })
    : lineClientFromContext.pushMessage(groupId, {
      type: "text",
      text: replyText,
    }));
}

async function handleLineEvent(event, queueOptions = {}) {
  const botIdentifier =
    queueOptions.botId || queueOptions.lineBotId || "default";
  const webhookEventId =
    event?.webhookEventId || event?.eventId || event?.replyToken || "";
  const source = event?.source || {};
  const sourceType = source?.type || "";
  const sourceId =
    sourceType === "group"
      ? source?.groupId
      : sourceType === "room"
        ? source?.roomId
        : source?.userId || "";

  let uniqueId = `${botIdentifier}:${webhookEventId}`;
  if (!webhookEventId) {
    uniqueId = `${botIdentifier}:${event?.type || ""}:${event?.timestamp || ""}:${sourceType}:${sourceId}`;
  }

  if (event?.message?.id) {
    uniqueId += "_" + event.message.id;
  }

  const channelAccessToken = queueOptions.channelAccessToken;
  const channelSecret = queueOptions.channelSecret;
  const botIdForHistory = queueOptions.botId || queueOptions.lineBotId || null;

  console.log(`[LOG] เริ่มประมวลผล event: ${uniqueId}`);

  if (processedIds.has(uniqueId)) {
    console.log(`[LOG] ข้าม event ที่ประมวลผลแล้ว: ${uniqueId}`);
    return;
  }
  processedIds.add(uniqueId);

  const eventSourceType = event?.source?.type || null;
  if (eventSourceType === "group" || eventSourceType === "room") {
    try {
      const captured = await captureLineGroupEvent(event, queueOptions);
      if (captured?.groupId) {
        console.log(
          `[LINE Group] Captured ${captured.sourceType} ${captured.groupId} (bot ${captured.botId})`,
        );
      }
    } catch (err) {
      console.warn(
        "[LINE Group] Capture error:",
        err?.message || err,
      );
    }

    if (event?.type === "message" && event?.message?.type === "image") {
      setImmediate(() => {
        handleLineGroupSlipOkImage(event, queueOptions).catch((err) => {
          console.error(
            "[SlipOK] Error processing group image:",
            err?.message || err,
          );
        });
      });
    }
    return;
  }

  const userId = event.source.userId || "unknownUser";
  console.log(`[LOG] รับคำขอจากผู้ใช้: ${userId}`);

  // กรณีตรวจจับคีย์เวิร์ด #DELETEMANY (ลบประวัติทั้งหมดทันที)
  if (event.type === "message" && event.message.type === "text") {
    const userMsg = event.message.text;
    console.log(
      `[LOG] ข้อความจากผู้ใช้: ${userMsg.substring(0, 100)}${userMsg.length > 100 ? "..." : ""}`,
    );

    if (userMsg.includes("#DELETEMANY")) {
      console.log(`[LOG] พบคำสั่ง #DELETEMANY จากผู้ใช้: ${userId}`);
      // เรียกฟังก์ชันล้างประวัติ
      await clearUserChatHistory(userId);
      // แจ้งผู้ใช้ว่าเราลบประวัติเรียบร้อยแล้ว
      if (event.replyToken) {
        try {
          await sendMessage(
            event.replyToken,
            "ลบประวัติสนทนาเรียบร้อยแล้ว!",
            userId,
            true,
            channelAccessToken,
            channelSecret,
          );
        } catch (error) {
          console.error(
            "[LOG] ไม่สามารถส่งข้อความยืนยันการลบประวัติได้:",
            error,
          );
        }
      }
      console.log(`[LOG] ลบประวัติสนทนาของผู้ใช้ ${userId} เรียบร้อยแล้ว`);
      // ไม่ต้องบันทึกข้อความใหม่ หรือเข้าคิวใด ๆ ทั้งสิ้น -> return ออกได้เลย
      return;
    }

    // toggle แอดมิน (ตอบทันที)
    if (userMsg === "สวัสดีค่า แอดมิน Venus นะคะ จะมาดำเนินเรื่องต่อ") {
      console.log(`[LOG] พบคำสั่งเปลี่ยนเป็นโหมดแอดมินสำหรับผู้ใช้: ${userId}`);
      await setUserStatus(userId, false);
      if (event.replyToken) {
        try {
          await sendMessage(
            event.replyToken,
            "แอดมิน Venus สวัสดีค่ะ",
            userId,
            true,
            channelAccessToken,
            channelSecret,
          );
        } catch (error) {
          console.error("[LOG] ไม่สามารถส่งข้อความโหมดแอดมินได้:", error);
        }
      }
      await saveChatHistory(
        userId,
        userMsg,
        "แอดมิน Venus สวัสดีค่ะ",
        "line",
        botIdForHistory,
      );
      console.log(`[LOG] เปลี่ยนเป็นโหมดแอดมินเรียบร้อยแล้ว`);
      return;
    } else if (userMsg === "ขอนุญาตส่งต่อให้ทางแอดมินประจำสนทนาต่อนะคะ") {
      console.log(`[LOG] พบคำสั่งเปลี่ยนเป็นโหมด AI สำหรับผู้ใช้: ${userId}`);
      await setUserStatus(userId, true);
      if (event.replyToken) {
        try {
          await sendMessage(
            event.replyToken,
            "แอดมิน Venus ขอตัวก่อนนะคะ",
            userId,
            true,
            channelAccessToken,
            channelSecret,
          );
        } catch (error) {
          console.error("[LOG] ไม่สามารถส่งข้อความโหมด AI ได้:", error);
        }
      }
      await saveChatHistory(
        userId,
        userMsg,
        "แอดมิน Venus ขอตัวก่อนนะคะ",
        "line",
        botIdForHistory,
      );
      console.log(`[LOG] เปลี่ยนเป็นโหมด AI เรียบร้อยแล้ว`);
      return;
    }
  }

  // กรณีอื่น -> ใส่คิว
  if (event.type === "message") {
    const message = event.message;
    let itemToQueue = { replyToken: event.replyToken };

    if (message.type === "text") {
      console.log(`[LOG] เพิ่มข้อความเข้าคิว สำหรับผู้ใช้: ${userId}`);
      itemToQueue.data = { type: "text", text: message.text };
      await addToQueue(userId, itemToQueue, {
        ...queueOptions,
        platform: "line",
      });
    } else if (message.type === "image") {
      console.log(`[LOG] ได้รับรูปภาพจากผู้ใช้: ${userId}, กำลังประมวลผล...`);

      try {
        const lineClientFromContext =
          queueOptions.lineClient ||
          (await getLineClientForContext(botIdForHistory));
        if (!lineClientFromContext) {
          console.log(
            `[LOG] ไม่สามารถประมวลผลรูปภาพได้ - ต้องตั้งค่า Line Bot ก่อน`,
          );
          itemToQueue.data = {
            type: "text",
            text: "ขออภัย ระบบยังไม่พร้อมประมวลผลรูปภาพ กรุณาตั้งค่า Line Bot ก่อน",
          };
          await addToQueue(userId, itemToQueue, {
            ...queueOptions,
            platform: "line",
          });
          return;
        }

        const stream = await lineClientFromContext.getMessageContent(message.id);
        const buffers = [];
        for await (const chunk of stream) {
          buffers.push(chunk);
        }
        // รวม Buffer ต้นฉบับ
        const originalBuffer = Buffer.concat(buffers);
        console.log(`[LOG] ขนาดรูปภาพต้นฉบับ: ${originalBuffer.length} bytes`);

        let resizedBuffer;
        try {
          console.log(`[LOG] กำลังปรับขนาดและเพิ่มประสิทธิภาพรูปภาพ...`);

          // ปรับขนาดให้เหมาะสมกับ OpenAI Vision API (ลด token cost)
          resizedBuffer = await sharp(originalBuffer)
            .resize({
              width: 1024, // ขนาดที่เหมาะสมสำหรับ Vision API
              height: 1024, // จำกัดขนาดสูงสุด
              fit: "inside", // รักษาอัตราส่วน
              withoutEnlargement: true, // ไม่ขยายรูปเล็ก
            })
            .jpeg({
              quality: 85, // คุณภาพดีแต่ไฟล์ไม่ใหญ่เกินไป
              progressive: true,
            })
            .toBuffer();
          console.log(
            `[LOG] ปรับขนาดรูปภาพเรียบร้อย: ${resizedBuffer.length} bytes (ลดลง ${((1 - resizedBuffer.length / originalBuffer.length) * 100).toFixed(1)}%)`,
          );
        } catch (err) {
          console.error("[ERROR] ไม่สามารถปรับขนาดรูปภาพได้:", err.message);
          resizedBuffer = originalBuffer;
          console.log(`[LOG] ใช้รูปภาพต้นฉบับแทน`);
        }

        // ตรวจสอบขนาดไฟล์หลังการปรับขนาด
        const maxSize = 20 * 1024 * 1024; // 20MB limit
        if (resizedBuffer.length > maxSize) {
          console.log(
            `[LOG] รูปภาพใหญ่เกินไป (${(resizedBuffer.length / 1024 / 1024).toFixed(1)}MB), ปรับคุณภาพลง...`,
          );
          try {
            resizedBuffer = await sharp(resizedBuffer)
              .jpeg({ quality: 60 })
              .toBuffer();
            console.log(
              `[LOG] ปรับคุณภาพลงเรียบร้อย: ${resizedBuffer.length} bytes`,
            );
          } catch (err) {
            console.error("[ERROR] ไม่สามารถปรับคุณภาพรูปภาพได้:", err.message);
          }
        }

        // เปลี่ยนเป็น base64
        const base64Data = resizedBuffer.toString("base64");
        console.log(
          `[LOG] แปลงรูปภาพเป็น base64 เรียบร้อย: ${(base64Data.length / 1024).toFixed(1)}KB`,
        );

        // บันทึกเป็นรูปภาพเพื่อส่งต่อเข้าคิว พร้อมคำอธิบายที่ดีขึ้น
        itemToQueue.data = {
          type: "image",
          base64: base64Data,
          text: "ผู้ใช้ส่งรูปภาพมา โปรดดูรูปภาพและให้คำตอบที่เหมาะสม",
        };
        console.log(`[LOG] เพิ่มรูปภาพเข้าคิว สำหรับผู้ใช้: ${userId}`);
        await addToQueue(userId, itemToQueue, {
          ...queueOptions,
          platform: "line",
        });
      } catch (err) {
        console.error(
          "[ERROR] เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:",
          err.message,
        );
        // ส่งข้อความแจ้งเตือนกลับไปแทน
        itemToQueue.data = {
          type: "text",
          text: "เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองส่งรูปภาพใหม่อีกครั้ง",
        };
        await addToQueue(userId, itemToQueue, {
          ...queueOptions,
          platform: "line",
        });
      }
    } else if (message.type === "audio") {
      console.log(`[LOG] ได้รับไฟล์เสียงจากผู้ใช้: ${userId}`);
      try {
        const audioResponseSetting = await getSettingValue(
          "audioAttachmentResponse",
          DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
        );
        const replyText =
          audioResponseSetting || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
        const filteredReply = await filterMessage(replyText);

        if (event.replyToken) {
          try {
            await sendMessage(
              event.replyToken,
              filteredReply,
              userId,
              true,
              channelAccessToken,
              channelSecret,
            );
            console.log(
              `[LOG] ส่งข้อความตอบกลับสำหรับไฟล์เสียงให้ผู้ใช้ ${userId} แล้ว`,
            );
          } catch (error) {
            console.error(
              "[LOG] ไม่สามารถส่งข้อความตอบกลับไฟล์เสียงได้:",
              error,
            );
          }
        }

        const audioPayload = {
          type: "audio",
          messageId: message.id || null,
          duration: message.duration || null,
          contentProvider: message.contentProvider || null,
        };

        try {
          await saveChatHistory(
            userId,
            audioPayload,
            filteredReply,
            "line",
            botIdForHistory,
          );
        } catch (historyError) {
          console.error(
            "[LOG] ไม่สามารถบันทึกประวัติไฟล์เสียงได้:",
            historyError,
          );
        }
      } catch (audioError) {
        console.error("[LOG] เกิดข้อผิดพลาดในการจัดการไฟล์เสียง:", audioError);
      }
      return;
    } else if (message.type === "video") {
      console.log(`[LOG] ได้รับวิดีโอจากผู้ใช้: ${userId}`);
      itemToQueue.data = {
        type: "text",
        text: "ผู้ใช้ส่งไฟล์แนบประเภท: video",
      };
      console.log(
        `[LOG] เพิ่มการแจ้งเตือนวิดีโอเข้าคิว สำหรับผู้ใช้: ${userId}`,
      );
      await addToQueue(userId, itemToQueue, {
        ...queueOptions,
        platform: "line",
      });
    }
  }
  console.log(`[LOG] จบการประมวลผล event: ${uniqueId}`);
}

// ------------------------
// 15-min refresh schedule
// ------------------------
let lastUpdatedQuarter = "";
function schedule15MinRefresh() {
  setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const quarter = Math.floor(currentMinute / 15);
    const currentQuarterLabel = `${currentHour}-${quarter}`;

    if (
      currentMinute % 15 === 0 &&
      lastUpdatedQuarter !== currentQuarterLabel
    ) {
      console.log(
        "[DEBUG] It's a new 15-minute interval => refreshing sheet data & doc instructions...",
      );

      try {
        await fetchGoogleDocInstructions();
        sheetJSON = await fetchAllSheetsData(SPREADSHEET_ID);

        lastUpdatedQuarter = currentQuarterLabel;
        console.log(
          `[DEBUG] sheetJSON & googleDocInstructions updated at ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
        );
      } catch (err) {
        console.error("15-minute sheet update error:", err);
      }
    }
  }, 60 * 1000);
}

// ============================ Facebook Comment Reply System (v2) ============================

const FACEBOOK_POST_FIELDS =
  "id,from,message,permalink_url,created_time,full_picture,status_type,attachments{media_type,type,url,media}";

function buildDefaultReplyProfile() {
  return {
    mode: "off", // off | template | ai
    templateMessage: "",
    aiModel: "",
    systemPrompt: "",
    privateReplyTemplate: "",
    pullToChat: false,
    sendPrivateReply: false,
    isActive: false,
    status: "off",
    overridePageDefault: false,
  };
}

function isReplyProfileEmpty(profile) {
  if (!profile) return true;
  const defaults = buildDefaultReplyProfile();
  return (
    (profile.mode || defaults.mode) === "off" &&
    (profile.templateMessage || "") === "" &&
    (profile.aiModel || "") === "" &&
    (profile.systemPrompt || "") === "" &&
    (profile.privateReplyTemplate || "") === "" &&
    profile.pullToChat !== true &&
    profile.sendPrivateReply !== true &&
    !(
      profile.isActive === true ||
      profile.status === "active" ||
      profile.overridePageDefault === true
    )
  );
}

function normalizeBotIdValue(bot) {
  const candidate = bot?._id || bot?.botId || bot;
  return ObjectId.isValid(candidate) ? new ObjectId(candidate) : candidate;
}

function mapFacebookAttachments(attachments) {
  if (!attachments || !Array.isArray(attachments.data)) return [];
  return attachments.data
    .map((att) => {
      const url =
        att?.url ||
        att?.media?.image?.src ||
        att?.media?.source ||
        att?.permalink_url ||
        att?.target?.url ||
        "";
      return {
        type: att?.type || att?.media_type || "",
        url,
      };
    })
    .filter((att) => att.url);
}

async function fetchFacebookPostDetails(postId, accessToken) {
  const url = `https://graph.facebook.com/v18.0/${postId}`;
  const response = await axios.get(url, {
    params: {
      fields: FACEBOOK_POST_FIELDS,
      access_token: accessToken,
    },
  });
  return response.data;
}

async function upsertFacebookPost(db, bot, postId, source = "webhook") {
  const botId = normalizeBotIdValue(bot);
  const pageId = bot?.pageId || botId?.toString?.() || "";
  const coll = db.collection("facebook_page_posts");
  const now = new Date();

  let fbPost = null;
  try {
    fbPost = await fetchFacebookPostDetails(postId, bot?.accessToken);
  } catch (err) {
    console.warn(
      `[Facebook Post] ไม่สามารถดึงโพสต์ ${postId}:`,
      err?.response?.data || err?.message || err,
    );
  }

  const existing = await coll.findOne({ botId, postId });
  const replyProfile = existing?.replyProfile || buildDefaultReplyProfile();

  const updateDoc = {
    botId,
    pageId,
    postId,
    message: fbPost?.message || existing?.message || "",
    permalink: fbPost?.permalink_url || existing?.permalink || "",
    createdTime: fbPost?.created_time
      ? new Date(fbPost.created_time)
      : existing?.createdTime || null,
    attachments: mapFacebookAttachments(
      fbPost?.attachments || existing?.attachments,
    ),
    statusType: fbPost?.status_type || existing?.statusType || null,
    fullPicture: fbPost?.full_picture || existing?.fullPicture || null,
    capturedFrom: source,
    syncedAt: now,
    updatedAt: now,
  };

  await coll.updateOne(
    { botId, postId },
    {
      $set: updateDoc,
      $setOnInsert: {
        replyProfile,
        createdAt: now,
        commentCount: 0,
      },
    },
    { upsert: true },
  );

  return coll.findOne({ botId, postId });
}

async function sendCommentReply(commentId, message, accessToken) {
  try {
    const url = `https://graph.facebook.com/v22.0/${commentId}/comments`;
    const normalizedMessage = normalizeOutgoingText(message);
    const response = await axios.post(
      url,
      { message: normalizedMessage },
      { params: { access_token: accessToken } },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Facebook Comment] Error sending reply:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function sendPrivateMessageFromComment(commentId, message, accessToken) {
  try {
    const url = `https://graph.facebook.com/v22.0/${commentId}/private_replies`;
    const normalizedMessage = normalizeOutgoingText(message);
    const response = await axios.post(
      url,
      { message: normalizedMessage },
      { params: { access_token: accessToken } },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Facebook Comment] Error sending private message:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function processCommentWithAI(commentText, systemPrompt, aiModel, botId = null) {
  const startTime = Date.now();

  try {
    // Get per-bot API key or fallback to default
    const apiKeyToUse = await getOpenAIApiKeyForBot(botId, 'facebook');

    if (!apiKeyToUse.key) {
      console.error("[Facebook Comment AI] No API key available");
      return "";
    }

    if (!commentText || commentText.trim().length === 0) {
      console.warn("[Facebook Comment AI] Empty comment text");
      return "";
    }

    const openai = new OpenAI({ apiKey: apiKeyToUse.key });
    const messages = [
      {
        role: "system",
        content:
          systemPrompt || "คุณคือผู้ช่วยตอบคอมเมนต์ Facebook อย่างเป็นมิตร",
      },
      { role: "user", content: commentText },
    ];

    console.log("[Facebook Comment AI] Calling OpenAI:", {
      model: aiModel || "gpt-4o-mini",
      commentLength: commentText.length,
    });

    const completion = await openai.chat.completions.create({
      model: aiModel || "gpt-4o-mini",
      messages: messages,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply || reply.trim().length === 0) {
      console.error("[Facebook Comment AI] Empty response from AI");
      return "";
    }

    const processingTime = Date.now() - startTime;
    console.log("[Facebook Comment AI] Success:", {
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens,
      processingTime: `${processingTime}ms`,
    });

    // Log usage to database
    if (completion.usage) {
      await logOpenAIUsage({
        apiKeyId: apiKeyToUse.id,
        botId,
        platform: 'facebook',
        model: aiModel || 'gpt-4o-mini',
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
        functionName: 'processCommentWithAI'
      });
    }

    return reply.trim();
  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error("[Facebook Comment AI] Error:", {
      message: error.message,
      code: error.code,
      processingTime: `${processingTime}ms`,
    });

    if (error.code === "insufficient_quota") return "";
    if (error.code === "rate_limit_exceeded") return "";
    if (error.code === "invalid_api_key") return "";

    return "";
  }
}

async function getPageDefaultPolicy(db, bot) {
  const botId = normalizeBotIdValue(bot);
  const policy = await db.collection("facebook_comment_policies").findOne({
    botId,
    scope: "page_default",
  });
  if (!policy) return null;
  return {
    ...buildDefaultReplyProfile(),
    ...policy,
    isActive: policy.isActive === true || policy.status === "active",
  };
}

async function resolveCommentPolicyForPost(db, bot, postDoc) {
  const pagePolicy = await getPageDefaultPolicy(db, bot);
  const basePolicy = pagePolicy
    ? { ...buildDefaultReplyProfile(), ...pagePolicy }
    : buildDefaultReplyProfile();

  const postProfile = postDoc?.replyProfile;
  if (
    !postProfile ||
    (postProfile.overridePageDefault !== true && isReplyProfileEmpty(postProfile))
  ) {
    return basePolicy;
  }

  const merged = {
    ...basePolicy,
    ...postProfile,
  };

  const postActive =
    postProfile.isActive === true || postProfile.status === "active";
  merged.isActive =
    postProfile.overridePageDefault === true
      ? postActive
      : postActive || merged.isActive === true;
  merged.status = merged.isActive
    ? "active"
    : postProfile.status || merged.status || "off";

  return merged;
}

async function recordCommentEvent(db, eventDoc) {
  const coll = db.collection("facebook_comment_events");
  await coll.updateOne(
    { commentId: eventDoc.commentId },
    { $setOnInsert: eventDoc },
    { upsert: true },
  );
}

// Admin page to manage Facebook posts/comment policies
app.get("/admin/facebook-posts", requireAdmin, async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const facebookBots = await db
      .collection("facebook_bots")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const selectedBotId =
      facebookBots && facebookBots.length > 0
        ? facebookBots[0]._id.toString()
        : null;

    res.render("admin-facebook-posts", {
      facebookBots,
      selectedBotId,
      current: "facebook-posts",
    });
  } catch (err) {
    console.error("Error loading Facebook posts page:", err);
    res.render("admin-facebook-posts", {
      facebookBots: [],
      selectedBotId: null,
      error: "ไม่สามารถโหลดข้อมูลได้",
      current: "facebook-posts",
    });
  }
});

// Webhook handler for Facebook comments (new pipeline)
async function handleFacebookComment(
  pageId,
  postId,
  commentData,
  accessToken,
  bot,
) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const eventsColl = db.collection("facebook_comment_events");
  const postsColl = db.collection("facebook_page_posts");

  const commentId = commentData.id;
  const commentText = commentData.message || "";
  const commenterId = commentData.from?.id;
  const commenterName = commentData.from?.name || "ผู้ใช้ Facebook";

  // dedupe
  const existingEvent = await eventsColl.findOne({ commentId });
  if (existingEvent) {
    console.log(`[Facebook Comment] Skip duplicate comment ${commentId}`);
    return;
  }

  const botId = normalizeBotIdValue(bot);
  const baseEvent = {
    commentId,
    postId,
    botId,
    pageId,
    commentText,
    commenterId,
    commenterName,
    createdAt: new Date(),
  };

  let postDoc = null;
  try {
    postDoc = await upsertFacebookPost(db, bot, postId, "webhook");
    if (postDoc?._id) {
      await postsColl.updateOne(
        { _id: postDoc._id },
        { $set: { lastCommentAt: new Date(), updatedAt: new Date() } },
      );
    }
  } catch (err) {
    console.error(
      "[Facebook Comment] ไม่สามารถ upsert โพสต์:",
      err?.message || err,
    );
  }

  if (commenterId) {
    try {
      await ensureFacebookProfileDisplayName(commenterId, accessToken);
    } catch (profileErr) {
      console.warn(
        `[Facebook Comment] ไม่สามารถอัปเดตโปรไฟล์ ${commenterId}:`,
        profileErr?.message || profileErr,
      );
    }
  }

  // Prevent self-reply loop: Check if commenter is the page itself
  if (commenterId === pageId) {
    console.log(`[Facebook Comment] Skip comment from page itself ${commentId}`);
    return;
  }

  const policy = await resolveCommentPolicyForPost(db, bot, postDoc);
  const shouldReply =
    policy?.isActive === true && policy.mode && policy.mode !== "off";

  if (!shouldReply) {
    await recordCommentEvent(db, {
      ...baseEvent,
      replyMode: policy?.mode || "off",
      action: "skipped",
      reason: "policy_off",
    });
    return;
  }

  let replyMessage = "";
  if (policy.mode === "template") {
    replyMessage = policy.templateMessage || "";
  } else if (policy.mode === "ai") {
    replyMessage = await processCommentWithAI(
      commentText,
      policy.systemPrompt,
      policy.aiModel,
      botId
    );
  }
  replyMessage = (replyMessage || "").trim();

  if (!replyMessage) {
    await recordCommentEvent(db, {
      ...baseEvent,
      replyMode: policy.mode,
      action: "skipped",
      reason: "empty_reply",
    });
    return;
  }

  let action = "replied";
  let reason = "";
  let privateSent = false;

  try {
    await sendCommentReply(commentId, replyMessage, accessToken);
    console.log(`[Facebook Comment] Replied to comment ${commentId}`);
  } catch (err) {
    action = "failed";
    reason = err?.response?.data?.error?.message || err?.message || "reply_failed";
  }

  const shouldSendPrivateReply = policy.pullToChat || policy.sendPrivateReply;
  if (shouldSendPrivateReply) {
    const privateMessageRaw =
      policy.privateReplyTemplate && policy.privateReplyTemplate.trim()
        ? policy.privateReplyTemplate.trim()
        : shouldSendPrivateReply && replyMessage
          ? replyMessage
          : "";
    const privateFallback = `สวัสดีคุณ ${commenterName} ขอบคุณที่สนใจ สามารถทักแชทต่อได้เลยนะครับ`;
    const privateMessage = (privateMessageRaw || privateFallback).replace(
      /\{\{\s*name\s*\}\}/gi,
      commenterName,
    );
    try {
      // Use specific function for private replies to comments
      await sendPrivateMessageFromComment(commentId, privateMessage, accessToken);
      privateSent = true;
      console.log(`[Facebook Comment] Sent private reply to ${commentId}`);
    } catch (err) {
      console.error(
        `[Facebook Comment] Error sending private message:`,
        err?.response?.data || err.message
      );
      if (action !== "failed") {
        // Don't mark entire action as failed if only private reply failed, but log it
        reason = "private_reply_failed: " + (err?.response?.data?.error?.message || err?.message);
      }
    }

    if (policy.pullToChat && commenterId) {
      try {
        const chatColl = db.collection("chat_history");
        const existingChat = await chatColl.findOne(
          buildChatHistoryUserQuery(commenterId, {
            platform: "facebook",
            botId: botId,
          }),
        );

        if (!existingChat) {
          const welcomeDoc = {
            senderId: commenterId,
            role: "assistant",
            content: privateMessage,
            timestamp: new Date(),
            source: "comment_pull",
            platform: "facebook",
            botId: botId,
          };
          const welcomeInsert = await chatColl.insertOne(welcomeDoc);
          if (welcomeInsert?.insertedId) {
            welcomeDoc._id = welcomeInsert.insertedId;
          }
        }
      } catch (pullErr) {
        console.error(
          "[Facebook Comment] Error in pull-to-chat:",
          pullErr?.message || pullErr,
        );
      }
    } else if (policy.pullToChat && !commenterId) {
      console.warn(
        `[Facebook Comment] Skip pull-to-chat for ${commentId}: missing commenterId`,
      );
    }
  }

  await recordCommentEvent(db, {
    ...baseEvent,
    replyMode: policy.mode,
    replyText: replyMessage,
    action,
    reason,
  });

  if (postDoc?._id) {
    const updatePayload = {
      $set: { updatedAt: new Date() },
      $inc: { commentCount: 1 },
    };

    if (action === "replied") {
      updatePayload.$set.lastReplyAt = new Date();
      updatePayload.$set.lastCommentAt = new Date();
      if (privateSent) {
        updatePayload.$set.pulledToChat = true;
      }
    }

    try {
      await postsColl.updateOne({ _id: postDoc._id }, updatePayload);
    } catch (err) {
      console.error(
        "[Facebook Comment] ไม่สามารถอัปเดตสถิติโพสต์:",
        err?.message || err,
      );
    }
  }
}

// ============================================================================
// NEW INSTRUCTION SYSTEM V2 - Instructions with embedded Data Items
// ============================================================================

// Helper: Generate unique item ID
function generateDataItemId() {
  return `item_${crypto.randomBytes(8).toString("hex")}`;
}

// Helper: Get all instructions v2
async function getInstructionsV2() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions_v2");
  const cursor = coll.find({}).sort({ createdAt: -1 });
  const instructions = await cursor.toArray();
  return instructions.map((instruction) => ({
    ...instruction,
    _id: instruction._id.toString(),
  }));
}

// API: List all instructions
app.get("/api/instructions-v2", async (req, res) => {
  try {
    const instructions = await getInstructionsV2();
    res.json({ success: true, instructions });
  } catch (err) {
    console.error("Error fetching instructions v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get one instruction
app.get("/api/instructions-v2/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");
    const instruction = await coll.findOne({ _id: toObjectId(id) });

    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true, instruction: { ...instruction, _id: instruction._id.toString() } });
  } catch (err) {
    console.error("Error fetching instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Create new instruction
app.post("/api/instructions-v2", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อ Instruction" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const now = new Date();
    const instruction = {
      instructionId: generateInstructionId(),
      name: name.trim(),
      description: (description || "").trim(),
      dataItems: [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const result = await coll.insertOne(instruction);
    instruction._id = result.insertedId.toString();

    res.json({ success: true, instruction });
  } catch (err) {
    console.error("Error creating instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Update instruction (name, description only)
app.put("/api/instructions-v2/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();

    const result = await coll.updateOne(
      { _id: toObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const instruction = await coll.findOne({ _id: toObjectId(id) });
    res.json({ success: true, instruction: { ...instruction, _id: instruction._id.toString() } });
  } catch (err) {
    console.error("Error updating instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete instruction
app.delete("/api/instructions-v2/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const result = await coll.deleteOne({ _id: toObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Duplicate instruction
app.post("/api/instructions-v2/:id/duplicate", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const original = await coll.findOne({ _id: toObjectId(id) });
    if (!original) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction ต้นฉบับ" });
    }

    const escapeRegex = (value) =>
      String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const requestedName = typeof name === "string" ? name.trim() : "";
    const baseName = (original.name || "").trim() || "ไม่มีชื่อ";
    const finalName = (requestedName || `${baseName} (สำเนา)`).trim();

    if (!finalName) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุชื่อ Instruction ใหม่",
      });
    }

    const existingByName = await coll.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(finalName)}$`, "i") },
    });
    if (existingByName) {
      return res.status(409).json({
        success: false,
        error: "ชื่อ Instruction นี้ถูกใช้แล้ว กรุณาใช้ชื่ออื่น",
      });
    }

    const now = new Date();
    const duplicate = {
      instructionId: generateInstructionId(),
      name: finalName,
      description: original.description || "",
      dataItems: (original.dataItems || []).map(item => ({
        ...item,
        itemId: generateDataItemId(),
        createdAt: now,
        updatedAt: now
      })),
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const result = await coll.insertOne(duplicate);
    duplicate._id = result.insertedId.toString();

    res.json({ success: true, instruction: duplicate });
  } catch (err) {
    console.error("Error duplicating instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Add data item to instruction
app.post("/api/instructions-v2/:id/data-items", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, content, data } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อชุดข้อมูล" });
    }

    if (!type || !["text", "table"].includes(type)) {
      return res.status(400).json({ success: false, error: "ประเภทไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: toObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const now = new Date();
    const newItem = {
      itemId: generateDataItemId(),
      title: title.trim(),
      type,
      content: type === "text" ? (content || "") : "",
      data: type === "table" ? (data || { columns: [], rows: [] }) : null,
      order: (instruction.dataItems || []).length + 1,
      createdAt: now,
      updatedAt: now
    };

    const result = await coll.updateOne(
      { _id: toObjectId(id) },
      {
        $push: { dataItems: newItem },
        $set: { updatedAt: now }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true, dataItem: newItem });
  } catch (err) {
    console.error("Error adding data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Reorder data items
// NOTE: Declare before the :itemId route below so Express does not treat "reorder" as an itemId.
app.put("/api/instructions-v2/:id/data-items/reorder", async (req, res) => {
  try {
    const { id } = req.params;
    const { itemIds } = req.body; // Array of itemIds in new order

    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ success: false, error: "itemIds ต้องเป็น array" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: toObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    // Reorder dataItems based on itemIds array
    const reorderedItems = itemIds.map((itemId, index) => {
      const item = (instruction.dataItems || []).find(i => i.itemId === itemId);
      if (item) {
        return { ...item, order: index + 1 };
      }
      return null;
    }).filter(Boolean);

    await coll.updateOne(
      { _id: toObjectId(id) },
      {
        $set: {
          dataItems: reorderedItems,
          updatedAt: new Date()
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error reordering data items:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Update data item
app.put("/api/instructions-v2/:id/data-items/:itemId", async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { title, content, data } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: toObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const itemIndex = (instruction.dataItems || []).findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: "ไม่พบชุดข้อมูล" });
    }

    const now = new Date();
    const updateFields = {};
    if (title !== undefined) updateFields[`dataItems.${itemIndex}.title`] = title.trim();
    if (content !== undefined) updateFields[`dataItems.${itemIndex}.content`] = content;
    if (data !== undefined) updateFields[`dataItems.${itemIndex}.data`] = data;
    updateFields[`dataItems.${itemIndex}.updatedAt`] = now;
    updateFields.updatedAt = now;

    await coll.updateOne(
      { _id: toObjectId(id) },
      { $set: updateFields }
    );

    const updatedInstruction = await coll.findOne({ _id: toObjectId(id) });
    const updatedItem = updatedInstruction.dataItems[itemIndex];

    res.json({ success: true, dataItem: updatedItem });
  } catch (err) {
    console.error("Error updating data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete data item
app.delete("/api/instructions-v2/:id/data-items/:itemId", async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const result = await coll.updateOne(
      { _id: toObjectId(id) },
      {
        $pull: { dataItems: { itemId } },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Duplicate data item
app.post("/api/instructions-v2/:id/data-items/:itemId/duplicate", async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: toObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const originalItem = (instruction.dataItems || []).find(item => item.itemId === itemId);
    if (!originalItem) {
      return res.status(404).json({ success: false, error: "ไม่พบชุดข้อมูล" });
    }

    const now = new Date();
    const duplicateItem = {
      ...originalItem,
      itemId: generateDataItemId(),
      title: `${originalItem.title} (สำเนา)`,
      order: (instruction.dataItems || []).length + 1,
      createdAt: now,
      updatedAt: now
    };

    await coll.updateOne(
      { _id: toObjectId(id) },
      {
        $push: { dataItems: duplicateItem },
        $set: { updatedAt: now }
      }
    );

    res.json({ success: true, dataItem: duplicateItem });
  } catch (err) {
    console.error("Error duplicating data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Preview instruction (build system prompt)
app.get("/api/instructions-v2/:id/preview", async (req, res) => {
  try {
    const { id } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: toObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    // Build system prompt from data items
    let systemPrompt = "";
    const dataItems = instruction.dataItems || [];

    for (const item of dataItems) {
      systemPrompt += `\n\n${"=".repeat(60)}\n\n`;
      systemPrompt += `## ${item.title}\n\n`;

      if (item.type === "text") {
        systemPrompt += item.content || "";
      } else if (item.type === "table" && item.data) {
        const { columns, rows } = item.data;
        if (Array.isArray(columns) && Array.isArray(rows)) {
          // Build markdown table
          systemPrompt += `| ${columns.join(" | ")} |\n`;
          systemPrompt += `| ${columns.map(() => "---").join(" | ")} |\n`;
          rows.forEach(row => {
            if (Array.isArray(row)) {
              systemPrompt += `| ${row.join(" | ")} |\n`;
            }
          });
        }
      }
    }

    systemPrompt = systemPrompt.trim();

    // Calculate approximate token count (rough estimate: 1 token ≈ 4 characters)
    const charCount = systemPrompt.length;
    const tokenCount = Math.ceil(charCount / 4);

    res.json({
      success: true,
      preview: systemPrompt,
      stats: {
        dataItemCount: dataItems.length,
        charCount,
        tokenCount
      }
    });
  } catch (err) {
    console.error("Error previewing instruction:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Export Instructions V2 to Excel
app.get("/api/instructions-v2/export", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instructions = await coll.find({}).sort({ createdAt: -1 }).toArray();

    // 1. Instructions Sheet
    const instructionRows = instructions.map(inst => ({
      "Instruction ID": inst._id.toString(),
      "Name": inst.name,
      "Description": inst.description || "",
      "Created At": inst.createdAt ? new Date(inst.createdAt).toISOString() : "",
      "Updated At": inst.updatedAt ? new Date(inst.updatedAt).toISOString() : ""
    }));

    // 2. Data Items Sheet
    const dataItemRows = [];
    instructions.forEach(inst => {
      if (inst.dataItems && Array.isArray(inst.dataItems)) {
        inst.dataItems.forEach(item => {
          let contentData = "";
          if (item.type === "text") {
            contentData = item.content || "";
          } else if (item.type === "table") {
            contentData = JSON.stringify(item.data || {});
          }

          dataItemRows.push({
            "Instruction ID": inst._id.toString(),
            "Instruction Name": inst.name,
            "Item ID": item.itemId,
            "Item Title": item.title,
            "Item Type": item.type,
            "Content/Data": contentData,
            "Order": item.order || 0
          });
        });
      }
    });

    const wb = XLSX.utils.book_new();

    // Add Instructions Sheet
    const wsInstructions = XLSX.utils.json_to_sheet(instructionRows);
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

    // Add DataItems Sheet
    const wsDataItems = XLSX.utils.json_to_sheet(dataItemRows);
    XLSX.utils.book_append_sheet(wb, wsDataItems, "DataItems");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="instructions_export_${moment().format('YYYYMMDD_HHmm')}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);

  } catch (err) {
    console.error("Error exporting instructions:", err);
    res.status(500).send("Error exporting instructions: " + err.message);
  }
});

// API: Preview Import Sheets (New Design)
app.post("/api/instructions-v2/import/preview-sheets", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "กรุณาอัพโหลดไฟล์ Excel" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const service = new InstructionDataService(db);

    // Save buffer to temp file
    const tempDir = os.tmpdir();
    const token = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.xlsx`;
    const filePath = path.join(tempDir, token);

    fs.writeFileSync(filePath, req.file.buffer);

    const previews = service.previewImportSheets(filePath);

    // Get list of existing instructions for mapping
    const instructions = await db.collection("instructions_v2").find({}, { projection: { _id: 1, name: 1 } }).toArray();

    res.json({
      success: true,
      previews,
      fileToken: token,
      existingInstructions: instructions
    });

  } catch (err) {
    console.error("Error previewing import:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Execute Import Sheets (New Design)
app.post("/api/instructions-v2/import/execute-sheets", async (req, res) => {
  try {
    const { mappings, fileToken } = req.body;

    if (!fileToken || !mappings) {
      return res.status(400).json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, fileToken);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: "ไฟล์หมดอายุหรือถูกลบไปแล้ว กรุณาอัพโหลดใหม่" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const service = new InstructionDataService(db);

    const results = await service.executeImport(mappings, filePath);

    // Clean up
    try { fs.unlinkSync(filePath); } catch (e) { }

    res.json({ success: true, results });

  } catch (err) {
    console.error("Error executing import:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Export Sheets (New Design)
app.post("/api/instructions-v2/export-sheets", async (req, res) => {
  try {
    const { instructionIds } = req.body;

    if (!instructionIds || !Array.isArray(instructionIds) || instructionIds.length === 0) {
      return res.status(400).json({ success: false, error: "กรุณาเลือก Instruction ที่ต้องการส่งออก" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const service = new InstructionDataService(db);

    const buffer = await service.exportInstructions(instructionIds);

    const filename = `instructions_export_${moment().format('YYYYMMDD_HHmm')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (err) {
    console.error("Error exporting sheets:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// END NEW INSTRUCTION SYSTEM V2
// ============================================================================

// ============================================================================
// AUTO MIGRATION: instructions → instructions_v2
// ============================================================================

async function migrateToInstructionsV2() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const migrationLogsColl = db.collection("migration_logs");
    const libraryColl = db.collection("instruction_library");
    const newColl = db.collection("instructions_v2");

    // ตรวจสอบว่า migrate แล้วหรือยัง
    const migrationLog = await migrationLogsColl.findOne({
      migration: "instructions_to_v2"
    });

    if (migrationLog && migrationLog.completed) {
      console.log("[Migration] Instructions V2: Already migrated ✓");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔄 Starting Auto-Migration: Instruction Library → Instructions V2");
    console.log("=".repeat(60));

    // ตรวจสอบว่ามีข้อมูลใน instructions_v2 อยู่แล้วหรือไม่
    const v2Count = await newColl.countDocuments();
    if (v2Count > 0) {
      console.log(`[Migration] Instructions V2 already has ${v2Count} documents`);
      console.log("[Migration] Skipping migration to avoid data loss");

      // บันทึกว่า migrate แล้ว
      await migrationLogsColl.updateOne(
        { migration: "instructions_to_v2" },
        {
          $set: {
            migration: "instructions_to_v2",
            completed: true,
            skipped: true,
            reason: "instructions_v2 already has data",
            completedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log("=".repeat(60) + "\n");
      return;
    }

    // ดึงข้อมูลจาก instruction_library
    const libraries = await libraryColl.find({}).toArray();

    if (libraries.length === 0) {
      console.log("[Migration] No instruction libraries found. Nothing to migrate.");

      // บันทึกว่า migrate แล้ว (แต่ไม่มีข้อมูล)
      await migrationLogsColl.updateOne(
        { migration: "instructions_to_v2" },
        {
          $set: {
            migration: "instructions_to_v2",
            completed: true,
            skipped: true,
            reason: "no data to migrate",
            completedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log("=".repeat(60) + "\n");
      return;
    }

    console.log(`[Migration] Found ${libraries.length} instruction libraries to migrate`);

    // สร้าง Instruction ใหม่สำหรับแต่ละ library
    const now = new Date();
    const createdInstructions = [];
    let totalDataItems = 0;

    for (const library of libraries) {
      // สร้างชื่อจาก library.name หรือ library.date
      let instructionName = library.name || library.displayDate || library.date;

      // ถ้าไม่มี name ให้สร้างชื่อจาก date
      if (!library.name && library.date) {
        // แปลง date จาก "2024-01-15_manual_14-30-00" เป็นรูปแบบที่อ่านง่าย
        const dateMatch = library.date.match(/^(\d{4})-(\d{2})-(\d{2})_(.+?)_(\d{2})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          const [, year, month, day, type, hour, min, sec] = dateMatch;
          const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
            'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          const monthName = thaiMonths[parseInt(month) - 1] || month;
          const typeLabel = type === 'manual' ? 'บันทึกเอง' : type === 'auto' ? 'อัตโนมัติ' : type;
          instructionName = `Library: ${day} ${monthName} ${year} - ${hour}:${min} (${typeLabel})`;
        } else {
          instructionName = `Library: ${library.date}`;
        }
      }

      // แปลง library.instructions เป็น dataItems
      const instructions = library.instructions || [];
      const dataItems = instructions.map((old, index) => {
        const item = {
          itemId: generateDataItemId(),
          title: old.title || `ชุดข้อมูลที่ ${index + 1}`,
          type: old.type || "text",
          content: "",
          data: null,
          order: index + 1,
          createdAt: old.createdAt || now,
          updatedAt: old.updatedAt || now
        };

        if (old.type === "text") {
          item.content = old.content || "";
        } else if (old.type === "table") {
          item.data = old.data || { columns: [], rows: [] };
        }

        return item;
      });

      // สร้าง Instruction ใหม่
      const newInstruction = {
        instructionId: generateInstructionId(),
        name: instructionName,
        description: library.description || `Instruction จาก Library: ${library.date}`,
        dataItems: dataItems,
        usageCount: 0,
        libraryDate: library.date, // เก็บ reference ไว้
        createdAt: now,
        updatedAt: now
      };

      // Insert ลง instructions_v2
      const result = await newColl.insertOne(newInstruction);
      createdInstructions.push({
        id: result.insertedId.toString(),
        name: newInstruction.name,
        dataItemCount: dataItems.length
      });
      totalDataItems += dataItems.length;

      console.log(`[Migration] ✓ Created: "${newInstruction.name}"`);
      console.log(`[Migration]   ID: ${result.insertedId}`);
      console.log(`[Migration]   Data Items: ${dataItems.length}`);
    }

    // Backup collection เดิม
    try {
      const backupName = `instruction_library_backup_${Date.now()}`;
      await db.collection("instruction_library").rename(backupName);
      console.log(`[Migration] ✓ Backed up old library as: ${backupName}`);
    } catch (err) {
      console.warn(`[Migration] Could not backup old library:`, err.message);
    }

    // บันทึก migration log
    await migrationLogsColl.insertOne({
      migration: "instructions_to_v2",
      completed: true,
      instructionsCreated: createdInstructions,
      totalInstructions: createdInstructions.length,
      totalDataItems: totalDataItems,
      startedAt: now,
      completedAt: new Date()
    });

    console.log(`\n[Migration] ✓ Migration completed successfully!`);
    console.log(`[Migration] Created ${createdInstructions.length} Instructions with ${totalDataItems} total data items`);
    console.log("\n📝 Next Steps:");
    console.log("   1. Visit /admin/dashboard to see the new interface");
    console.log("   2. Edit or organize instructions as needed");
    console.log("   3. Configure bots to use the new instruction system");
    console.log("=".repeat(60) + "\n");

  } catch (err) {
    console.error("\n❌ [Migration] Failed to migrate instructions:", err);
    console.error("   The old data is still safe in 'instruction_library' collection");
    console.error("=".repeat(60) + "\n");
  }
}

// ============================================================================
// END AUTO MIGRATION
// ============================================================================

// ------------------------
// Start server
// ------------------------
// Migration: แปลง label เก่า (ภาษาอังกฤษ) ให้มี slug
async function migrateInstructionAssetsAddSlug() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    // หา assets ที่ยังไม่มี slug
    const assetsWithoutSlug = await coll
      .find({ slug: { $exists: false } })
      .toArray();

    if (assetsWithoutSlug.length === 0) {
      console.log("[Migration] ไม่มี assets ที่ต้อง migrate");
      return;
    }

    console.log(
      `[Migration] กำลัง migrate ${assetsWithoutSlug.length} assets...`,
    );

    for (const asset of assetsWithoutSlug) {
      const label = asset.label || "";
      // ถ้า label เดิมเป็นภาษาอังกฤษอยู่แล้ว ให้ใช้เป็น slug ได้เลย
      const slug = /^[a-z0-9_-]+$/i.test(label)
        ? label
        : generateSlugFromLabel(label);

      await coll.updateOne({ _id: asset._id }, { $set: { slug } });
    }

    console.log(
      `[Migration] migrate assets สำเร็จ: ${assetsWithoutSlug.length} รายการ`,
    );
  } catch (err) {
    console.error("[Migration] ข้อผิดพลาดในการ migrate assets:", err);
  }
}

// Migration: แปลง assets เดิม → สร้าง Default Collection และ assign ให้ทุกเพจ
async function migrateAssetsToCollections() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const assetsColl = db.collection("instruction_assets");
    const collectionsColl = db.collection("image_collections");
    const lineBotsColl = db.collection("line_bots");
    const facebookBotsColl = db.collection("facebook_bots");

    // เช็คว่ามี default collection อยู่แล้วหรือไม่
    const existingDefault = await collectionsColl.findOne({ isDefault: true });
    if (existingDefault) {
      console.log(
        "[Migration] มี default collection อยู่แล้ว ข้าม migration นี้",
      );
      return;
    }

    // ดึง assets ทั้งหมดจากระบบเดิม
    const allAssets = await assetsColl.find({}).toArray();

    if (allAssets.length === 0) {
      console.log("[Migration] ไม่มี assets ในระบบ ข้าม migration นี้");
      return;
    }

    console.log(`[Migration] พบ ${allAssets.length} รูปภาพในระบบเดิม`);

    // สร้าง Default Collection
    const defaultCollectionId = "default-collection-" + Date.now();
    const imageList = allAssets.map((asset) => ({
      label: asset.label,
      slug: asset.slug || asset.label,
      url: asset.url,
      thumbUrl: asset.thumbUrl || asset.url,
      description: asset.description || asset.alt || "",
      fileName: asset.fileName,
      assetId: asset._id.toString(),
    }));

    const defaultCollection = {
      _id: defaultCollectionId,
      name: "รูปภาพทั้งหมด (ระบบเดิม)",
      description: "รูปภาพทั้งหมดจากระบบเดิม - สร้างอัตโนมัติเมื่อ migrate",
      images: imageList,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collectionsColl.insertOne(defaultCollection);
    console.log(
      `[Migration] สร้าง default collection สำเร็จ: "${defaultCollection.name}"`,
    );

    // Assign collection นี้ให้ทุก bot
    const lineBots = await lineBotsColl.find({}).toArray();
    const facebookBots = await facebookBotsColl.find({}).toArray();

    let assignedCount = 0;

    // Assign ให้ LINE bots
    for (const bot of lineBots) {
      const currentCollections = bot.selectedImageCollections || [];
      if (!currentCollections.includes(defaultCollectionId)) {
        await lineBotsColl.updateOne(
          { _id: bot._id },
          {
            $set: {
              selectedImageCollections: [
                defaultCollectionId,
                ...currentCollections,
              ],
            },
          },
        );
        assignedCount++;
      }
    }

    // Assign ให้ Facebook bots
    for (const bot of facebookBots) {
      const currentCollections = bot.selectedImageCollections || [];
      if (!currentCollections.includes(defaultCollectionId)) {
        await facebookBotsColl.updateOne(
          { _id: bot._id },
          {
            $set: {
              selectedImageCollections: [
                defaultCollectionId,
                ...currentCollections,
              ],
            },
          },
        );
        assignedCount++;
      }
    }

    console.log(
      `[Migration] assign default collection ให้ ${assignedCount} bots สำเร็จ`,
    );
    console.log(`[Migration] ระบบ Image Collections พร้อมใช้งาน!`);
  } catch (err) {
    console.error(
      "[Migration] ข้อผิดพลาดในการ migrate assets to collections:",
      err,
    );
  }
}

// Error handling middleware - must be defined after all routes
app.use((err, req, res, next) => {
  console.error("[Express Error]", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
  });

  // Don't expose internal error details in production
  const isDev = process.env.NODE_ENV === "development";
  res.status(err.status || 500).json({
    error: isDev ? err.message : "Internal Server Error",
    ...(isDev && { stack: err.stack }),
  });
});

server.listen(PORT, async () => {
  console.log(`[LOG] เริ่มต้นเซิร์ฟเวอร์ที่พอร์ต ${PORT}...`);
  let dbReady = false;
  let client = null;
  try {
    console.log(`[LOG] กำลังเชื่อมต่อฐานข้อมูล MongoDB...`);
    client = await connectDB();
    dbReady = true;
    console.log(`[LOG] เชื่อมต่อฐานข้อมูลสำเร็จ`);
  } catch (err) {
    console.error(`[ERROR] ไม่สามารถเชื่อมต่อฐานข้อมูล MongoDB ได้:`, err);
  }

  if (!dbReady) {
    console.error(
      `[ERROR] ข้ามการเริ่มระบบพื้นหลัง เนื่องจากเชื่อมต่อฐานข้อมูลไม่สำเร็จ`,
    );
    return;
  }
  const db = client.db("chatbot");

  // รัน migration อัตโนมัติ (ไม่ให้บล็อกระบบพื้นหลังหากล้มเหลว)
  try {
    console.log(`[LOG] กำลังตรวจสอบและ migrate ข้อมูล...`);
    await migrateChatHistorySenderId(db);
    await migrateInstructionAssetsAddSlug();
    await migrateAssetsToCollections();
    await migrateToInstructionsV2(); // Auto-migrate to new instruction system
    console.log(`[LOG] Migration เสร็จสิ้น`);
  } catch (migrationError) {
    console.error(`[ERROR] Migration ล้มเหลว:`, migrationError);
  }

  // โหลด instructions จาก Google Doc (ไม่บล็อกการเริ่มระบบ)
  try {
    console.log(`[LOG] กำลังดึงข้อมูล instructions จาก Google Doc...`);
    await fetchGoogleDocInstructions();
    console.log(
      `[LOG] ดึงข้อมูล instructions สำเร็จ (${googleDocInstructions.length} อักขระ)`,
    );
  } catch (docError) {
    console.error(`[ERROR] ดึงข้อมูล instructions จาก Google Doc ไม่สำเร็จ:`, docError);
  }

  // ดึงข้อมูลทุกแท็บจาก Google Sheets (ไม่บล็อกระบบติดตาม/งานพื้นหลัง)
  try {
    console.log(`[LOG] เริ่มดึงข้อมูลทุกแท็บจาก Google Sheets...`);
    sheetJSON = await fetchAllSheetsDataNew(SPREADSHEET_ID);
    console.log(
      `[LOG] ดึงข้อมูลจาก Google Sheets เสร็จสิ้น ได้ข้อมูลจาก ${Object.keys(sheetJSON).length} แท็บ`,
    );
  } catch (sheetError) {
    console.error(`[ERROR] ดึงข้อมูลจาก Google Sheets ไม่สำเร็จ:`, sheetError);
  }

  // ตั้งค่าการรีเฟรชข้อมูลอัตโนมัติ (ไม่บล็อกระบบหลัก)
  try {
    console.log(`[LOG] ตั้งค่าการรีเฟรชข้อมูลอัตโนมัติ...`);
    scheduleDailyRefresh();
  } catch (refreshError) {
    console.error(`[ERROR] ตั้งค่าการรีเฟรชข้อมูลอัตโนมัติไม่สำเร็จ:`, refreshError);
  }

  // ทำให้แน่ใจว่ามีการตั้งค่าเริ่มต้นใน collection settings
  try {
    await ensureInstructionIdentifiers();
  } catch (settingsError) {
    console.error(`[ERROR] ensureInstructionIdentifiers ล้มเหลว:`, settingsError);
  }

  try {
    await ensureSettings();
  } catch (settingsError) {
    console.error(`[ERROR] ensureSettings ล้มเหลว:`, settingsError);
  }

  try {
    await ensureFollowUpIndexes();
  } catch (followUpIndexError) {
    console.error(`[ERROR] ensureFollowUpIndexes ล้มเหลว:`, followUpIndexError);
  }

  try {
    startFollowUpTaskWorker();
  } catch (followUpWorkerError) {
    console.error(`[ERROR] startFollowUpTaskWorker ล้มเหลว:`, followUpWorkerError);
  }

  try {
    await startNotificationSummaryScheduler();
  } catch (summaryError) {
    console.error(`[ERROR] startNotificationSummaryScheduler ล้มเหลว:`, summaryError);
  }

  console.log(`[LOG] เซิร์ฟเวอร์พร้อมให้บริการที่พอร์ต ${PORT}`);
});

// เพิ่มฟังก์ชันเพื่อเก็บและดึงประวัติการวิเคราะห์ Flow ของผู้ใช้
async function getUserFlowHistory(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("user_flow_history");
  const flowHistory = await coll.findOne({ senderId: userId });
  if (!flowHistory) {
    return {
      senderId: userId,
      flow: null,
      product_service_type: null,
      existing_info: {},
      last_analyzed: null,
    };
  }
  return flowHistory;
}

/**
 * ฟังก์ชันสำหรับส่งข้อความตอบกลับไปยังผู้ใช้ Line
 * @param {string} replyToken - reply token จาก Line event
 * @param {string} message - ข้อความที่ต้องการส่งตอบกลับ
 * @param {string} userId - ID ของผู้ใช้
 * @param {boolean} splitLongMessage - ควรแบ่งข้อความยาวหรือไม่
 */
async function sendMessage(
  replyToken,
  message,
  userId,
  splitLongMessage = false,
  channelAccessToken = null,
  channelSecret = null,
) {
  try {
    const normalizedMessage = normalizeOutgoingText(message);
    if (!normalizedMessage || normalizedMessage.trim() === "") {
      console.log("[DEBUG] Empty message, no reply needed");
      return;
    }

    // สร้าง Line Client ถ้าไม่มี หรือถ้ามี token ใหม่
    let client = lineClient;
    if (channelAccessToken && channelSecret) {
      client = createLineClient(channelAccessToken, channelSecret);
    } else if (!client) {
      console.error("[ERROR] ไม่มี Line Client และไม่มีการระบุ token");
      return;
    }

    // ตรวจสอบว่าข้อความยาวเกินขีดจำกัดของ Line หรือไม่
    // Line มีขีดจำกัด 5,000 อักขระต่อข้อความ แต่เราจะตั้งที่ 4,000 เพื่อความปลอดภัย
    const MAX_LENGTH = 4000;

    if (splitLongMessage && normalizedMessage.length > MAX_LENGTH) {
      // แบ่งข้อความที่ยาวออกเป็นส่วนๆ
      const parts = [];
      for (let i = 0; i < normalizedMessage.length; i += MAX_LENGTH) {
        parts.push(
          normalizedMessage.substring(
            i,
            Math.min(normalizedMessage.length, i + MAX_LENGTH),
          ),
        );
      }

      // ส่งข้อความที่แบ่งเป็นชุด
      await client.replyMessage(
        replyToken,
        parts.map((part) => ({
          type: "text",
          text: part,
        })),
      );
    } else {
      // ส่งข้อความปกติ
      await client.replyMessage(replyToken, {
        type: "text",
        text: normalizedMessage.substring(0, MAX_LENGTH), // ตัดข้อความให้ไม่เกินขีดจำกัด
      });
    }
  } catch (err) {
    console.error(`[ERROR] ไม่สามารถส่งข้อความถึงผู้ใช้ ${userId} ได้:`, err);
  }
}

async function saveUserFlowHistory(userId, flowAnalysis) {
  try {
    // ทำความสะอาด flowAnalysis โดยตัด markdown code block ออก (ถ้ามี)
    let cleanedFlowAnalysis = flowAnalysis;

    // ตรวจสอบว่ามีการเริ่มต้นด้วย ```json หรือ ``` หรือไม่
    if (cleanedFlowAnalysis.trim().startsWith("```")) {
      // ตัด ``` ออกจากตอนเริ่มต้น
      cleanedFlowAnalysis = cleanedFlowAnalysis.replace(
        /^```(?:json)?\s*\n/,
        "",
      );
      // ตัด ``` ออกจากตอนจบ
      cleanedFlowAnalysis = cleanedFlowAnalysis.replace(/\n\s*```\s*$/, "");
    }

    // แปลง flowAnalysis ที่เป็น string json เป็น object
    let flowData;
    try {
      flowData = JSON.parse(cleanedFlowAnalysis);
    } catch (e) {
      console.error("Error parsing flow analysis:", e);
      console.log("Cleaned flow analysis:", cleanedFlowAnalysis);
      return;
    }

    // ดึงข้อมูล Flow เดิมของผู้ใช้ (ถ้ามี)
    const oldFlowHistory = await getUserFlowHistory(userId);

    // เตรียมข้อมูล existing_info โดยรวมจากข้อมูลเดิมและข้อมูลใหม่
    const existingInfo = oldFlowHistory.existing_info || {};

    // อัพเดตข้อมูลจากการวิเคราะห์ใหม่
    if (flowData.existing_info && Array.isArray(flowData.existing_info)) {
      flowData.existing_info.forEach((info) => {
        // แยกข้อมูลในรูปแบบ "key: value" หรือแบบที่มีเฉพาะข้อมูล
        const match = info.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const [_, key, value] = match;
          existingInfo[key.trim()] = value.trim();
        } else {
          // กรณีมีแค่ข้อมูลโดยไม่ระบุประเภท ใช้ข้อมูลเป็น key
          existingInfo[info.trim()] = true;
        }
      });
    }

    const newFlowHistory = {
      senderId: userId,
      flow: flowData.flow || null,
      product_service_type: flowData.product_service_type || null,
      existing_info: existingInfo,
      missing_info: flowData.missing_info || [],
      next_steps: flowData.next_steps || null,
      last_analyzed: new Date(),
    };

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_flow_history");

    // ถ้ามีข้อมูลเดิมให้อัพเดต ถ้าไม่มีให้เพิ่มใหม่
    if (oldFlowHistory && oldFlowHistory.senderId) {
      await coll.updateOne({ senderId: userId }, { $set: newFlowHistory });
    } else {
      await coll.insertOne(newFlowHistory);
    }
  } catch (err) {
    console.error("Error saving flow history:", err);
  }
}

// === ฟังก์ชันโมเดลเล็ก: วิเคราะห์ Flow และข้อมูลที่ขาด (ฟังก์ชันใหม่ไม่มีการประกาศ openai ซ้ำซ้อน)
// (ลบฟังก์ชัน analyzeFlowGPT4oMini)
// ... existing code ...
// (ลบฟังก์ชัน analyzeImageWithAnotherModel)
// ... existing code ...

// เพิ่มฟังก์ชันใหม่สำหรับดึงข้อมูลทุกแท็บจาก Google Sheets
async function fetchAllSheetsDataNew(spreadsheetId) {
  console.log(
    `[LOG] เริ่มดึงข้อมูลจากทุกแท็บใน spreadsheet ${spreadsheetId}...`,
  );
  try {
    const sheetsApi = await getSheetsApi();
    console.log(`[LOG] เชื่อมต่อ Google Sheets API สำเร็จ`);

    // ดึงข้อมูลทุกแท็บจาก spreadsheet
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });
    console.log(`[LOG] ดึงข้อมูล metadata ของ spreadsheet สำเร็จ`);

    // ดึงรายชื่อแท็บทั้งหมด
    const allSheets = response.data.sheets.map(
      (sheet) => sheet.properties.title,
    );
    console.log(
      `[LOG] พบแท็บทั้งหมด ${allSheets.length} แท็บ: ${allSheets.join(", ")}`,
    );

    // ดึงข้อมูลจากทุกแท็บ
    const allData = {};

    // ดึงข้อมูลจากทุกแท็บพร้อมกัน
    console.log(`[LOG] เริ่มดึงข้อมูลจากทุกแท็บพร้อมกัน...`);
    const dataPromises = allSheets.map(async (sheetTitle) => {
      try {
        console.log(`[LOG] กำลังดึงข้อมูลจากแท็บ "${sheetTitle}"...`);
        const rows = await fetchSheetData(
          spreadsheetId,
          `${sheetTitle}!A1:Z1000`,
        );
        allData[sheetTitle] = transformSheetRowsToJSON(rows);
        console.log(
          `[LOG] ดึงข้อมูลจากแท็บ "${sheetTitle}" สำเร็จ: ${allData[sheetTitle].length} แถว`,
        );
        return { sheetTitle, success: true };
      } catch (error) {
        console.error(
          `[ERROR] ไม่สามารถดึงข้อมูลจากแท็บ "${sheetTitle}" ได้:`,
          error,
        );
        allData[sheetTitle] = [];
        return { sheetTitle, success: false, error };
      }
    });

    // รอให้ดึงข้อมูลทุกแท็บเสร็จ
    const results = await Promise.all(dataPromises);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `[LOG] ดึงข้อมูลสำเร็จ ${successCount} แท็บ, ล้มเหลว ${failCount} แท็บ`,
    );
    return allData;
  } catch (error) {
    console.error(`[ERROR] เกิดข้อผิดพลาดในการดึงข้อมูลทุกแท็บ:`, error);
    return {};
  }
}

// เปลี่ยนฟังก์ชันรีเฟรชข้อมูลจาก 15 นาทีเป็น 1 วัน
function scheduleDailyRefresh() {
  console.log(
    `[LOG] เริ่มต้นระบบรีเฟรชข้อมูลประจำวัน (ตั้งเวลาจะรีเฟรชเวลา 00:05 น.)...`,
  );
  let lastRefreshDate = "";

  setInterval(async () => {
    const now = new Date();
    const thaiTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
    );
    const currentDate = thaiTime.toISOString().split("T")[0]; // YYYY-MM-DD

    // แสดง log เฉพาะเมื่อเวลาอยู่ในช่วงที่ต้องการรีเฟรช
    if (
      thaiTime.getHours() === 0 &&
      thaiTime.getMinutes() >= 4 &&
      thaiTime.getMinutes() <= 6
    ) {
      console.log(
        `[LOG] ตรวจสอบเวลารีเฟรชข้อมูลประจำวัน: ${thaiTime.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
      );
    }

    // รีเฟรชที่เวลา 00:05 น. และยังไม่เคยรีเฟรชในวันนี้
    if (
      thaiTime.getHours() === 0 &&
      thaiTime.getMinutes() === 5 &&
      lastRefreshDate !== currentDate
    ) {
      console.log(
        `[LOG] เริ่มรีเฟรชข้อมูลประจำวันที่ ${currentDate} เวลา ${thaiTime.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}...`,
      );

      try {
        console.log(`[LOG] กำลังดึงข้อมูล instructions จาก Google Doc...`);
        await fetchGoogleDocInstructions();
        console.log(
          `[LOG] ดึงข้อมูล instructions สำเร็จ (${googleDocInstructions.length} อักขระ)`,
        );

        console.log(`[LOG] กำลังดึงข้อมูลจากทุกแท็บใน Google Sheets...`);
        // ใช้ฟังก์ชันใหม่ดึงข้อมูลทุกแท็บ
        sheetJSON = await fetchAllSheetsDataNew(SPREADSHEET_ID);

        console.log(
          `[LOG] รีเฟรชข้อมูลเสร็จสมบูรณ์ ได้ข้อมูลจาก ${Object.keys(sheetJSON).length} แท็บ`,
        );
        lastRefreshDate = currentDate;
      } catch (err) {
        console.error(`[ERROR] เกิดข้อผิดพลาดในการรีเฟรชข้อมูลประจำวัน:`, err);
      }
    }
  }, 60 * 1000); // ตรวจสอบทุก 1 นาที เพื่อให้ตรงกับเวลาที่กำหนด
}

async function buildSystemInstructions(history, selectedImageCollections = null) {
  // ดึง instructions จากฐานข้อมูลเท่านั้น ไม่ใช้ Google Docs/Sheets อีกต่อไป
  const instructions = await getInstructions();
  const assetsText = await getAssetsInstructionsText(selectedImageCollections);

  let systemText = "คุณเป็น AI chatbot ภาษาไทย\n\n";

  for (const inst of instructions) {
    if (inst.type === "text") {
      if (inst.title) systemText += `=== ${inst.title} ===\n`;
      systemText += inst.content + "\n\n";
    } else if (inst.type === "table") {
      if (inst.title) systemText += `=== ${inst.title} ===\n`;
      systemText +=
        "ข้อมูลตารางในรูปแบบ JSON:\n```json\n" +
        JSON.stringify(inst.data, null, 2) +
        "\n```\n\n";
    }
  }

  if (assetsText) {
    systemText += "\n\n" + assetsText + "\n\n";
  }

  // เพิ่มเวลาไทยปัจจุบัน
  const now = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
  systemText += `เวลาปัจจุบัน: ${now}`;

  return systemText.trim();
}

async function buildSystemInstructionsWithContext(history, queueContext = {}) {
  const rawSelections = Array.isArray(queueContext.selectedInstructions)
    ? queueContext.selectedInstructions
    : [];
  const normalizedSelections = normalizeInstructionSelections(rawSelections);
  const botKind = queueContext.botType || queueContext.platform || "line";
  const supportsCustomSelections =
    normalizedSelections.length > 0 && ["line", "facebook"].includes(botKind);

  let systemPrompt = "";
  let client = null;
  let db = null;
  let selectedImageCollections = Array.isArray(
    queueContext.selectedImageCollections,
  )
    ? queueContext.selectedImageCollections
    : null;

  const ensureDb = async () => {
    if (!db) {
      client = await connectDB();
      db = client.db("chatbot");
    }
    return db;
  };

  const loadSelectedImageCollections = async () => {
    if (!queueContext.botId) return;
    try {
      const database = await ensureDb();
      const botCollection =
        botKind === "facebook" ? "facebook_bots" : "line_bots";
      const botId =
        queueContext.botId instanceof ObjectId
          ? queueContext.botId
          : toObjectId(queueContext.botId) || queueContext.botId;

      const botDoc = await database.collection(botCollection).findOne({
        _id: botId,
      });

      if (botDoc && botDoc.selectedImageCollections) {
        selectedImageCollections = botDoc.selectedImageCollections;
      }
    } catch (error) {
      console.error("[LOG] ไม่สามารถดึง selectedImageCollections:", error);
    }
  };

  if (supportsCustomSelections) {
    try {
      const database = await ensureDb();
      systemPrompt = (
        await buildSystemPromptFromSelections(normalizedSelections, database)
      ).trim();
    } catch (error) {
      console.error(
        "[LOG] ไม่สามารถสร้าง system instructions จาก selections:",
        error,
      );
    }
  }

  if (!systemPrompt) {
    try {
      const defaultInstructionKey = await getSettingValue(
        "defaultInstruction",
        "",
      );
      if (defaultInstructionKey) {
        const database = await ensureDb();
        const fallbackSelections = normalizeInstructionSelections([
          defaultInstructionKey,
        ]);
        systemPrompt = (
          await buildSystemPromptFromSelections(fallbackSelections, database)
        ).trim();
      }
    } catch (error) {
      console.error(
        "[LOG] ไม่สามารถสร้าง system instructions จาก default instruction:",
        error,
      );
    }
  }

  await loadSelectedImageCollections();

  if (!systemPrompt) {
    return await buildSystemInstructions(history, selectedImageCollections);
  }

  const assetsText = await getAssetsInstructionsText(selectedImageCollections);
  if (assetsText) {
    systemPrompt = `${systemPrompt}\n\n${assetsText}`;
  }

  const now = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
  systemPrompt += `\n\nเวลาปัจจุบัน: ${now}`;

  return systemPrompt.trim();
}

// ฟังก์ชันสำหรับดึงข้อความจากแท็ก <THAI_REPLY>
function extractThaiReply(aiResponse) {
  const thaiReplyRegex = /<THAI_REPLY>([\s\S]*?)<\/THAI_REPLY>/i;
  const match = aiResponse.match(thaiReplyRegex);

  if (match && match[1]) {
    return match[1].trim();
  }

  // ถ้าไม่มีแท็ก THAI_REPLY ให้ส่งข้อความทั้งหมด
  return aiResponse;
}

const ORDER_TOOL_INSTRUCTIONS = `🚨 สำคัญ! คุณต้องใช้ TOOLS ในการจัดการออเดอร์

📋 เครื่องมือที่มี:
1. get_orders - ดู orders ที่มีอยู่แล้วของลูกค้า (ใช้เมื่อลูกค้าถามเกี่ยวกับออเดอร์เดิม)
2. create_order - สร้างออเดอร์ใหม่ (ต้องมี items และ totalAmount)
3. update_order - แก้ไขออเดอร์ที่มีอยู่ (ใช้เมื่อลูกค้าต้องการเปลี่ยนข้อมูลออเดอร์เดิม)

💰 วิธีใส่ข้อมูลสินค้าที่ถูกต้อง:

กรณี 1: สินค้าปกติ (รู้ราคาต่อชิ้น)
- quantity = จำนวนหน่วย เช่น 3 ลัง → quantity: 3
- price = ราคาต่อหน่วย เช่น ลังละ 2,350 → price: 2350
- totalAmount = ยอดรวม (ต้องส่งเสมอ!)
- ตัวอย่าง: items: [{product: "สินค้า A", quantity: 3, price: 2350}], totalAmount: 7050

กรณี 2: โปรโมชั่น/เซ็ต (ไม่รู้ราคาแยกต่อชิ้น)
- ใส่ชื่อโปรโมชั่น+รายละเอียดเป็น product
- quantity = จำนวนชุด เช่น 1 ชุด → quantity: 1
- price = 0 (ใส่ 0 ถ้าไม่รู้ราคาแยก!)
- totalAmount = ราคาโปรโมชั่น
- ตัวอย่าง: items: [{product: "โปรพียูโฟม 3 ลัง พร้อมของแถม", quantity: 1, price: 0}], totalAmount: 7050

⚡ เมื่อไหร่ต้องใช้ tools:
- ลูกค้าสั่งซื้อสินค้าใหม่ → ถามข้อมูลให้ครบ แล้วเรียก create_order ทันที
- ลูกค้าให้ที่อยู่หรือเบอร์โทร → เรียก create_order ทันที
- ลูกค้าต้องการ "แก้ไข" หรือ "เปลี่ยนแปลง" ออเดอร์ที่สั่งไปแล้ว → เรียก update_order

✅ สำคัญมาก - เมื่อไหร่ต้องสร้างออเดอร์ใหม่:
- ลูกค้าสั่งสินค้าใหม่ → สร้างออเดอร์ใหม่ได้เลย (แม้จะมีออเดอร์เก่าอยู่)
- ลูกค้าบอกว่า "สั่งใหม่" หรือ "สั่งเพิ่ม" → สร้างออเดอร์ใหม่ทันที
- ห้ามถามลูกค้าว่าจะรวมกับออเดอร์เก่าหรือไม่ ถ้าลูกค้าไม่ได้พูดถึงออเดอร์เก่า

⚠️ เมื่อไหร่ต้อง update_order (ไม่ใช่สร้างใหม่):
- ลูกค้าบอกว่า "แก้ไข" หรือ "เปลี่ยน" ข้อมูลออเดอร์ที่สั่งไปแล้ว
- ลูกค้าพูดถึงออเดอร์เดิมโดยเฉพาะ เช่น "ออเดอร์ที่แล้ว" "ที่สั่งไปเมื่อกี้"

🚫 ข้อห้าม:
1. ห้ามพูดว่า "บันทึกแล้ว" หรือ "สั่งซื้อสำเร็จ" โดยไม่ได้เรียก tool จริง
2. ห้ามคาดเดาข้อมูลออเดอร์ - ถามให้ครบก่อน
3. ห้ามถามลูกค้าว่าจะรวมกับออเดอร์เก่าหรือไม่ (ถ้าลูกค้าไม่ได้พูดถึง)
4. ถ้าไม่รู้ราคาแยกต่อชิ้น ให้ใส่ price: 0 แล้วใช้ totalAmount เป็นราคาโปร

💡 ตัวอย่าง:
- "สั่งสินค้า A 2 ชิ้น ชิ้นละ 500" → items: [{product: "สินค้า A", quantity: 2, price: 500}], totalAmount: 1000
- "สั่งโปร 3 ลัง 7,050" → items: [{product: "โปร 3 ลัง", quantity: 1, price: 0}], totalAmount: 7050
- "สั่งใหม่ครับ" → เรียก create_order (ไม่ต้องถามเรื่องออเดอร์เก่า!)`;

async function appendOrderToolInstructions(systemInstructions) {
  const requiredFields = await getOrderRequiredFieldsSetting();
  const requirementText = formatOrderRequirementText(requiredFields);
  const toolInstructions = `${ORDER_TOOL_INSTRUCTIONS}\n- ${requirementText}`;
  if (!systemInstructions) return toolInstructions.trim();
  // ย้าย tool instructions ไปไว้ต้น system prompt เพื่อให้ AI เห็นก่อน
  return `${toolInstructions}\n\n${systemInstructions}`.trim();
}

async function fetchBotAiConfig(botId, platform) {
  try {
    if (!botId) return normalizeAiConfig({});
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll =
      platform === "facebook"
        ? db.collection("facebook_bots")
        : db.collection("line_bots");
    const bot = await coll.findOne({ _id: new ObjectId(botId) });
    if (!bot) return normalizeAiConfig({});
    return normalizeAiConfig(bot.aiConfig || {});
  } catch (err) {
    console.error("fetchBotAiConfig error:", err);
    return normalizeAiConfig({});
  }
}

// ฟังก์ชันสำหรับจัดการข้อความอย่างเดียว (ไม่มีรูปภาพ)
async function getAssistantResponseTextOnly(
  systemInstructions,
  history,
  userText,
  aiModel = null,
  botId = null,
  platform = null,
  userId = null
) {
  try {
    // Get per-bot API key or fallback to default
    const apiKeyToUse = await getOpenAIApiKeyForBot(botId, platform);
    const openai = new OpenAI({ apiKey: apiKeyToUse.key });

    console.log(
      `[LOG] สร้าง messages สำหรับการเรียก OpenAI API (ข้อความอย่างเดียว)...`,
    );

    const toolSystemInstructions =
      await appendOrderToolInstructions(systemInstructions);
    let messages = [
      { role: "system", content: toolSystemInstructions },
      ...history,
      { role: "user", content: userText },
    ];

    console.log(`[LOG] ส่งคำขอไปยัง OpenAI API (ข้อความ)...`);

    // ใช้โมเดลที่ส่งมา หรือ fallback ไปใช้ global setting
    const textModel = aiModel || (await getSettingValue("textModel", "gpt-5"));
    const botAiConfig = await fetchBotAiConfig(botId, platform);
    const apiMode = botAiConfig.apiMode === "chat" ? "chat" : "responses";

    // Define Tools
    const tools = [
      {
        type: "function",
        function: {
          name: "get_categories",
          description: "Get list of all available product categories. Use this first to know which category to search in.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function",
        function: {
          name: "search_item_by_category",
          description: "Search for items in a specific category using the first column (Main Key). Use this for specific searches like Model Name or ID.",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string", description: "Category name (must be exact match from get_categories)" },
              keyword: { type: "string", description: "Search keyword" }
            },
            required: ["category", "keyword"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_item_broad",
          description: "Search for items in a specific category across ALL columns. Use this if specific search fails.",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string", description: "Category name" },
              keyword: { type: "string", description: "Search keyword" }
            },
            required: ["category", "keyword"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_orders",
          description: "Get existing orders for the current customer. ALWAYS call this before creating a new order to check for duplicates or if customer wants to modify existing order.",
          parameters: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Number of recent orders to retrieve (default: 5, max: 10)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_order",
          description: `Create a new order. PRICING RULES:

สินค้าปกติ (รู้ราคาต่อชิ้น):
- quantity = จำนวนหน่วย เช่น 3 ลัง → quantity: 3
- price = ราคาต่อหน่วย เช่น ลังละ 2,350 → price: 2350
- totalAmount = ยอดรวม (ต้องส่งเสมอ!)

โปรโมชั่น/เซ็ต (ไม่รู้ราคาแยกต่อชิ้น):
- ใส่ชื่อโปรโมชั่นเป็น product เช่น "โปรพียูโฟม 3 ลัง 7,050"
- quantity = จำนวนชุด/เซ็ต เช่น 1 ชุด → quantity: 1
- price = 0 (ใส่ 0 ถ้าไม่รู้ราคาแยก)
- totalAmount = ราคาโปร เช่น 7050

ตัวอย่าง:
1. สินค้าปกติ: items: [{product: "สินค้า A", quantity: 3, price: 2350}], totalAmount: 7050
2. โปรโมชั่น: items: [{product: "โปรพียูโฟม 3 ลัง", quantity: 1, price: 0}], totalAmount: 7050`,
          parameters: {
            type: "object",
            properties: {
              orderData: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    description: "รายการสินค้า/โปรโมชั่น",
                    items: {
                      type: "object",
                      properties: {
                        product: { type: "string", description: "ชื่อสินค้า หรือ ชื่อโปรโมชั่น+รายละเอียด" },
                        quantity: { type: "number", description: "จำนวนหน่วย/ชุด (สินค้าปกติ=จำนวนชิ้น, โปรโมชั่น=จำนวนชุด)" },
                        price: { type: "number", description: "ราคาต่อหน่วย (ใส่ 0 ถ้าเป็นโปรโมชั่นที่ไม่รู้ราคาแยก)" },
                        shippingName: { type: "string" },
                        color: { type: "string" },
                        width: { type: "number" },
                        length: { type: "number" },
                        height: { type: "number" },
                        weight: { type: "number" }
                      },
                      required: ["product", "quantity", "price"]
                    }
                  },
                  totalAmount: { type: "number", description: "ยอดรวมทั้งหมด (จำเป็นต้องส่ง!) - สำหรับโปรโมชั่นให้ใส่ราคาโปรเลย" },
                  shippingCost: { type: "number" },
                  customerName: { type: "string" },
                  recipientName: { type: "string" },
                  shippingAddress: { type: "string" },
                  addressSubDistrict: { type: "string" },
                  addressDistrict: { type: "string" },
                  addressProvince: { type: "string" },
                  addressPostalCode: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string" },
                  paymentMethod: { type: "string" },
                  transferDate: { type: "string" },
                  transferTime: { type: "string" },
                  paymentReceiver: { type: "string" },
                  notes: { type: "string" }
                },
                required: ["items"]
              },
              status: {
                type: "string",
                enum: ["pending", "confirmed", "shipped", "completed", "cancelled"]
              },
              notes: { type: "string" }
            },
            required: ["orderData"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_order",
          description: "Update an existing order. ALWAYS provide the orderId. Send ONLY fields that need to change (partial update).",
          parameters: {
            type: "object",
            properties: {
              orderId: { type: "string" },
              orderData: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product: { type: "string" },
                        quantity: { type: "number" },
                        price: { type: "number" },
                        shippingName: { type: "string" },
                        color: { type: "string" },
                        width: { type: "number" },
                        length: { type: "number" },
                        height: { type: "number" },
                        weight: { type: "number" }
                      },
                      required: ["product", "quantity", "price"]
                    }
                  },
                  totalAmount: { type: "number" },
                  shippingCost: { type: "number" },
                  customerName: { type: "string" },
                  recipientName: { type: "string" },
                  shippingAddress: { type: "string" },
                  addressSubDistrict: { type: "string" },
                  addressDistrict: { type: "string" },
                  addressProvince: { type: "string" },
                  addressPostalCode: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string" },
                  paymentMethod: { type: "string" },
                  transferDate: { type: "string" },
                  transferTime: { type: "string" },
                  paymentReceiver: { type: "string" },
                  notes: { type: "string" }
                }
              },
              status: {
                type: "string",
                enum: ["pending", "confirmed", "shipped", "completed", "cancelled"]
              },
              notes: { type: "string" }
            }
          }
        }
      }
    ];

    // Tool Loop
    let finalResponse = null;
    let toolLoopCount = 0;
    const MAX_TOOL_LOOPS = 5;

    const buildPayload = () => {
      const payload = {
        model: textModel,
        messages,
        tools,
        tool_choice: "auto",
      };

      if (apiMode === "chat") {
        if (botAiConfig.temperature !== null) {
          payload.temperature = botAiConfig.temperature;
        }
        if (botAiConfig.topP !== null) {
          payload.top_p = botAiConfig.topP;
        }
        if (botAiConfig.presencePenalty !== null) {
          payload.presence_penalty = botAiConfig.presencePenalty;
        }
        if (botAiConfig.frequencyPenalty !== null) {
          payload.frequency_penalty = botAiConfig.frequencyPenalty;
        }
      } else if (botAiConfig.reasoningEffort) {
        payload.reasoning_effort = botAiConfig.reasoningEffort;
      }

      return payload;
    };

    const toolContext = { userId, platform, botId };

    while (toolLoopCount < MAX_TOOL_LOOPS) {
      const response = await openai.chat.completions.create(buildPayload());
      const responseMessage = response.choices[0].message;

      if (responseMessage.tool_calls) {
        messages.push(responseMessage);

        console.log(
          `[LOG] AI ต้องการใช้ Tool: ${responseMessage.tool_calls.length} calls`,
        );

        const client = await connectDB();
        const db = client.db("chatbot");

        let isFirstToolCall = true;

        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`[LOG] Executing Tool: ${functionName}`, functionArgs);

          let toolResult = { error: "Unknown tool" };

          if (functionName === "get_categories") {
            toolResult = await getCategories(db, botId, platform);
          } else if (functionName === "search_item_by_category") {
            toolResult = await searchItemByCategory(
              db,
              functionArgs.category,
              functionArgs.keyword,
              botId,
              platform,
            );
          } else if (functionName === "search_item_broad") {
            toolResult = await searchItemBroad(
              db,
              functionArgs.category,
              functionArgs.keyword,
              botId,
              platform,
            );
          } else if (functionName === "get_orders") {
            toolResult = await getOrdersForTool(functionArgs, toolContext);
          } else if (functionName === "create_order") {
            toolResult = await createOrderFromTool(functionArgs, toolContext);
          } else if (functionName === "update_order") {
            toolResult = await updateOrderFromTool(functionArgs, toolContext);
          }

          const toolResultMsg = {
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(toolResult),
          };

          messages.push(toolResultMsg);

          // Save tool interaction to DB
          await saveToolInteraction(
            userId,
            isFirstToolCall ? responseMessage : null,
            toolResultMsg,
            platform,
            botId
          );
          isFirstToolCall = false;

        }
        toolLoopCount++;
      } else {
        // Debug: AI ตอบโดยไม่ใช้ tool
        console.log(`[LOG] AI ตอบโดยไม่ใช้ Tool (loop ${toolLoopCount}). Content preview: ${responseMessage.content?.substring(0, 100)}...`);
        finalResponse = response;
        break;
      }
    }

    if (!finalResponse) {
      console.warn("[LOG] Tool loop limit reached or no response");
      return "ขออภัย ระบบไม่สามารถประมวลผลคำขอได้ในขณะนี้ (Tool loop limit)";
    }

    console.log(`[LOG] ได้รับคำตอบจาก OpenAI API เรียบร้อยแล้ว`);

    let assistantReply = finalResponse.choices[0].message.content;
    if (typeof assistantReply !== "string") {
      assistantReply = JSON.stringify(assistantReply);
    }

    assistantReply = assistantReply.replace(/\[cut\]{2,}/g, "[cut]");
    const cutList = assistantReply.split("[cut]");
    if (cutList.length > 10) {
      assistantReply = cutList.slice(0, 10).join("[cut]");
    }

    // เพิ่มข้อมูล token usage ต่อท้ายคำตอบ (ถ้าเปิดใช้งาน)
    if (finalResponse.usage) {
      const usage = finalResponse.usage;
      const showTokenUsage = await getSettingValue("showTokenUsage", false);

      if (showTokenUsage) {
        const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens`;
        assistantReply += tokenInfo;
      }

      console.log(
        `[LOG] Token usage (text): ${usage.total_tokens} total (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion)`,
      );

      // Log usage to database
      await logOpenAIUsage({
        apiKeyId: apiKeyToUse.id,
        botId,
        platform,
        model: textModel,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        functionName: 'getAssistantResponseTextOnly'
      });
    }

    // ดึงข้อความจากแท็ก THAI_REPLY ถ้ามี
    const finalReply = extractThaiReply(assistantReply);

    return finalReply.trim();
  } catch (err) {
    console.error("OpenAI text error:", err);
    return "";
  }
}

// ฟังก์ชันสำหรับจัดการเนื้อหาแบบ multimodal (ข้อความ + รูปภาพ)
async function getAssistantResponseMultimodal(
  systemInstructions,
  history,
  contentSequence,
  aiModel = null,
  botId = null,
  platform = null,
  userId = null
) {
  try {
    // Get per-bot API key or fallback to default
    const apiKeyToUse = await getOpenAIApiKeyForBot(botId, platform);
    const openai = new OpenAI({ apiKey: apiKeyToUse.key });

    console.log(
      `[LOG] สร้าง messages สำหรับการเรียก OpenAI API (multimodal)...`,
    );

    // จัดการเนื้อหาตามลำดับ - แต่จำกัดจำนวนรูปภาพเพื่อควบคุมต้นทุน
    const maxImages = await getSettingValue("maxImagesPerMessage", 3); // ใช้ค่าที่ตั้งไว้
    let imageCount = 0;
    let finalContent = [];
    let textParts = [];

    for (const item of contentSequence) {
      if (item.type === "text") {
        textParts.push(item.content);
      } else if (item.type === "image" && imageCount < maxImages) {
        // รวมข้อความที่สะสมก่อนรูปภาพ
        if (textParts.length > 0) {
          finalContent.push({
            type: "text",
            text: textParts.join("\n\n"),
          });
          textParts = [];
        }

        // เพิ่มรูปภาพ พร้อมตั้งค่า detail ให้เหมาะสมเพื่อประหยัด token
        const imageSize = item.content.length;
        const useHighDetail = imageSize > 100000; // ใช้ high detail เฉพาะรูปที่มีรายละเอียดมาก

        // ตรวจจับ MIME type จาก content
        let imageUrl = item.content;
        if (!imageUrl.startsWith("data:image/")) {
          // ตรวจจับ MIME type จาก signature
          let mimeType = "image/jpeg";
          const trimmed = imageUrl.trim();
          if (trimmed.startsWith("/9j/")) {
            mimeType = "image/jpeg";
          } else if (trimmed.startsWith("iVBORw0KGgo")) {
            mimeType = "image/png";
          } else if (trimmed.startsWith("R0lGOD")) {
            mimeType = "image/gif";
          } else if (trimmed.startsWith("UklGR")) {
            mimeType = "image/webp";
          }
          imageUrl = `data:${mimeType};base64,${item.content}`;
        }

        finalContent.push({
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: useHighDetail ? "high" : "low", // ปรับ detail ตามขนาดรูป
          },
        });

        console.log(
          `[LOG] ใช้ detail: ${useHighDetail ? "high" : "low"} สำหรับรูปภาพขนาด ${(imageSize / 1024).toFixed(1)}KB`,
        );

        // เพิ่มคำอธิบายรูปภาพ
        finalContent.push({
          type: "text",
          text: `[รูปภาพที่ ${imageCount + 1}]: ${item.description}`,
        });

        imageCount++;
        console.log(`[LOG] เพิ่มรูปภาพที่ ${imageCount} เข้าไปใน content`);
      } else if (item.type === "image" && imageCount >= maxImages) {
        // ถ้าเกินจำนวนรูปภาพที่กำหนด ให้แจ้งเตือน
        textParts.push(
          `[มีรูปภาพเพิ่มเติมที่ไม่สามารถแสดงได้เนื่องจากข้อจำกัดการประมวลผล]`,
        );
      }
    }

    // รวมข้อความที่เหลือ
    if (textParts.length > 0) {
      finalContent.push({
        type: "text",
        text: textParts.join("\n\n"),
      });
    }

    // หากไม่มีเนื้อหาใด ๆ ให้เพิ่มข้อความขอให้อธิบาย
    if (finalContent.length === 0) {
      finalContent.push({
        type: "text",
        text: "ผู้ใช้ส่งเนื้อหามา โปรดตอบกลับอย่างเหมาะสม",
      });
    }

    const toolSystemInstructions =
      await appendOrderToolInstructions(systemInstructions);
    const messages = [
      { role: "system", content: toolSystemInstructions },
      ...history,
      { role: "user", content: finalContent },
    ];

    console.log(
      `[LOG] ส่งคำขอไปยัง OpenAI API (multimodal) พร้อมรูปภาพ ${imageCount} รูป...`,
    );

    // ใช้โมเดลที่ส่งมา หรือ fallback ไปใช้ global setting
    const visionModel =
      aiModel || (await getSettingValue("visionModel", "gpt-5"));

    const tools = [
      {
        type: "function",
        function: {
          name: "get_categories",
          description: "Get list of all available product categories. Use this first to know which category to search in.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function",
        function: {
          name: "search_item_by_category",
          description: "Search for items in a specific category using the first column (Main Key). Use this for specific searches like Model Name or ID.",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string", description: "Category name (must be exact match from get_categories)" },
              keyword: { type: "string", description: "Search keyword" }
            },
            required: ["category", "keyword"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_item_broad",
          description: "Search for items in a specific category across ALL columns. Use this if specific search fails.",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string", description: "Category name" },
              keyword: { type: "string", description: "Search keyword" }
            },
            required: ["category", "keyword"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_orders",
          description: "Get existing orders for the current customer. ALWAYS call this before creating a new order to check for duplicates or if customer wants to modify existing order.",
          parameters: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Number of recent orders to retrieve (default: 5, max: 10)"
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_order",
          description: `Create a new order. PRICING RULES:

สินค้าปกติ (รู้ราคาต่อชิ้น):
- quantity = จำนวนหน่วย เช่น 3 ลัง → quantity: 3
- price = ราคาต่อหน่วย เช่น ลังละ 2,350 → price: 2350
- totalAmount = ยอดรวม (ต้องส่งเสมอ!)

โปรโมชั่น/เซ็ต (ไม่รู้ราคาแยกต่อชิ้น):
- ใส่ชื่อโปรโมชั่นเป็น product เช่น "โปรพียูโฟม 3 ลัง 7,050"
- quantity = จำนวนชุด/เซ็ต เช่น 1 ชุด → quantity: 1
- price = 0 (ใส่ 0 ถ้าไม่รู้ราคาแยก)
- totalAmount = ราคาโปร เช่น 7050

ตัวอย่าง:
1. สินค้าปกติ: items: [{product: "สินค้า A", quantity: 3, price: 2350}], totalAmount: 7050
2. โปรโมชั่น: items: [{product: "โปรพียูโฟม 3 ลัง", quantity: 1, price: 0}], totalAmount: 7050`,
          parameters: {
            type: "object",
            properties: {
              orderData: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    description: "รายการสินค้า/โปรโมชั่น",
                    items: {
                      type: "object",
                      properties: {
                        product: { type: "string", description: "ชื่อสินค้า หรือ ชื่อโปรโมชั่น+รายละเอียด" },
                        quantity: { type: "number", description: "จำนวนหน่วย/ชุด (สินค้าปกติ=จำนวนชิ้น, โปรโมชั่น=จำนวนชุด)" },
                        price: { type: "number", description: "ราคาต่อหน่วย (ใส่ 0 ถ้าเป็นโปรโมชั่นที่ไม่รู้ราคาแยก)" },
                        shippingName: { type: "string" },
                        color: { type: "string" },
                        width: { type: "number" },
                        length: { type: "number" },
                        height: { type: "number" },
                        weight: { type: "number" }
                      },
                      required: ["product", "quantity", "price"]
                    }
                  },
                  totalAmount: { type: "number", description: "ยอดรวมทั้งหมด (จำเป็นต้องส่ง!) - สำหรับโปรโมชั่นให้ใส่ราคาโปรเลย" },
                  shippingCost: { type: "number" },
                  customerName: { type: "string" },
                  recipientName: { type: "string" },
                  shippingAddress: { type: "string" },
                  addressSubDistrict: { type: "string" },
                  addressDistrict: { type: "string" },
                  addressProvince: { type: "string" },
                  addressPostalCode: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string" },
                  paymentMethod: { type: "string" },
                  transferDate: { type: "string" },
                  transferTime: { type: "string" },
                  paymentReceiver: { type: "string" },
                  notes: { type: "string" }
                },
                required: ["items"]
              },
              status: {
                type: "string",
                enum: ["pending", "confirmed", "shipped", "completed", "cancelled"]
              },
              notes: { type: "string" }
            },
            required: ["orderData"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_order",
          description: "Update an existing order (default: latest order for this customer).",
          parameters: {
            type: "object",
            properties: {
              orderId: { type: "string" },
              orderData: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product: { type: "string" },
                        quantity: { type: "number" },
                        price: { type: "number" },
                        shippingName: { type: "string" },
                        color: { type: "string" },
                        width: { type: "number" },
                        length: { type: "number" },
                        height: { type: "number" },
                        weight: { type: "number" }
                      },
                      required: ["product", "quantity", "price"]
                    }
                  },
                  totalAmount: { type: "number" },
                  shippingCost: { type: "number" },
                  customerName: { type: "string" },
                  recipientName: { type: "string" },
                  shippingAddress: { type: "string" },
                  addressSubDistrict: { type: "string" },
                  addressDistrict: { type: "string" },
                  addressProvince: { type: "string" },
                  addressPostalCode: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string" },
                  paymentMethod: { type: "string" },
                  transferDate: { type: "string" },
                  transferTime: { type: "string" },
                  paymentReceiver: { type: "string" },
                  notes: { type: "string" }
                }
              },
              status: {
                type: "string",
                enum: ["pending", "confirmed", "shipped", "completed", "cancelled"]
              },
              notes: { type: "string" }
            }
          }
        }
      }
    ];

    let finalResponse = null;
    let toolLoopCount = 0;
    const MAX_TOOL_LOOPS = 5;
    const toolContext = { userId, platform, botId };

    while (toolLoopCount < MAX_TOOL_LOOPS) {
      const response = await openai.chat.completions.create({
        model: visionModel,
        messages,
        tools,
        tool_choice: "auto",
      });

      const responseMessage = response.choices[0].message;

      if (responseMessage.tool_calls) {
        messages.push(responseMessage);
        console.log(
          `[LOG] AI ต้องการใช้ Tool (multimodal): ${responseMessage.tool_calls.length} calls`,
        );

        const client = await connectDB();
        const db = client.db("chatbot");

        let isFirstToolCall = true;

        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`[LOG] Executing Tool: ${functionName}`, functionArgs);

          let toolResult = { error: "Unknown tool" };

          if (functionName === "get_categories") {
            toolResult = await getCategories(db, botId, platform);
          } else if (functionName === "search_item_by_category") {
            toolResult = await searchItemByCategory(
              db,
              functionArgs.category,
              functionArgs.keyword,
              botId,
              platform,
            );
          } else if (functionName === "search_item_broad") {
            toolResult = await searchItemBroad(
              db,
              functionArgs.category,
              functionArgs.keyword,
              botId,
              platform,
            );
          } else if (functionName === "get_orders") {
            toolResult = await getOrdersForTool(functionArgs, toolContext);
          } else if (functionName === "create_order") {
            toolResult = await createOrderFromTool(functionArgs, toolContext);
          } else if (functionName === "update_order") {
            toolResult = await updateOrderFromTool(functionArgs, toolContext);
          }

          const toolResultMsg = {
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(toolResult),
          };

          messages.push(toolResultMsg);

          // Save tool interaction to DB
          await saveToolInteraction(
            userId,
            isFirstToolCall ? responseMessage : null,
            toolResultMsg,
            platform,
            botId
          );
          isFirstToolCall = false;

        }

        toolLoopCount++;
      } else {
        // Debug: AI ตอบโดยไม่ใช้ tool (multimodal)
        console.log(`[LOG] AI (multimodal) ตอบโดยไม่ใช้ Tool (loop ${toolLoopCount}). Content preview: ${responseMessage.content?.substring(0, 100)}...`);
        finalResponse = response;
        break;
      }
    }

    if (!finalResponse) {
      console.warn("[LOG] Tool loop limit reached (multimodal)");
      return "ขออภัย ระบบไม่สามารถประมวลผลคำขอได้ในขณะนี้ (Tool loop limit)";
    }

    console.log(`[LOG] ได้รับคำตอบจาก OpenAI API (multimodal) เรียบร้อยแล้ว`);

    let assistantReply = finalResponse.choices[0].message.content;
    if (typeof assistantReply !== "string") {
      assistantReply = JSON.stringify(assistantReply);
    }

    assistantReply = assistantReply.replace(/\[cut\]{2,}/g, "[cut]");
    const cutList = assistantReply.split("[cut]");
    if (cutList.length > 10) {
      assistantReply = cutList.slice(0, 10).join("[cut]");
    }

    // เพิ่มข้อมูล token usage ต่อท้ายคำตอบ (ถ้าเปิดใช้งาน)
    if (finalResponse.usage) {
      const usage = finalResponse.usage;
      const showTokenUsage = await getSettingValue("showTokenUsage", false);

      if (showTokenUsage) {
        const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens (มีรูปภาพ ${imageCount} รูป)`;
        assistantReply += tokenInfo;
      }

      console.log(
        `[LOG] Token usage (multimodal): ${usage.total_tokens} total (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion) with ${imageCount} images`,
      );

      // Log usage to database
      await logOpenAIUsage({
        apiKeyId: apiKeyToUse.id,
        botId,
        platform,
        model: visionModel,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        functionName: 'getAssistantResponseMultimodal'
      });
    }

    // ดึงข้อความจากแท็ก THAI_REPLY ถ้ามี
    const finalReply = extractThaiReply(assistantReply);

    return finalReply.trim();
  } catch (err) {
    console.error("OpenAI multimodal error:", err);
    return "";
  }
}

// ============================ Settings & Instructions Helpers ============================
async function ensureSettings() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");

  // ตรวจสอบและสร้างการตั้งค่าเริ่มต้น
  const defaultSettings = [
    { key: "aiEnabled", value: true },
    { key: "chatDelaySeconds", value: 0 },
    { key: "maxQueueMessages", value: 10 },
    { key: "enableMessageMerging", value: true },
    { key: "textModel", value: "gpt-5" },
    { key: "visionModel", value: "gpt-5" },
    { key: "maxImagesPerMessage", value: 3 },
    { key: "defaultInstruction", value: "" },
    { key: "enableChatHistory", value: true },
    { key: "enableAdminNotifications", value: true },
    { key: "systemMode", value: "production" },
    { key: "showTokenUsage", value: false },
    { key: "facebookImageSendMode", value: "upload" },
    { key: "enableFollowUpAnalysis", value: true },
    { key: "followUpShowInChat", value: true },
    { key: "followUpShowInDashboard", value: true },
    { key: "followUpAutoEnabled", value: false },
    { key: "orderAnalysisEnabled", value: true },
    { key: "orderCutoffSchedulingEnabled", value: true },
    { key: "orderExtractionMode", value: ORDER_EXTRACTION_MODES.SCHEDULED },
    {
      key: "orderRequiredFields",
      value: { ...ORDER_REQUIRED_FIELDS_DEFAULT },
    },
    {
      key: "audioAttachmentResponse",
      value: DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
    },
    {
      key: "followUpRounds",
      value: [
        { delayMinutes: 10, message: "ยังสนใจไหม" },
        { delayMinutes: 20, message: "เหลืออีกเพียงสิบท่าน" },
      ],
    },
  ];

  for (const setting of defaultSettings) {
    const existing = await coll.findOne({ key: setting.key });
    if (!existing) {
      await coll.insertOne(setting);
      console.log(
        `[SETTINGS] สร้างการตั้งค่าเริ่มต้น: ${setting.key} = ${setting.value}`,
      );
    }
  }
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

// Get setting value with default fallback
async function getSettingValue(key, defaultValue) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    const doc = await coll.findOne({ key });
    if (!doc || typeof doc.value === "undefined") {
      return defaultValue;
    }
    return doc.value;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
}

async function setSettingValue(key, value) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    await coll.updateOne({ key }, { $set: { value } }, { upsert: true });
    return true;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    return false;
  }
}

async function getOrderExtractionModeSetting() {
  return "realtime";
}

async function getAiEnabled() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");
  const doc = await coll.findOne({ key: "aiEnabled" });
  return doc ? doc.value : true;
}

async function setAiEnabled(state) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");
  await coll.updateOne(
    { key: "aiEnabled" },
    { $set: { value: !!state } },
    { upsert: true },
  );
}

async function getInstructions() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions");
  const cursor = coll.find({}).sort({ order: 1, createdAt: 1 });
  const instructions = await cursor.toArray();
  return instructions.map((instruction) => {
    const id = instruction?._id;
    const stringId =
      id && typeof id.toHexString === "function"
        ? id.toHexString()
        : id && typeof id.toString === "function"
          ? id.toString()
          : String(id || "");
    return {
      ...instruction,
      _id: stringId,
    };
  });
}

function generateInstructionId() {
  return `inst_${crypto.randomBytes(6).toString("hex")}`;
}

function isInstructionSelectionObject(entry) {
  return (
    !!entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof entry.instructionId === "string" &&
    entry.instructionId.trim() !== ""
  );
}

function normalizeInstructionSelections(selections = []) {
  if (!Array.isArray(selections)) return [];
  const normalized = [];
  const seenObjectKeys = new Set();
  const seenStringKeys = new Set();

  const pushInstructionObject = (instructionId, version = null) => {
    if (!instructionId) return;
    const key = `${instructionId}::${version === null ? "latest" : version}`;
    if (seenObjectKeys.has(key)) return;
    seenObjectKeys.add(key);
    normalized.push({ instructionId, version });
  };

  for (const entry of selections) {
    if (isInstructionSelectionObject(entry)) {
      const instructionId = entry.instructionId.trim();
      if (!instructionId) continue;
      const version = Number.isInteger(entry.version) ? entry.version : null;
      pushInstructionObject(instructionId, version);
    } else if (typeof entry === "string") {
      const value = entry.trim();
      if (!value) continue;
      if (/^inst_/i.test(value)) {
        pushInstructionObject(value);
        continue;
      }
      if (seenStringKeys.has(value)) continue;
      seenStringKeys.add(value);
      normalized.push(value);
    }
  }

  return normalized;
}

function normalizeImageCollectionSelections(collectionIds = []) {
  if (!Array.isArray(collectionIds)) return [];
  const normalized = [];
  const seen = new Set();
  for (const entry of collectionIds) {
    let value = null;
    if (!entry) continue;
    if (typeof entry === "string") {
      value = entry.trim();
    } else if (entry instanceof ObjectId) {
      value = entry.toHexString();
    } else if (
      typeof entry === "object" &&
      entry._id &&
      typeof entry._id === "string"
    ) {
      value = entry._id.trim();
    } else if (
      typeof entry === "object" &&
      entry._id &&
      entry._id instanceof ObjectId
    ) {
      value = entry._id.toHexString();
    }
    if (!value) continue;
    if (!seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }
  return normalized;
}

function sanitizeInstructionForSnapshot(instruction) {
  if (!instruction || !instruction.instructionId) return null;
  const now = new Date();
  return {
    instructionId: instruction.instructionId,
    version: Number.isInteger(instruction.version) ? instruction.version : 1,
    type: instruction.type || "text",
    title: instruction.title || "",
    content: instruction.content || "",
    data: instruction.type === "table" ? instruction.data || null : null,
    createdAt: instruction.createdAt || now,
    updatedAt: instruction.updatedAt || instruction.createdAt || now,
    snapshotAt: now,
  };
}

async function recordInstructionVersionSnapshot(
  instruction,
  dbInstance = null,
) {
  const snapshot = sanitizeInstructionForSnapshot(instruction);
  if (!snapshot) return null;
  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }
  const versionColl = db.collection("instruction_versions");
  await versionColl.updateOne(
    { instructionId: snapshot.instructionId, version: snapshot.version },
    { $set: snapshot },
    { upsert: true },
  );
  return snapshot;
}

async function ensureInstructionVersionSnapshot(
  instruction,
  dbInstance = null,
) {
  if (!instruction || !instruction.instructionId) return null;
  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }
  const versionColl = db.collection("instruction_versions");
  const version = Number.isInteger(instruction.version)
    ? instruction.version
    : 1;
  const existing = await versionColl.findOne({
    instructionId: instruction.instructionId,
    version,
  });
  if (existing) return existing;
  return recordInstructionVersionSnapshot(instruction, db);
}

async function ensureInstructionIdentifiers() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions");
  const versionColl = db.collection("instruction_versions");

  try {
    await versionColl.createIndex(
      { instructionId: 1, version: -1 },
      { unique: true },
    );
  } catch (err) {
    console.warn(
      "[Instructions] createIndex error (instruction/version):",
      err?.message || err,
    );
  }
  try {
    await versionColl.createIndex({ instructionId: 1, snapshotAt: -1 });
  } catch (err) {
    console.warn(
      "[Instructions] createIndex error (snapshotAt):",
      err?.message || err,
    );
  }

  const docs = await coll.find({}).toArray();
  for (const doc of docs) {
    if (!doc) continue;
    const instructionId = doc.instructionId || `inst_${doc._id?.toString()}`;
    const version = Number.isInteger(doc.version) ? doc.version : 1;
    const createdAtFallback =
      doc.createdAt ||
      (typeof doc._id?.getTimestamp === "function"
        ? doc._id.getTimestamp()
        : new Date());
    const updatedAtFallback = doc.updatedAt || createdAtFallback;
    const updateFields = {};
    if (doc.instructionId !== instructionId)
      updateFields.instructionId = instructionId;
    if (!Number.isInteger(doc.version)) updateFields.version = version;
    if (!doc.createdAt) updateFields.createdAt = createdAtFallback;
    if (!doc.updatedAt) updateFields.updatedAt = updatedAtFallback;

    if (Object.keys(updateFields).length > 0) {
      await coll.updateOne({ _id: doc._id }, { $set: updateFields });
    }

    const hydratedDoc = {
      ...doc,
      ...updateFields,
      instructionId,
      version,
      createdAt: updateFields.createdAt || doc.createdAt || createdAtFallback,
      updatedAt: updateFields.updatedAt || doc.updatedAt || updatedAtFallback,
    };

    await ensureInstructionVersionSnapshot(hydratedDoc, db);
  }
}

async function resolveInstructionSelections(
  selections = [],
  dbInstance = null,
) {
  if (!Array.isArray(selections) || selections.length === 0) return [];
  const normalized = selections
    .map((entry) => {
      if (isInstructionSelectionObject(entry)) {
        return {
          instructionId: entry.instructionId.trim(),
          version: Number.isInteger(entry.version) ? entry.version : null,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (normalized.length === 0) return [];

  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }

  const instructionIds = [
    ...new Set(normalized.map((item) => item.instructionId)),
  ];
  const versionCriteria = normalized
    .filter((item) => Number.isInteger(item.version))
    .map((item) => ({
      instructionId: item.instructionId,
      version: item.version,
    }));

  const versionQuery =
    versionCriteria.length > 0
      ? { $or: versionCriteria }
      : { instructionId: { $in: instructionIds } };

  const [currentDocs, versionDocs] = await Promise.all([
    db
      .collection("instructions")
      .find({ instructionId: { $in: instructionIds } })
      .toArray(),
    db.collection("instruction_versions").find(versionQuery).toArray(),
  ]);

  const currentMap = new Map();
  currentDocs.forEach((doc) => {
    if (doc && doc.instructionId) currentMap.set(doc.instructionId, doc);
  });

  const versionMap = new Map();
  versionDocs.forEach((doc) => {
    if (!doc || !doc.instructionId) return;
    const key = `${doc.instructionId}::${doc.version}`;
    versionMap.set(key, doc);
  });

  const results = [];
  const seen = new Set();

  for (const entry of normalized) {
    const key = `${entry.instructionId}::${entry.version === null ? "latest" : entry.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let doc = null;
    if (Number.isInteger(entry.version)) {
      doc = versionMap.get(`${entry.instructionId}::${entry.version}`);
    }
    if (!doc) {
      doc = currentMap.get(entry.instructionId);
    }
    if (!doc) continue;
    if (!doc.instructionId) doc.instructionId = entry.instructionId;
    if (!Number.isInteger(doc.version))
      doc.version = entry.version || doc.version || 1;
    results.push(doc);
  }

  return results;
}

async function resolveInstructionSelectionsV2(
  selections = [],
  dbInstance = null,
) {
  if (!Array.isArray(selections) || selections.length === 0) return [];

  const instructionIds = [
    ...new Set(
      selections
        .filter(isInstructionSelectionObject)
        .map((entry) => entry.instructionId?.trim())
        .filter(Boolean),
    ),
  ];

  if (instructionIds.length === 0) return [];

  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }

  const docs = await db
    .collection("instructions_v2")
    .find({ instructionId: { $in: instructionIds } })
    .toArray();

  return docs.map((doc) => {
    if (doc && doc._id && typeof doc._id.toString === "function") {
      return { ...doc, _id: doc._id.toString() };
    }
    return doc;
  });
}

function buildSystemPromptFromInstructionDocs(instructions = []) {
  if (!Array.isArray(instructions) || instructions.length === 0) return "";
  const normalize = (text) => {
    if (!text) return "";
    return String(text).replace(/\r\n/g, "\n");
  };

  const parts = [];
  for (const instruction of instructions) {
    if (!instruction) continue;
    if (instruction.type === "table") {
      const tableText = tableInstructionToJSON(instruction);
      if (tableText && tableText.trim()) {
        parts.push(tableText.trim());
      }
      continue;
    }
    const header = instruction.title ? `=== ${instruction.title} ===\n` : "";
    const body = normalize(instruction.content || "").trim();
    const chunk = `${header}${body}`.trim();
    if (chunk) parts.push(chunk);
  }

  return parts.filter(Boolean).join("\n\n");
}

function buildSystemPromptFromInstructionV2Docs(instructions = []) {
  if (!Array.isArray(instructions) || instructions.length === 0) return "";

  const parts = [];
  for (const instruction of instructions) {
    if (!instruction || !Array.isArray(instruction.dataItems)) continue;
    const sortedItems = [...instruction.dataItems].sort(
      (a, b) => (a?.order || 0) - (b?.order || 0),
    );

    if (sortedItems.length === 0) continue;

    if (instruction.name) {
      parts.push(`### ${instruction.name}`.trim());
    }

    for (const item of sortedItems) {
      if (!item) continue;
      const header = item.title ? `=== ${item.title} ===\n` : "";

      if (item.type === "table") {
        const tableJson = tableInstructionToJSON({
          instructionId: instruction.instructionId || item.itemId,
          type: "table",
          title: item.title,
          data: item.data,
          content: item.content || "",
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        });
        if (tableJson) {
          parts.push(
            `${header}ข้อมูลตารางในรูปแบบ JSON:\n\`\`\`json\n${tableJson}\n\`\`\``.trim(),
          );
        }
        continue;
      }

      const body = String(item.content || "").trim();
      if (body) {
        parts.push(`${header}${body}`.trim());
      }
    }
  }

  return parts.filter(Boolean).join("\n\n");
}

async function buildSystemPromptFromSelections(
  selectedInstructions = [],
  dbInstance = null,
) {
  if (!Array.isArray(selectedInstructions) || selectedInstructions.length === 0)
    return "";
  const hasObjectSelections = selectedInstructions.some(
    isInstructionSelectionObject,
  );

  let db = dbInstance;
  let client = null;
  if (!db && hasObjectSelections) {
    client = await connectDB();
    db = client.db("chatbot");
  }

  if (hasObjectSelections) {
    const [legacyDocs, v2Docs] = await Promise.all([
      resolveInstructionSelections(selectedInstructions, db),
      resolveInstructionSelectionsV2(selectedInstructions, db),
    ]);
    const promptSegments = [
      buildSystemPromptFromInstructionDocs(legacyDocs),
      buildSystemPromptFromInstructionV2Docs(v2Docs),
    ].filter((segment) => segment && segment.trim());

    if (promptSegments.length > 0) {
      return promptSegments.join("\n\n");
    }
  }

  let localDb = db;
  if (!localDb) {
    client = await connectDB();
    localDb = client.db("chatbot");
  }

  const instructionColl = localDb.collection("instruction_library");
  const instructionDocs = await instructionColl
    .find({
      date: { $in: selectedInstructions },
    })
    .toArray();

  return buildSystemPromptFromLibraries(instructionDocs);
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

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function uploadBufferToGridFS(bucket, filename, buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, options);
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

async function deleteGridFsEntries(bucket, entries = []) {
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.id) {
      const objectId = toObjectId(entry.id);
      if (!objectId) continue;
      try {
        // Check if file exists before attempting delete
        const files = await bucket.find({ _id: objectId }).toArray();
        if (files.length === 0) {
          // File doesn't exist, skip silently
          continue;
        }
        await bucket.delete(objectId);
      } catch (err) {
        // Only log unexpected errors (not FileNotFound)
        const isFileNotFound =
          err.code === "FileNotFound" ||
          err.code === 26 ||
          err.message?.includes("File not found") ||
          err.message?.includes("FileNotFound");

        if (!isFileNotFound) {
          console.warn("[GridFS] delete by id failed:", err?.message || err);
        }
      }
      continue;
    }
    if (entry.filename) {
      try {
        const files = await bucket.find({ filename: entry.filename }).toArray();
        for (const file of files) {
          try {
            await bucket.delete(file._id);
          } catch (err) {
            const isFileNotFound =
              err.code === "FileNotFound" ||
              err.code === 26 ||
              err.message?.includes("File not found") ||
              err.message?.includes("FileNotFound");

            if (!isFileNotFound) {
              console.warn(
                "[GridFS] delete by filename failed:",
                err?.message || err,
              );
            }
          }
        }
      } catch (err) {
        console.warn("[GridFS] find for delete failed:", err?.message || err);
      }
    }
  }
}

// ============================ Instruction Assets Helpers ============================
async function getInstructionAssets() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const assets = await coll.find({}).sort({ createdAt: -1 }).toArray();
    return assets.map((asset) => ({
      ...asset,
      url: resolveInstructionAssetUrl(asset.url, asset.fileName),
      thumbUrl: resolveInstructionAssetUrl(
        asset.thumbUrl || asset.url,
        asset.thumbFileName || asset.fileName,
      ),
      fileId: asset?.fileId ? asset.fileId.toString() : undefined,
      thumbFileId: asset?.thumbFileId
        ? asset.thumbFileId.toString()
        : undefined,
    }));
  } catch (e) {
    console.error("[Assets] Error fetching assets:", e);
    return [];
  }
}

function stripAssetExtension(name) {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > 0) {
    return trimmed.slice(0, lastDot).trim();
  }
  return trimmed;
}

function getInstructionAssetBaseName(asset) {
  if (!asset || typeof asset !== "object") return null;
  const normalize = (value) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const slug = normalize(asset.slug);
  if (slug) return slug;

  const fileName = normalize(asset.fileName);
  if (fileName) {
    const withoutExt = stripAssetExtension(fileName);
    if (withoutExt) return withoutExt;
  }

  const label = normalize(asset.label);
  if (label) {
    const generated = generateSlugFromLabel(label);
    return normalize(generated);
  }

  return null;
}

function buildInstructionAssetVariantFilenames(baseName, variant = "main") {
  if (!baseName || typeof baseName !== "string") return [];
  const trimmed = baseName.trim();
  if (!trimmed) return [];
  if (variant === "thumb") {
    return [`${trimmed}_thumb.jpg`, `${trimmed}_thumb.jpeg`];
  }
  return [`${trimmed}.jpg`, `${trimmed}.jpeg`];
}

function normalizeAssetKey(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function addAssetToLookup(map, asset) {
  if (!map || !asset || typeof asset !== "object") return;
  const candidates = new Map();
  const register = (text, prefer = false) => {
    if (!text || typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!candidates.has(trimmed)) candidates.set(trimmed, prefer);
    if (prefer) candidates.set(trimmed, true);
    const withoutExt = stripAssetExtension(trimmed);
    if (withoutExt && !candidates.has(withoutExt)) {
      candidates.set(withoutExt, prefer);
    } else if (withoutExt && prefer) {
      candidates.set(withoutExt, true);
    }
  };

  register(asset.label, true);
  register(asset.slug);
  register(asset.fileName);
  register(asset.alt);
  if (Array.isArray(asset.aliases)) {
    for (const alias of asset.aliases) {
      register(alias);
    }
  }
  if (Array.isArray(asset.tags)) {
    for (const tag of asset.tags) {
      register(tag);
    }
  }

  for (const [key, prefer] of candidates.entries()) {
    if (prefer || !map[key]) {
      map[key] = asset;
    }
    const normalizedKey = normalizeAssetKey(key);
    if (normalizedKey && (prefer || !map[normalizedKey])) {
      map[normalizedKey] = asset;
    }
  }
}

function buildAssetsLookup(assets = []) {
  const map = {};
  for (const asset of assets) {
    if (!asset) continue;
    addAssetToLookup(map, asset);
  }
  return map;
}

function findAssetInLookup(map, query) {
  if (!map || !query) return null;
  if (map[query]) return map[query];
  if (typeof query === "string") {
    const trimmed = query.trim();
    if (trimmed && map[trimmed]) return map[trimmed];
    const normalized = normalizeAssetKey(trimmed);
    if (normalized && map[normalized]) return map[normalized];
    const withoutExt = stripAssetExtension(trimmed);
    if (withoutExt) {
      if (map[withoutExt]) return map[withoutExt];
      const normalizedWithoutExt = normalizeAssetKey(withoutExt);
      if (normalizedWithoutExt && map[normalizedWithoutExt]) {
        return map[normalizedWithoutExt];
      }
    }
  }
  return null;
}

async function getInstructionAssetsMap() {
  const assets = await getInstructionAssets();
  return buildAssetsLookup(assets);
}

// ฟังก์ชันใหม่: ดึงรูปภาพจาก collections ที่เลือก (สำหรับ bot context)
async function getAssetsInstructionsText(selectedCollectionIds = null) {
  let assets = [];

  // ถ้ามีการเลือก collections ให้ใช้รูปจาก collections
  if (
    selectedCollectionIds &&
    Array.isArray(selectedCollectionIds) &&
    selectedCollectionIds.length > 0
  ) {
    assets = await getImagesFromSelectedCollections(selectedCollectionIds);
  } else {
    // fallback: ใช้รูปทั้งหมด (backward compatible)
    assets = await getInstructionAssets();
  }

  if (!assets || assets.length === 0) return "";
  const lines = [];
  lines.push(
    'การแทรกรูปภาพในการตอบ: ใช้แท็ก #[IMAGE:<ชื่อรูปภาพ>] ในตำแหน่งที่ต้องการ เช่น ตัวอย่าง: "ยอดชำระ 500 บาท #[IMAGE:QR Code ชำระเงิน] ขอบคุณค่ะ" หรือ "นี่คือสินค้าของเรา #[IMAGE:สินค้า A] ราคา 199 บาท" ระบบจะแยกเป็นข้อความ-รูปภาพ-ข้อความโดยอัตโนมัติ',
  );
  lines.push("รายการรูปที่สามารถใช้ได้ (ชื่อรูปภาพ: คำอธิบาย):");
  for (const a of assets) {
    const label = a.label;
    const desc = a.description || a.alt || "";
    lines.push(`- ${label}: ${desc}`);
  }
  return lines.join("\n");
}

// ฟังก์ชันใหม่: สร้าง assets map จาก collections ที่เลือก
async function getAssetsMapForBot(selectedCollectionIds = null) {
  const hasSelections =
    Array.isArray(selectedCollectionIds) && selectedCollectionIds.length > 0;
  const map = {};
  let primaryAssets = [];

  if (hasSelections) {
    try {
      primaryAssets = await getImagesFromSelectedCollections(
        selectedCollectionIds,
      );
    } catch (err) {
      console.error(
        "[Assets] Error fetching selected collection assets:",
        err?.message || err,
      );
    }
  }

  if (Array.isArray(primaryAssets) && primaryAssets.length > 0) {
    for (const asset of primaryAssets) {
      addAssetToLookup(map, asset);
    }
  }

  // If collections are explicitly selected, do not fall back to the full asset list.
  // This prevents the bot from accessing images outside the allowed collections.
  if (hasSelections) {
    return map;
  }

  let fallbackAssets = [];
  try {
    fallbackAssets = await getInstructionAssets();
  } catch (err) {
    console.error(
      "[Assets] Error fetching fallback instruction assets:",
      err?.message || err,
    );
  }

  if (Array.isArray(fallbackAssets) && fallbackAssets.length > 0) {
    for (const asset of fallbackAssets) {
      if (!asset) continue;
      addAssetToLookup(map, asset);
    }
  }

  return map;
}

// Parse assistant reply into segments of text and images based on #[IMAGE:label]
function parseMessageSegmentsByImageTokens(message, assetsMap) {
  if (!message || typeof message !== "string")
    return [{ type: "text", text: "" }];
  const segments = [];
  const regex = /#\[\s*IMAGE\s*:\s*([^\]]*?)\s*\]/gi;
  const uniquePush = (arr, value) => {
    const candidate = typeof value === "string" ? value.trim() : "";
    if (!candidate) return;
    if (!arr.includes(candidate)) {
      arr.push(candidate);
    }
  };
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
    const idx = match.index;
    const prev = message.slice(lastIndex, idx);
    if (prev && prev.trim() !== "") segments.push({ type: "text", text: prev });
    let rawLabel = (match[1] || "").trim();
    let cleanedLabel = rawLabel
      .replace(/^[“”"'`]+/, "")
      .replace(/[“”"'`]+$/, "");
    const candidates = [];
    uniquePush(candidates, cleanedLabel);
    if (cleanedLabel.endsWith(":")) {
      uniquePush(candidates, cleanedLabel.slice(0, -1));
    }
    const bulletStripped = cleanedLabel.replace(/^[\s]*[-*•●]+\s*/, "");
    if (bulletStripped !== cleanedLabel) {
      uniquePush(candidates, bulletStripped);
    }
    const numberStripped = cleanedLabel.replace(/^[\s]*\d+\s*[\).:-]\s*/, "");
    if (numberStripped !== cleanedLabel) {
      uniquePush(candidates, numberStripped);
    }
    if (cleanedLabel.includes(":")) {
      uniquePush(candidates, cleanedLabel.split(":")[0]);
    }
    if (cleanedLabel.includes(" - ")) {
      uniquePush(candidates, cleanedLabel.split(" - ")[0]);
    }
    if (cleanedLabel.includes("\n")) {
      uniquePush(candidates, cleanedLabel.split("\n")[0]);
    }

    let asset = null;
    let matchedLabel = null;
    for (const candidate of candidates) {
      asset = findAssetInLookup(assetsMap, candidate);
      if (asset) {
        matchedLabel = candidate;
        break;
      }
    }
    if (asset) {
      segments.push({
        type: "image",
        label: asset.label || matchedLabel || rawLabel,
        url: asset.url,
        thumbUrl: asset.thumbUrl || asset.url,
        alt: asset.alt || "",
        fileName: asset.fileName || `${rawLabel}.jpg`,
      });
    } else {
      // If asset not found, keep the literal token as text to avoid losing info
      segments.push({ type: "text", text: ` [รูป ${rawLabel} ไม่พบ] ` });
    }
    lastIndex = regex.lastIndex;
  }
  const tail = message.slice(lastIndex);
  if (tail && tail.trim() !== "") segments.push({ type: "text", text: tail });
  if (segments.length === 0) segments.push({ type: "text", text: message });
  return segments;
}

// ============================ Instruction Library ============================
// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "ChatCenter AI",
    version: "1.0.0",
  });
});

// Root redirects to admin dashboard
app.get("/", (req, res) => {
  res.redirect("/admin/dashboard");
});

// Route: list all instruction libraries
app.get("/admin/instructions/library", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const libraries = await libraryColl
      .find(
        {},
        {
          projection: {
            date: 1,
            savedAt: 1,
            type: 1,
            displayDate: 1,
            displayTime: 1,
            name: 1,
            description: 1,
          },
        },
      )
      .sort({ date: -1 })
      .toArray();
    res.json({ success: true, libraries });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: get instruction library by date (YYYY-MM-DD)
app.get("/admin/instructions/library/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const doc = await libraryColl.findOne({ date });
    if (!doc)
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    res.json({
      success: true,
      instructions: doc.instructions,
      savedAt: doc.savedAt,
      name: doc.name,
      description: doc.description,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: สร้าง instruction library ด้วยตนเอง
app.post("/admin/instructions/library-now", async (req, res) => {
  try {
    const { name, description } = req.body;
    const now = new Date();
    const thaiNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
    );
    const dateStr = thaiNow.toISOString().split("T")[0];
    const timeStr = thaiNow.toTimeString().split(" ")[0].replace(/:/g, "-");
    const libraryKey = `${dateStr}_manual_${timeStr}`;

    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const libraryColl = db.collection("instruction_library");

    const instructions = await instrColl.find({}).toArray();
    await libraryColl.updateOne(
      { date: libraryKey },
      {
        $set: {
          date: libraryKey,
          instructions,
          savedAt: new Date(),
          type: "manual",
          displayDate: dateStr,
          displayTime: thaiNow.toLocaleTimeString("th-TH"),
          name: name || `คลัง ${dateStr} ${timeStr}`,
          description:
            description ||
            `คลัง instruction ที่สร้างด้วยตนเองเมื่อวันที่ ${dateStr} เวลา ${timeStr}`,
        },
      },
      { upsert: true },
    );

    res.json({
      success: true,
      message: `บันทึก instructions ลงคลังเรียบร้อยแล้ว (${instructions.length} instructions)`,
      libraryKey: libraryKey,
      instructionCount: instructions.length,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: อัปเดตชื่อหรือคำอธิบายของ instruction library
app.put("/admin/instructions/library/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { name, description } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;

    if (Object.keys(updateFields).length === 0) {
      return res.json({ success: false, error: "ไม่มีข้อมูลที่ต้องการอัปเดต" });
    }

    const result = await libraryColl.updateOne(
      { date },
      { $set: updateFields },
    );
    if (result.matchedCount === 0) {
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: ลบ instruction library ตามวันที่ระบุ
app.delete("/admin/instructions/library/:date", async (req, res) => {
  try {
    const { date } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const result = await libraryColl.deleteOne({ date });
    if (result.deletedCount === 0) {
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: คืนค่า instruction library
app.post("/admin/instructions/restore/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { createLibraryBefore } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const libraryColl = db.collection("instruction_library");

    // ดึงข้อมูล library ที่ต้องการ restore
    const library = await libraryColl.findOne({ date });
    if (!library) {
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    }

    // บันทึกข้อมูลปัจจุบันลงคลังก่อน restore (ถ้าต้องการ)
    if (createLibraryBefore) {
      const currentInstructions = await instrColl.find({}).toArray();
      const now = new Date();
      const thaiNow = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
      );
      const dateStr = thaiNow.toISOString().split("T")[0];
      const timeStr = thaiNow.toTimeString().split(" ")[0].replace(/:/g, "-");
      const beforeRestoreKey = `${dateStr}_before_restore_${timeStr}`;

      await libraryColl.updateOne(
        { date: beforeRestoreKey },
        {
          $set: {
            date: beforeRestoreKey,
            instructions: currentInstructions,
            savedAt: new Date(),
            type: "before_restore",
            displayDate: dateStr,
            displayTime: thaiNow.toLocaleTimeString("th-TH"),
            name: `คลังก่อนคืนค่า ${dateStr}`,
            description: `คลัง instruction ที่บันทึกก่อนคืนค่าข้อมูลเมื่อวันที่ ${dateStr}`,
          },
        },
        { upsert: true },
      );
    }

    // ลบข้อมูลปัจจุบันทั้งหมด
    await instrColl.deleteMany({});

    // นำเข้าข้อมูลจาก library
    if (library.instructions && library.instructions.length > 0) {
      // ลบ _id เก่าและปรับปรุง timestamps
      const instructionsToInsert = library.instructions.map((instr) => {
        const { _id, ...instructionData } = instr;
        return {
          ...instructionData,
          restoredAt: new Date(),
          restoredFrom: date,
        };
      });

      await instrColl.insertMany(instructionsToInsert);
    }

    res.json({
      success: true,
      message: `คืนค่าข้อมูลจาก ${library.name || library.displayDate || date} เรียบร้อยแล้ว (${library.instructions.length} instructions)`,
      restoredCount: library.instructions.length,
    });
  } catch (err) {
    console.error("Restore error:", err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Excel Upload Routes ============================

// Route: Upload Excel file และแปลงเป็น instructions
app.post(
  "/admin/instructions/upload-excel",
  upload.single("excelFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาเลือกไฟล์ Excel" });
      }

      console.log(
        `[Excel] เริ่มประมวลผลไฟล์: ${req.file.originalname} (${req.file.size} bytes)`,
      );

      // ประมวลผลไฟล์ Excel
      const instructions = processExcelToInstructions(
        req.file.buffer,
        req.file.originalname,
      );

      if (instructions.length === 0) {
        return res.status(400).json({
          success: false,
          error: "ไม่พบข้อมูลในไฟล์ Excel หรือข้อมูลไม่ถูกต้อง",
        });
      }

      // บันทึก instructions ทั้งหมดลงฐานข้อมูล
      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("instructions");

      const insertPromises = instructions.map((instruction) => {
        instruction.createdAt = new Date();
        instruction.order = Date.now() + Math.random(); // เพื่อให้ไม่ซ้ำกัน
        return coll.insertOne(instruction);
      });

      await Promise.all(insertPromises);

      console.log(
        `[Excel] บันทึก ${instructions.length} instructions เรียบร้อยแล้ว`,
      );

      res.json({
        success: true,
        message: `อัพโหลดและประมวลผลเรียบร้อย! สร้าง ${instructions.length} instruction จาก ${instructions.length} แท็บ`,
        instructionsCount: instructions.length,
        sheets: instructions.map((i) => ({
          title: i.title,
          type: i.type,
          sheetName: i.sheetName,
        })),
      });
    } catch (error) {
      console.error("[Excel] ข้อผิดพลาดในการอัพโหลด:", error);

      let errorMessage = "เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel";
      if (error.message.includes("Unsupported file type")) {
        errorMessage =
          "ประเภทไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)";
      } else if (error.message.includes("File too large")) {
        errorMessage = "ไฟล์มีขนาดใหญ่เกินไป (ไม่เกิน 10MB)";
      } else if (error.message.includes("กรุณาเลือกไฟล์ Excel เท่านั้น")) {
        errorMessage = error.message;
      }

      res.status(400).json({ success: false, error: errorMessage });
    }
  },
);

// Route: Get preview ของไฟล์ Excel ก่อนอัพโหลด (ไม่บันทึกลงฐานข้อมูล)
app.post(
  "/admin/instructions/preview-excel",
  upload.single("excelFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาเลือกไฟล์ Excel" });
      }

      // ประมวลผลไฟล์ Excel แต่ไม่บันทึก
      const instructions = processExcelToInstructions(
        req.file.buffer,
        req.file.originalname,
      );

      res.json({
        success: true,
        preview: instructions.map((instruction) => ({
          title: instruction.title,
          type: instruction.type,
          sheetName: instruction.sheetName,
          contentPreview:
            instruction.type === "text"
              ? instruction.content.substring(0, 200) +
              (instruction.content.length > 200 ? "..." : "")
              : `ตาราง ${instruction.data.rows ? instruction.data.rows.length : 0} แถว, ${instruction.data.columns ? instruction.data.columns.length : 0} คอลัมน์`,
          rowCount:
            instruction.data && instruction.data.rows
              ? instruction.data.rows.length
              : 0,
          columnCount:
            instruction.data && instruction.data.columns
              ? instruction.data.columns.length
              : 0,
        })),
      });
    } catch (error) {
      console.error("[Excel] ข้อผิดพลาดในการดูตัวอย่าง:", error);
      res.status(400).json({
        success: false,
        error: "ไม่สามารถดูตัวอย่างไฟล์ Excel ได้: " + error.message,
      });
    }
  },
);

// ============================ Admin Authentication ============================

app.get("/api/auth/session", (req, res) => {
  res.json({
    success: true,
    requirePasscode: isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE),
    user: getAdminUserContext(req),
  });
});

app.get("/admin/login", (req, res) => {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return res.redirect("/admin/dashboard");
  }

  if (isAdminAuthenticated(req)) {
    return res.redirect("/admin/dashboard");
  }

  res.render("admin-login", {
    requirePasscode: true,
  });
});

app.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
      return res.status(400).json({
        success: false,
        error: "ยังไม่ได้เปิดใช้ระบบรหัสผ่าน",
      });
    }

    const { passcode } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const verifyResult = await verifyPasscode({
      db,
      passcode,
      masterPasscode: ADMIN_MASTER_PASSCODE,
      ipAddress: req.ip,
    });

    if (!verifyResult.valid) {
      return res.status(401).json({
        success: false,
        error: "รหัสผ่านไม่ถูกต้อง",
      });
    }

    registerAdminSession(req, verifyResult);
    res.json({
      success: true,
      user: getAdminUserContext(req),
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง",
    });
  }
});

app.post("/admin/logout", async (req, res) => {
  try {
    await destroyAdminSession(req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่",
    });
  }
});

app.use("/admin", enforceAdminLogin);

// ============================ Admin Passcode Management API ============================

app.get("/api/admin-passcodes", requireSuperadmin, async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const passcodes = await listPasscodes(db);
    res.json({ success: true, passcodes });
  } catch (err) {
    console.error("[Auth] List passcodes error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถโหลดรายการรหัสผ่านได้",
    });
  }
});

app.post("/api/admin-passcodes", requireSuperadmin, async (req, res) => {
  try {
    const { label, passcode } = req.body || {};
    const client = await connectDB();
    const db = client.db("chatbot");

    const sanitizedPasscode = sanitizePasscodeInput(passcode);
    if (
      isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE) &&
      sanitizedPasscode &&
      sanitizedPasscode === ADMIN_MASTER_PASSCODE
    ) {
      return res.status(400).json({
        success: false,
        error: "ไม่สามารถใช้รหัสผ่านเดียวกับรหัสหลักของระบบได้",
      });
    }

    const doc = await createPasscode(db, {
      label: sanitizeLabelInput(label),
      passcode: sanitizedPasscode,
      createdBy: getAdminUserContext(req)?.role || "superadmin",
    });
    res.status(201).json({ success: true, passcode: doc });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err?.message || "ไม่สามารถสร้างรหัสผ่านใหม่ได้",
    });
  }
});

app.patch(
  "/api/admin-passcodes/:id/toggle",
  requireSuperadmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body || {};
      const client = await connectDB();
      const db = client.db("chatbot");
      const doc = await togglePasscode(db, id, isActive !== false);
      res.json({ success: true, passcode: doc });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err?.message || "ไม่สามารถปรับสถานะรหัสผ่านได้",
      });
    }
  },
);

app.delete("/api/admin-passcodes/:id", requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    await deletePasscode(db, id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err?.message || "ไม่สามารถลบรหัสผ่านได้",
    });
  }
});

// ============================ Admin UI Routes ============================

// Redirect root admin to dashboard (ตรวจสอบการล็อกอินผ่าน middleware แล้ว)
app.get("/admin", (req, res) => {
  res.redirect("/admin/dashboard");
});

// Short link redirect (used in notifications)
app.get("/s/:code", async (req, res) => {
  try {
    const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
    if (!isValidShortCode(code)) {
      return res.status(404).send("Not Found");
    }
    const client = await connectDB();
    const db = client.db("chatbot");
    const doc = await resolveShortLink(db, code);
    if (!doc?.targetUrl) {
      return res.status(404).send("Not Found");
    }

    db.collection(SHORT_LINK_COLLECTION)
      .updateOne(
        { _id: doc._id },
        { $inc: { hitCount: 1 }, $set: { lastAccessedAt: new Date() } },
      )
      .catch((err) => {
        console.warn("[ShortLink] Update hit count failed:", err?.message || err);
      });

    return res.redirect(doc.targetUrl);
  } catch (err) {
    console.error("[ShortLink] Redirect error:", err?.message || err);
    return res.status(500).send("Error");
  }
});

// ============================ Line Bot Management API ============================

// Dynamic Line Bot webhook handler
app.post("/webhook/line/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const escapeRegex = (value = "") =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedBotId = escapeRegex(botId);
    const queryConditions = [
      { webhookUrl: { $regex: `${escapedBotId}$`, $options: "i" } },
    ];

    if (ObjectId.isValid(botId)) {
      queryConditions.push({ _id: new ObjectId(botId) });
    }

    const lineBot = await coll.findOne({ $or: queryConditions });

    if (!lineBot || lineBot.status !== "active") {
      return res.status(404).json({ error: "Line Bot ไม่พบหรือไม่เปิดใช้งาน" });
    }

    // Create Line client for this bot
    const lineConfig = {
      channelAccessToken: lineBot.channelAccessToken,
      channelSecret: lineBot.channelSecret,
    };
    const lineClient = new line.Client(lineConfig);

    // Handle Line webhook events
    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    if (events.length === 0) {
      console.warn(
        `[Line Bot Webhook] Received request without events for identifier: ${botId}`,
      );
      return res.status(200).json({ status: "NO_EVENTS" });
    }

    const queueOptions = {
      botType: "line",
      platform: "line",
      botId: lineBot._id ? lineBot._id.toString() : null,
      lineBotId: lineBot._id ? lineBot._id.toString() : botId,
      lineClient,
      channelAccessToken: lineBot.channelAccessToken,
      channelSecret: lineBot.channelSecret,
      aiModel: lineBot.aiModel || null,
      selectedInstructions: lineBot.selectedInstructions || [],
      selectedImageCollections: lineBot.selectedImageCollections || null,
    };

    for (const event of events) {
      try {
        await handleLineEvent(event, queueOptions);
      } catch (eventError) {
        console.error(
          `[Line Bot: ${lineBot.name}] Error handling event:`,
          eventError,
        );
      }
    }

    res.json({ status: "OK" });
  } catch (err) {
    console.error("Error handling Line webhook:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผล webhook" });
  }
});

// ============================ Facebook Bot Webhook Handler ============================

// Facebook Webhook verification (GET) and events (POST)
app.get("/webhook/facebook/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Find the Facebook Bot by ID
    const facebookBot = ObjectId.isValid(botId)
      ? await coll.findOne({ _id: new ObjectId(botId) })
      : null;

    if (!facebookBot || facebookBot.status !== "active") {
      // สำหรับขั้นตอน verify อนุญาต status อื่น ๆ ได้
      if (!facebookBot) {
        return res.status(404).send("Facebook Bot not found");
      }
    }

    // Handle Facebook webhook verification
    if (req.query["hub.mode"] === "subscribe") {
      if (req.query["hub.verify_token"] === facebookBot.verifyToken) {
        return res.status(200).send(req.query["hub.challenge"]);
      } else {
        console.warn(
          `[Facebook Bot: ${facebookBot.name}] Invalid verify token received: ${req.query["hub.verify_token"]}`,
        );
      }
    }

    return res.status(400).send("Invalid verification request");
  } catch (err) {
    console.error("Error handling Facebook webhook verification:", err);
    res.status(500).send("Server error");
  }
});

// Dynamic Facebook Bot webhook handler (POST events)
app.post("/webhook/facebook/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Find the Facebook Bot by ID
    const facebookBot = ObjectId.isValid(botId)
      ? await coll.findOne({ _id: new ObjectId(botId) })
      : null;

    if (!facebookBot) {
      return res.status(404).json({ error: "Facebook Bot ไม่พบ" });
    }

    const botIsActive = facebookBot.status === "active";
    const disableAiReply = !botIsActive;

    const pageId = facebookBot.pageId || facebookBot._id.toString();
    const accessToken = facebookBot.accessToken;

    const queueOptionsBase = {
      botType: "facebook",
      platform: "facebook",
      botId: facebookBot._id ? facebookBot._id.toString() : null,
      facebookAccessToken: facebookBot.accessToken,
      aiModel: facebookBot.aiModel || null,
      selectedInstructions: facebookBot.selectedInstructions || [],
      selectedImageCollections: facebookBot.selectedImageCollections || null,
      disableAiReply,
    };

    // Respond immediately to avoid Facebook retries
    res.status(200).json({ status: "EVENT_RECEIVED" });

    // Process webhook events asynchronously
    if (req.body.object === "page") {
      for (let entry of req.body.entry) {
        // Handle feed/comment events
        if (entry.changes) {
          for (let change of entry.changes) {
            if (change.field !== "feed" || !change.value) continue;
            const value = change.value;
            const postId =
              value.post_id || value.post?.id || value.parent_id || null;

            // Upsert post whenever we see feed change (post/comment/share)
            if (postId) {
              upsertFacebookPost(db, facebookBot, postId, "webhook").catch(
                (err) => {
                  console.error(
                    "[Facebook Webhook] Error upserting post:",
                    err?.message || err,
                  );
                },
              );
            }

            // Handle new comments
            if (value.item === "comment" && value.verb === "add") {
              if (disableAiReply) {
                continue;
              }
              const commentData = {
                id: value.comment_id,
                message: value.message,
                from: value.from,
              };

              handleFacebookComment(
                pageId,
                postId,
                commentData,
                accessToken,
                facebookBot,
              ).catch((err) => {
                console.error("[Facebook Webhook] Error processing comment:", err);
              });
            }
          }
        }

        // Handle messaging events (existing code)
        if (entry.messaging && Array.isArray(entry.messaging)) {
          for (let messagingEvent of entry.messaging) {
            // จัดการข้อความที่ส่งจากเพจเอง (echo) – ถือว่าเป็นข้อความจากแอดมินเพจ
            if (messagingEvent.message?.is_echo) {
              try {
                const targetUserId = messagingEvent.recipient?.id; // ผู้ใช้ปลายทางของข้อความจากเพจ
                const text = messagingEvent.message?.text?.trim();
                const metadata =
                  typeof messagingEvent.message?.metadata === "string"
                    ? messagingEvent.message.metadata.trim()
                    : "";
                const isBroadcastMessage = metadata === "broadcast_auto";

                // ข้ามข้อความที่ระบบส่งอัตโนมัติ (เช่น AI / follow-up) เพื่อหลีกเลี่ยงการบันทึกซ้ำ
                const automatedMetadata = ["ai_generated", "follow_up_auto"];
                if (metadata && automatedMetadata.includes(metadata)) {
                  console.log(
                    `[Facebook Bot: ${facebookBot.name}] Skip echo for automated message (${metadata}) to ${targetUserId}`,
                  );
                  continue;
                }

                if (!targetUserId) {
                  continue;
                }

                const client = await connectDB();
                const db = client.db("chatbot");
                const coll = db.collection("chat_history");

                // ตรวจสอบ keyword actions ก่อน (เช่น เปิด/ปิด AI, ปิดระบบติดตาม)
                const keywordResult = await detectKeywordAction(
                  text,
                  facebookBot.keywordSettings || {},
                  targetUserId,
                  "facebook",
                  facebookBot._id?.toString?.() || null,
                  true, // isFromAdmin = true
                );

                if (keywordResult.action) {
                  // ถ้ามี keyword action และต้องการส่งข้อความตอบกลับ
                  if (keywordResult.sendResponse && keywordResult.message) {
                    const controlDoc = {
                      senderId: targetUserId,
                      role: "assistant",
                      content: `[ระบบ] ${keywordResult.message}`,
                      timestamp: new Date(),
                      source: "admin_chat",
                      platform: "facebook",
                      botId: facebookBot?._id?.toString?.() || null,
                    };
                    const controlInsertResult = await coll.insertOne(controlDoc);
                    if (controlInsertResult?.insertedId) {
                      controlDoc._id = controlInsertResult.insertedId;
                    }

                    try {
                      await resetUserUnreadCount(targetUserId);
                    } catch (_) { }

                    // แจ้ง UI แอดมินแบบเรียลไทม์
                    try {
                      io.emit("newMessage", {
                        userId: targetUserId,
                        message: controlDoc,
                        sender: "assistant",
                        timestamp: controlDoc.timestamp,
                      });
                    } catch (_) { }
                  }
                  continue;
                }

                // คำสั่งควบคุม [ปิด]/[เปิด] (legacy)
                if (text === "[ปิด]" || text === "[เปิด]") {
                  const enable = text === "[เปิด]";
                  await setUserStatus(targetUserId, enable);

                  const controlText = enable
                    ? "เปิด AI สำหรับผู้ใช้นี้แล้ว"
                    : "ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว";
                  const controlDoc = {
                    senderId: targetUserId,
                    role: "assistant",
                    content: `[ระบบ] ${controlText}`,
                    timestamp: new Date(),
                    source: "admin_chat",
                    platform: "facebook",
                    botId: facebookBot?._id?.toString?.() || null,
                  };
                  const controlInsertResult = await coll.insertOne(controlDoc);
                  if (controlInsertResult?.insertedId) {
                    controlDoc._id = controlInsertResult.insertedId;
                  }

                  try {
                    await resetUserUnreadCount(targetUserId);
                  } catch (_) { }

                  // แจ้ง UI แอดมินแบบเรียลไทม์
                  try {
                    io.emit("newMessage", {
                      userId: targetUserId,
                      message: controlDoc,
                      sender: "assistant",
                      timestamp: controlDoc.timestamp,
                    });
                  } catch (_) { }
                } else {
                  // บันทึกข้อความจากแอดมินเพจเป็น assistant (เฉพาะกรณีไม่ใช่คำสั่ง)
                  const baseDoc = {
                    senderId: targetUserId,
                    role: "assistant",
                    content: text || "ไฟล์แนบ",
                    timestamp: new Date(),
                    source:
                      metadata === "admin_manual" || isBroadcastMessage
                        ? "admin_chat" // มาจากแอดมินหน้าเว็บ (ส่งผ่านระบบ)
                        : "admin_page", // มาจากแอดมินตอบในเพจโดยตรง (Facebook inbox)
                    metadata: metadata || null,
                    platform: "facebook",
                    botId: facebookBot?._id?.toString?.() || null,
                  };
                  const baseInsertResult = await coll.insertOne(baseDoc);
                  if (baseInsertResult?.insertedId) {
                    baseDoc._id = baseInsertResult.insertedId;
                  }
                  // ข้อความทั่วไปจากแอดมินเพจ – อัปเดต UI และ unread count
                  try {
                    await resetUserUnreadCount(targetUserId);
                  } catch (_) { }
                  try {
                    io.emit("newMessage", {
                      userId: targetUserId,
                      message: baseDoc,
                      sender: "assistant",
                      timestamp: baseDoc.timestamp,
                    });
                  } catch (_) { }
                }
              } catch (echoErr) {
                console.error(
                  `[Facebook Bot: ${facebookBot.name}] Error handling admin echo:`,
                  echoErr.message,
                );
              }
              continue;
            }

            if (messagingEvent.message) {
              const senderId = messagingEvent.sender.id;
              try {
                await ensureFacebookProfileDisplayName(
                  senderId,
                  facebookBot.accessToken,
                );
              } catch (profileErr) {
                console.warn(
                  `[Facebook Bot: ${facebookBot.name}] อัปเดตโปรไฟล์ ${senderId} ไม่สำเร็จ:`,
                  profileErr?.message || profileErr,
                );
              }
              const queueOptions = { ...queueOptionsBase };
              const itemsToQueue = [];
              const audioAttachments = [];
              const messageText = messagingEvent.message.text;

              if (messageText) {
                itemsToQueue.push({
                  data: { type: "text", text: messageText },
                });
              }

              if (messagingEvent.message.attachments) {
                for (const attachment of messagingEvent.message.attachments) {
                  if (attachment.type === "image" && attachment.payload?.url) {
                    try {
                      const base64 = await fetchFacebookImageAsBase64(
                        attachment.payload.url,
                      );
                      itemsToQueue.push({
                        data: {
                          type: "image",
                          base64,
                          text: "ผู้ใช้ส่งรูปภาพมา",
                        },
                      });
                    } catch (imgErr) {
                      console.error(
                        `[Facebook Bot: ${facebookBot.name}] Error fetching image:`,
                        imgErr.message,
                      );
                    }
                  } else if (attachment.type === "audio") {
                    audioAttachments.push({
                      type: "audio",
                      payload: {
                        url: attachment.payload?.url || null,
                        id: attachment.payload?.id || null,
                        duration: attachment.payload?.duration || null,
                      },
                    });
                  }
                }
              }

              if (audioAttachments.length > 0) {
                try {
                  const audioResponseSetting = await getSettingValue(
                    "audioAttachmentResponse",
                    DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
                  );
                  const replyText =
                    audioResponseSetting || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
                  const filteredReply = await filterMessage(replyText);
                  if (!disableAiReply) {
                    await sendFacebookMessage(
                      senderId,
                      filteredReply,
                      facebookBot.accessToken,
                      { metadata: "ai_generated" },
                    );
                  }
                  try {
                    await saveChatHistory(
                      senderId,
                      { type: "audio", attachments: audioAttachments },
                      disableAiReply ? "" : filteredReply,
                      "facebook",
                      facebookBot._id ? facebookBot._id.toString() : null,
                    );
                  } catch (historyErr) {
                    console.error(
                      `[Facebook Bot: ${facebookBot.name}] ไม่สามารถบันทึกประวัติไฟล์เสียงได้:`,
                      historyErr.message || historyErr,
                    );
                  }
                } catch (audioErr) {
                  console.error(
                    `[Facebook Bot: ${facebookBot.name}] Error handling audio attachment:`,
                    audioErr.message || audioErr,
                  );
                }
              }

              if (itemsToQueue.length === 0) {
                if (audioAttachments.length === 0) {
                  const fallbackText = "ขออภัย ระบบยังไม่รองรับไฟล์ประเภทนี้";
                  if (!disableAiReply) {
                    await sendFacebookMessage(
                      senderId,
                      fallbackText,
                      facebookBot.accessToken,
                      { metadata: "ai_generated" },
                    );
                  }
                  try {
                    await saveChatHistory(
                      senderId,
                      {
                        type: "unsupported",
                        attachments: messagingEvent.message.attachments || [],
                      },
                      disableAiReply ? "" : fallbackText,
                      "facebook",
                      facebookBot._id ? facebookBot._id.toString() : null,
                    );
                  } catch (historyErr) {
                    console.error(
                      `[Facebook Bot: ${facebookBot.name}] ไม่สามารถบันทึกประวัติไฟล์แนบที่ไม่รองรับได้:`,
                      historyErr.message || historyErr,
                    );
                  }
                }
                continue;
              }

              console.log(
                `[Facebook Bot: ${facebookBot.name}] รับข้อความเข้าคิวจาก ${senderId}: ${messageText || "[มีรูปภาพ]"}`,
              );

              for (const item of itemsToQueue) {
                try {
                  await addToQueue(senderId, { ...item }, queueOptions);
                } catch (queueErr) {
                  console.error(
                    `[Facebook Bot: ${facebookBot.name}] Error queuing message:`,
                    queueErr,
                  );
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error handling Facebook webhook:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผล webhook" });
    }
  }
});

// Helper function to send Facebook message
async function sendFacebookMessage(
  recipientId,
  message,
  accessToken,
  options = {},
  customAssetsMap = null,
) {
  const {
    metadata = null,
    messagingType = null,
    tag = null,
    selectedImageCollections = null,
  } = options || {};
  const normalizedMessage = normalizeOutgoingText(message);
  // แยกข้อความตามตัวแบ่ง [cut] → จากนั้น parse #[IMAGE:<label>] เป็น segments
  const parts = String(normalizedMessage || "")
    .split("[cut]")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // ใช้ customAssetsMap ถ้ามี ไม่เช่นนั้นดึงจาก database
  const assetsMap =
    customAssetsMap || (await getAssetsMapForBot(selectedImageCollections));
  const maxLength = 2000;

  for (const part of parts) {
    const segments = parseMessageSegmentsByImageTokens(part, assetsMap);
    for (const seg of segments) {
      if (seg.type === "text") {
        const text = seg.text || "";
        // chunk text to maxLength
        for (let i = 0; i < text.length; i += maxLength) {
          const chunk = text.slice(i, i + maxLength);
          if (!chunk.trim()) continue;
          try {
            const payload = { text: chunk };
            if (metadata) {
              payload.metadata = metadata;
            }
            const body = {
              recipient: { id: recipientId },
              message: payload,
            };
            if (messagingType) {
              body.messaging_type = messagingType;
            }
            if (tag) {
              body.tag = tag;
            }
            const response = await axios.post(
              `https://graph.facebook.com/v18.0/me/messages`,
              body,
              {
                params: { access_token: accessToken },
                headers: { "Content-Type": "application/json" },
              },
            );
            console.log(
              "Facebook text sent:",
              response.data?.message_id || "ok",
            );
          } catch (error) {
            const status = error.response?.status;
            const fbMessage =
              error.response?.data?.error?.message || error.message;
            const conciseError = status
              ? `Facebook API ${status}: ${fbMessage}`
              : fbMessage;
            console.error("Error sending Facebook text:", conciseError);
            throw new Error(conciseError);
          }
        }
      } else if (seg.type === "image") {
        const mode = await getSettingValue("facebookImageSendMode", "upload");
        const tryUploadFirst = mode === "upload";
        let sent = false;
        const sendByUrl = async () => {
          const messagePayload = {
            attachment: {
              type: "image",
              payload: { url: seg.url, is_reusable: true },
            },
          };
          if (metadata) {
            messagePayload.metadata = metadata;
          }
          const body = {
            recipient: { id: recipientId },
            message: messagePayload,
          };
          if (messagingType) {
            body.messaging_type = messagingType;
          }
          if (tag) {
            body.tag = tag;
          }
          const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages`,
            body,
            {
              params: { access_token: accessToken },
              headers: { "Content-Type": "application/json" },
            },
          );
          console.log(
            "Facebook image sent (url):",
            response.data?.message_id || "ok",
            seg.label,
          );
        };
        const sendByUpload = async () => {
          await sendFacebookImageByUpload(recipientId, seg, accessToken, {
            metadata,
            messagingType,
            tag,
          });
          console.log("Facebook image sent (upload):", seg.label);
        };
        try {
          if (tryUploadFirst) {
            await sendByUpload();
          } else {
            await sendByUrl();
          }
          sent = true;
        } catch (firstErr) {
          console.error(
            `Facebook image ${tryUploadFirst ? "upload" : "url"} mode failed:`,
            firstErr?.message || firstErr,
          );
          try {
            if (tryUploadFirst) {
              await sendByUrl();
            } else {
              await sendByUpload();
            }
            sent = true;
          } catch (secondErr) {
            console.error(
              "Facebook image both modes failed:",
              secondErr?.message || secondErr,
            );
            const alt = seg.alt ? `\n(รูป: ${seg.alt})` : "";
            try {
              const fallbackPayload = {
                text: `[ไม่สามารถส่งรูป ${seg.label}]${alt}`,
              };
              if (metadata) {
                fallbackPayload.metadata = metadata;
              }
              const body = {
                recipient: { id: recipientId },
                message: fallbackPayload,
              };
              if (messagingType) {
                body.messaging_type = messagingType;
              }
              if (tag) {
                body.tag = tag;
              }
              await axios.post(
                `https://graph.facebook.com/v18.0/me/messages`,
                body,
                {
                  params: { access_token: accessToken },
                  headers: { "Content-Type": "application/json" },
                },
              );
            } catch (_) { }
          }
        }
      }
    }
  }
}

// Upload image to Facebook to obtain attachment_id, then send it
async function sendFacebookImageMessage(
  recipientId,
  image,
  accessToken,
  options = {},
) {
  const { metadata = null, messagingType = null, tag = null } = options || {};
  if (!image || !image.url) {
    throw new Error("ไม่มี URL สำหรับรูปภาพ");
  }


  try {
    const messagePayload = {
      attachment: {
        type: "image",
        payload: {
          url: image.url,
          is_reusable: true,
        },
      },
    };
    if (metadata) {
      messagePayload.metadata = metadata;
    }
    const body = {
      recipient: { id: recipientId },
      message: messagePayload,
    };
    if (messagingType) {
      body.messaging_type = messagingType;
    }
    if (tag) {
      body.tag = tag;
    }
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      body,
      {
        params: { access_token: accessToken },
        headers: { "Content-Type": "application/json" },
      },
    );

  } catch (error) {
    const status = error.response?.status;
    const fbMessage = error.response?.data?.error?.message || error.message;
    const fbErrorCode = error.response?.data?.error?.code;
    const conciseError = status
      ? `Facebook API ${status}: ${fbMessage}`
      : fbMessage;
    console.error("[FollowUp Error] Facebook image send failed:", {
      recipientId,
      imageUrl: image.url,
      status,
      errorCode: fbErrorCode,
      message: fbMessage,
    });
    throw new Error(conciseError);
  }
}

async function sendFacebookImageByUpload(
  recipientId,
  seg,
  accessToken,
  options = {},
) {
  const { metadata = null, messagingType = null, tag = null } = options || {};
  const { buffer, filename, contentType } =
    await readInstructionAssetBuffer(seg);

  const form = new FormData();
  form.append(
    "message",
    JSON.stringify({
      attachment: { type: "image", payload: { is_reusable: true } },
    }),
  );
  form.append("filedata", buffer, { filename, contentType });

  // 1) Upload attachment to get attachment_id
  const uploadRes = await axios.post(
    `https://graph.facebook.com/v18.0/me/message_attachments`,
    form,
    {
      params: { access_token: accessToken },
      headers: form.getHeaders(),
    },
  );
  const attachment_id = uploadRes.data?.attachment_id;
  if (!attachment_id) throw new Error("ไม่ได้รับ attachment_id จาก Facebook");

  // 2) Send the message referencing attachment_id
  const messagePayload = {
    attachment: { type: "image", payload: { attachment_id } },
  };
  if (metadata) {
    messagePayload.metadata = metadata;
  }
  const body = {
    recipient: { id: recipientId },
    message: messagePayload,
  };
  if (messagingType) {
    body.messaging_type = messagingType;
  }
  if (tag) {
    body.tag = tag;
  }
  await axios.post(`https://graph.facebook.com/v22.0/me/messages`, body, {
    params: { access_token: accessToken },
    headers: { "Content-Type": "application/json" },
  });
}

// Helper: read local asset buffer robustly (handle ext variants and URL fallback)
async function readInstructionAssetBuffer(seg) {
  const label = seg.label || "";
  const requestedFileName = seg.fileName || "";
  let assetDoc = null;

  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    if (label) {
      // ค้นหาด้วย label ก่อน (รองรับทั้งภาษาไทยและอังกฤษ)
      assetDoc = await coll.findOne({ label });

      // ถ้าไม่เจอ ลองค้นหาด้วย slug (กรณีที่ส่ง slug มาแทน label)
      if (!assetDoc) {
        assetDoc = await coll.findOne({ slug: label });
      }
    }
    if (!assetDoc && requestedFileName) {
      assetDoc = await coll.findOne({
        $or: [
          { fileName: requestedFileName },
          { thumbFileName: requestedFileName },
        ],
      });
    }

    if (assetDoc) {
      const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
      const baseName = getInstructionAssetBaseName(assetDoc);
      const mainFileNames = Array.from(
        new Set(
          [
            assetDoc.fileName,
            ...buildInstructionAssetVariantFilenames(baseName, "main"),
          ]
            .filter((name) => typeof name === "string" && name.trim())
            .map((name) => name.trim()),
        ),
      );
      const thumbFileNames = Array.from(
        new Set(
          [
            assetDoc.thumbFileName,
            ...buildInstructionAssetVariantFilenames(baseName, "thumb"),
          ]
            .filter((name) => typeof name === "string" && name.trim())
            .map((name) => name.trim()),
        ),
      );
      const useThumb =
        requestedFileName &&
        (requestedFileName === assetDoc.thumbFileName ||
          /_thumb\.(jpe?g)$/i.test(requestedFileName));
      const candidateFileNames = useThumb ? thumbFileNames : mainFileNames;
      const targetId = useThumb ? assetDoc.thumbFileId : assetDoc.fileId;
      if (!candidateFileNames.length) {
        throw new Error("ไม่พบชื่อไฟล์ของรูปภาพที่ต้องการใช้งาน");
      }
      let resolvedFileName = candidateFileNames[0];
      let downloadStream = null;

      if (targetId) {
        const objectId = toObjectId(targetId);
        if (objectId) {
          downloadStream = bucket.openDownloadStream(objectId);
        }
      }

      if (!downloadStream) {
        for (const name of candidateFileNames) {
          try {
            downloadStream = bucket.openDownloadStreamByName(name);
            resolvedFileName = name;
            break;
          } catch (err) {
            const isFileNotFound =
              err?.code === "FileNotFound" ||
              err?.code === 26 ||
              err?.message?.includes("File not found") ||
              err?.message?.includes("FileNotFound");
            if (!isFileNotFound) {
              throw err;
            }
          }
        }
        if (!downloadStream) {
          throw new Error("ไม่พบไฟล์รูปภาพในระบบจัดเก็บ");
        }
      }

      const buffer = await streamToBuffer(downloadStream);
      let contentType = assetDoc.mime || "image/jpeg";
      if (!assetDoc.mime) {
        const ext = path.extname(resolvedFileName).toLowerCase();
        if (ext === ".png") contentType = "image/png";
        else if (ext === ".webp") contentType = "image/webp";
      }

      return {
        buffer,
        filename: resolvedFileName,
        contentType,
      };
    }
  } catch (err) {
    console.warn(
      "[Assets] read buffer from MongoDB failed, fallback to filesystem/url:",
      err?.message || err,
    );
  }

  const baseDir = ASSETS_DIR;
  const tryFilesSet = new Set();
  const addFileName = (name) => {
    if (!name || typeof name !== "string") return;
    const trimmed = name.trim();
    if (!trimmed) return;
    tryFilesSet.add(trimmed);
  };
  const addBaseVariants = (base) => {
    if (!base || typeof base !== "string") return;
    const trimmed = base.trim();
    if (!trimmed) return;
    addFileName(`${trimmed}.jpg`);
    addFileName(`${trimmed}.jpeg`);
    addFileName(`${trimmed}.png`);
    addFileName(`${trimmed}.webp`);
    addFileName(`${trimmed}_thumb.jpg`);
    addFileName(`${trimmed}_thumb.jpeg`);
  };

  addFileName(requestedFileName);
  addBaseVariants(label);
  const segSlug =
    typeof seg.slug === "string" && seg.slug.trim() ? seg.slug.trim() : null;
  addBaseVariants(segSlug);
  if (label) {
    addBaseVariants(generateSlugFromLabel(label));
  }

  const tryFiles = Array.from(tryFilesSet);

  for (const name of tryFiles) {
    const p = path.join(baseDir, name);
    try {
      if (fs.existsSync(p)) {
        const b = fs.readFileSync(p);
        const ext = path.extname(p).toLowerCase().replace(".", "") || "jpg";
        const ct =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
        return { buffer: b, filename: name, contentType: ct };
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (seg.url) {
    const resp = await axios.get(seg.url, { responseType: "arraybuffer" });
    const b = Buffer.from(resp.data);
    const urlExt = (seg.url.split(".").pop() || "jpg").toLowerCase();
    const ct = urlExt.startsWith("png")
      ? "image/png"
      : urlExt.startsWith("webp")
        ? "image/webp"
        : "image/jpeg";
    return {
      buffer: b,
      filename: seg.fileName || `${label || "image"}.jpg`,
      contentType: ct,
    };
  }

  throw new Error(
    "อ่านไฟล์รูปภาพไม่สำเร็จ: ไม่พบไฟล์ในระบบและไม่มี URL ให้ดึง",
  );
}

// Helper to download and optimize Facebook image to base64
async function fetchFacebookImageAsBase64(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  let buffer = Buffer.from(response.data, "binary");
  try {
    buffer = await sharp(buffer)
      .resize({
        width: 1024,
        height: 1024,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch (err) {
    console.error("Error processing Facebook image:", err.message);
  }
  return buffer.toString("base64");
}

// Convert table instruction data to a JSON string
function tableInstructionToJSON(instruction) {
  if (!instruction || instruction.type !== "table") return "";

  const columns = Array.isArray(instruction?.data?.columns)
    ? instruction.data.columns
    : [];
  const rowSource = Array.isArray(instruction?.data?.rows)
    ? instruction.data.rows
    : [];

  const normalizedColumns = columns.map((col) => {
    if (col === null || col === undefined) return "";
    return String(col);
  });

  const normalizedRows = rowSource.map((row) => {
    if (Array.isArray(row)) {
      return row.map((cell) => {
        if (cell === null || cell === undefined) return "";
        return String(cell).replace(/\r\n/g, "\n");
      });
    }
    if (row && typeof row === "object") {
      return normalizedColumns.map((col, idx) => {
        const key = col && col.trim() ? col : `column_${idx + 1}`;
        const value = row[col] ?? row[key] ?? row[idx] ?? "";
        return String(value).replace(/\r\n/g, "\n");
      });
    }
    return [String(row ?? "")];
  });

  const toIsoString = (value) => {
    if (!value) return undefined;
    try {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return undefined;
      return date.toISOString();
    } catch {
      return undefined;
    }
  };

  const payload = {
    instructionId:
      instruction.instructionId ||
      (instruction._id ? instruction._id.toString() : undefined),
    version: Number.isInteger(instruction.version)
      ? instruction.version
      : undefined,
    type: "table",
    title: instruction.title || undefined,
    content: instruction.content || undefined,
    createdAt: toIsoString(instruction.createdAt),
    updatedAt: toIsoString(instruction.updatedAt),
    data: {
      columns: normalizedColumns,
      rows: normalizedRows,
    },
  };

  if (!payload.instructionId) {
    delete payload.instructionId;
  }
  if (!payload.title || !payload.title.trim()) {
    delete payload.title;
  }
  if (!payload.content || !payload.content.trim()) {
    delete payload.content;
  }
  if (!payload.createdAt) {
    delete payload.createdAt;
  }
  if (!payload.updatedAt) {
    delete payload.updatedAt;
  }
  if (payload.version === undefined) {
    delete payload.version;
  }

  return JSON.stringify(payload, null, 2);
}

// Build system prompt text from selected instruction libraries
function buildSystemPromptFromLibraries(libraries) {
  const allInstructions = libraries.flatMap((lib) => lib.instructions || []);
  const parts = allInstructions
    .map((inst) => {
      if (inst.type === "table") {
        return tableInstructionToJSON(inst);
      }
      return inst.content || "";
    })
    .filter((text) => text && text.trim() !== "");
  return parts.join("\n\n");
}

// Helper function to process Facebook message with AI
async function processFacebookMessageWithAI(
  contentSequence,
  userId,
  facebookBot,
) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const aiModel = facebookBot.aiModel || "gpt-5";

    let systemPrompt = "คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้";
    const fbSelections = normalizeInstructionSelections(
      facebookBot.selectedInstructions || [],
    );
    if (fbSelections.length > 0) {
      const prompt = await buildSystemPromptFromSelections(fbSelections, db);
      if (prompt.trim()) {
        systemPrompt = prompt.trim();
      }
    }

    // เพิ่มคำแนะนำเกี่ยวกับการแทรกรูปภาพด้วยแท็ก #[IMAGE:<label>]
    const assetsText = await getAssetsInstructionsText();
    if (assetsText) {
      systemPrompt = `${systemPrompt}\n\n${assetsText}`;
    }

    const history = await getAIHistory(userId);

    const recoveryStrategies = [
      { key: "original", label: "ข้อมูลเดิมทั้งหมด" },
      { key: "drop_invalid_images", label: "ลบรูปภาพที่อาจมีปัญหา" },
      { key: "recent_text_only", label: "ใช้เฉพาะข้อความล่าสุดที่ใช้ได้" },
    ];

    const baseSequence = Array.isArray(contentSequence)
      ? contentSequence
      : [];

    let assistantReply = "";

    for (
      let attemptIndex = 0;
      attemptIndex < recoveryStrategies.length && !assistantReply;
      attemptIndex++
    ) {
      const strategy = recoveryStrategies[attemptIndex];
      const { sequence: sanitizedSequence, textParts, meta } =
        filterContentSequenceForStrategy(baseSequence, strategy.key);

      if (!sanitizedSequence.length) {
        console.warn(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ไม่มีข้อมูลสำหรับผู้ใช้ ${userId} ข้ามไปยังกลยุทธ์ถัดไป`,
        );
        continue;
      }

      const hasImages = sanitizedSequence.some((item) => item.type === "image");
      const combinedText = textParts.join("\n\n");

      if (!hasImages && !combinedText) {
        console.warn(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ไม่เหลือข้อความหรือรูปภาพหลังจัดการสำหรับผู้ใช้ ${userId}`,
        );
        continue;
      }

      if (
        meta.droppedImages > 0 ||
        meta.droppedTexts > 0 ||
        meta.droppedOthers > 0 ||
        meta.suspectImages > 0
      ) {
        const adjustments = [];
        if (meta.droppedImages > 0) {
          adjustments.push(`ลบรูปภาพ ${meta.droppedImages} รายการ`);
        }
        if (meta.suspectImages > 0) {
          adjustments.push(`พบรูปภาพที่ต้องจับตา ${meta.suspectImages} รายการ`);
        }
        if (meta.droppedTexts > 0) {
          adjustments.push(`ลบข้อความ ${meta.droppedTexts} รายการ`);
        }
        if (meta.droppedOthers > 0) {
          adjustments.push(`ละเว้นข้อมูลอื่น ${meta.droppedOthers} รายการ`);
        }
        console.log(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ปรับข้อมูล: ${adjustments.join(", ")}`,
        );
      }

      if (hasImages) {
        const imageCount = sanitizedSequence.filter((i) => i.type === "image").length;
        console.log(
          `[Facebook AI] ประมวลผลแบบ multimodal (กลยุทธ์ ${strategy.label}, รอบที่ ${attemptIndex + 1}/${recoveryStrategies.length}) ภาพ ${imageCount} รูป`,
        );
        assistantReply = await getAssistantResponseMultimodal(
          systemPrompt,
          history,
          sanitizedSequence,
          aiModel,
          facebookBot._id.toString(),
          "facebook",
          userId
        );
      } else {
        const preview = combinedText.substring(0, 100);
        console.log(
          `[Facebook AI] ประมวลผลข้อความ (กลยุทธ์ ${strategy.label}, รอบที่ ${attemptIndex + 1}/${recoveryStrategies.length}): ${preview}${combinedText.length > 100 ? "..." : ""}`,
        );
        assistantReply = await getAssistantResponseTextOnly(
          systemPrompt,
          history,
          combinedText,
          aiModel,
          facebookBot._id.toString(),
          "facebook",
          userId
        );
      }

      if (!assistantReply) {
        console.warn(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ไม่สามารถสร้างคำตอบสำหรับผู้ใช้ ${userId}`,
        );
      }
    }

    assistantReply = await filterMessage(assistantReply);

    // ดึงข้อความจากแท็ก THAI_REPLY ถ้ามี
    const finalReply = extractThaiReply(assistantReply);

    await saveChatHistory(
      userId,
      contentSequence,
      assistantReply,
      "facebook",
      facebookBot._id ? facebookBot._id.toString() : null,
    );

    return finalReply.trim();
  } catch (error) {
    console.error("Error processing Facebook message with AI:", error);
    return "";
  }
}

// Helper function to process message with AI
async function processMessageWithAI(message, userId, lineBot) {
  const aiModel = lineBot.aiModel || "gpt-5";
  const lineSelections = normalizeInstructionSelections(
    lineBot.selectedInstructions || [],
  );

  let systemPrompt = "คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้";

  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    if (lineSelections.length > 0) {
      const prompt = await buildSystemPromptFromSelections(lineSelections, db);
      if (prompt.trim()) {
        systemPrompt = prompt.trim();
      }
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const messageVariants = [
      {
        label: "ต้นฉบับ",
        content: sanitizeTextValue(message, { maxLength: 8000 }),
      },
      {
        label: "ตัดครึ่งท้าย",
        content: sanitizeTextValue(message, {
          maxLength: 4000,
          keepTail: true,
        }),
      },
    ].filter((variant, index, arr) => {
      if (!variant.content) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      return variant.content !== arr[index - 1].content;
    });

    if (messageVariants.length === 0) {
      console.warn(
        `[Line AI] ข้อความของผู้ใช้ ${userId} ไม่มีเนื้อหาที่สามารถส่งให้ AI ประมวลผลได้`,
      );
      return "";
    }

    for (let attemptIndex = 0; attemptIndex < messageVariants.length; attemptIndex++) {
      const variant = messageVariants[attemptIndex];
      const payloadMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: variant.content },
      ];

      try {
        console.log(
          `[Line AI] ประมวลผลข้อความ (${variant.label}, รอบที่ ${attemptIndex + 1}/${messageVariants.length}) สำหรับผู้ใช้ ${userId}`,
        );
        const aiConfig = normalizeAiConfig(lineBot.aiConfig || {});
        const payload = {
          model: aiModel,
          messages: payloadMessages,
        };
        if (aiConfig.apiMode === "responses" && aiConfig.reasoningEffort) {
          payload.reasoning_effort = aiConfig.reasoningEffort;
        }
        if (aiConfig.apiMode === "chat") {
          if (aiConfig.temperature !== null) payload.temperature = aiConfig.temperature;
          if (aiConfig.topP !== null) payload.top_p = aiConfig.topP;
          if (aiConfig.presencePenalty !== null) payload.presence_penalty = aiConfig.presencePenalty;
          if (aiConfig.frequencyPenalty !== null) payload.frequency_penalty = aiConfig.frequencyPenalty;
        }

        const response = await openai.chat.completions.create(payload);

        let assistantReply = response.choices[0].message.content;
        if (typeof assistantReply !== "string") {
          assistantReply = JSON.stringify(assistantReply);
        }

        if (response.usage) {
          const usage = response.usage;
          const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens`;
          assistantReply += tokenInfo;
        }

        const finalReply = extractThaiReply(assistantReply);
        return finalReply.trim();
      } catch (error) {
        console.error(
          `[Line AI] เกิดข้อผิดพลาดระหว่างประมวลผล (${variant.label}, รอบที่ ${attemptIndex + 1}/${messageVariants.length}):`,
          error,
        );
      }
    }

    return "";
  } catch (error) {
    console.error("Error preparing AI request:", error);
    return "";
  }

}

// Get all Line Bots
app.get("/api/line-bots", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    const lineBots = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json(lineBots);
  } catch (err) {
    console.error("Error fetching line bots:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Line Bot ได้" });
  }
});

// Get single Line Bot
app.get("/api/line-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    const lineBot = await coll.findOne({ _id: new ObjectId(id) });

    if (!lineBot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json(lineBot);
  } catch (err) {
    console.error("Error fetching line bot:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Line Bot ได้" });
  }
});

// Create new Line Bot
app.post("/api/line-bots", async (req, res) => {
  try {
    const {
      name,
      description,
      channelAccessToken,
      channelSecret,
      webhookUrl,
      status,
      isDefault,
      aiModel,
      selectedInstructions,
      selectedImageCollections,
      openaiApiKeyId,
    } = req.body;
    const notificationEnabled = parseOptionalBoolean(
      req.body?.notificationEnabled,
    );

    if (!name || !channelAccessToken || !channelSecret) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    // Generate unique webhook URL if not provided
    let finalWebhookUrl = webhookUrl;
    if (!finalWebhookUrl) {
      const baseUrl =
        process.env.PUBLIC_BASE_URL || "https://" + req.get("host");
      const uniqueId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      finalWebhookUrl = `${baseUrl}/webhook/line/${uniqueId}`;
    }

    const normalizedSelections = normalizeInstructionSelections(
      selectedInstructions || [],
    );
    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections || [],
    );

    const lineBot = {
      name,
      description: description || "",
      channelAccessToken,
      channelSecret,
      webhookUrl: finalWebhookUrl,
      status: status || "active",
      isDefault: isDefault || false,
      notificationEnabled: notificationEnabled !== false,
      aiModel: aiModel || "gpt-5", // AI Model เฉพาะสำหรับ Line Bot นี้
      aiConfig: normalizeAiConfig(req.body.aiConfig || req.body),
      selectedInstructions: normalizedSelections,
      selectedImageCollections: normalizedCollections,
      openaiApiKeyId: openaiApiKeyId || null,
      keywordSettings: {
        enableAI: { keyword: "", response: "" },
        disableAI: { keyword: "", response: "" },
        disableFollowUp: { keyword: "", response: "" },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await coll.insertOne(lineBot);
    lineBot._id = result.insertedId;

    res.status(201).json(lineBot);
  } catch (err) {
    console.error("Error creating line bot:", err);
    res.status(500).json({ error: "ไม่สามารถสร้าง Line Bot ได้" });
  }
});

// Update Line Bot
app.put("/api/line-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      channelAccessToken,
      channelSecret,
      webhookUrl,
      status,
      isDefault,
      selectedImageCollections,
    } = req.body;
    const notificationEnabled = parseOptionalBoolean(
      req.body?.notificationEnabled,
    );

    if (!name || !channelAccessToken || !channelSecret) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const existing = await coll.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany(
        { _id: { $ne: new ObjectId(id) } },
        { $set: { isDefault: false } },
      );
    }

    const updateData = {
      name,
      description: description || "",
      channelAccessToken,
      channelSecret,
      webhookUrl: webhookUrl || "",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: req.body.aiModel || existing.aiModel || "gpt-5", // AI Model เฉพาะสำหรับ Line Bot นี้
      aiConfig: normalizeAiConfig(
        req.body.aiConfig ? req.body.aiConfig : { ...existing.aiConfig, ...req.body },
      ),
      openaiApiKeyId: req.body.openaiApiKeyId !== undefined ? (req.body.openaiApiKeyId || null) : existing.openaiApiKeyId,
      updatedAt: new Date(),
    };
    if (typeof notificationEnabled === "boolean") {
      updateData.notificationEnabled = notificationEnabled;
    }

    if (Array.isArray(selectedImageCollections)) {
      updateData.selectedImageCollections = normalizeImageCollectionSelections(
        selectedImageCollections,
      );
    } else if (selectedImageCollections === null) {
      updateData.selectedImageCollections = [];
    }

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต Line Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating line bot:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต Line Bot ได้" });
  }
});

// Delete Line Bot
app.delete("/api/line-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({ message: "ลบ Line Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error deleting line bot:", err);
    res.status(500).json({ error: "ไม่สามารถลบ Line Bot ได้" });
  }
});

// Toggle Line Bot Status (Quick Enable/Disable)
app.patch("/api/line-bots/:id/toggle-status", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // Get current bot
    const bot = await coll.findOne({ _id: new ObjectId(id) });
    if (!bot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    // Toggle status: active <-> inactive
    const newStatus = bot.status === "active" ? "inactive" : "active";

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: newStatus, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({
      message: `เปลี่ยนสถานะ Line Bot เป็น ${newStatus === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"} เรียบร้อยแล้ว`,
      status: newStatus,
    });
  } catch (err) {
    console.error("Error toggling line bot status:", err);
    res.status(500).json({ error: "ไม่สามารถเปลี่ยนสถานะ Line Bot ได้" });
  }
});

// Toggle Line Bot Notification Enabled
app.patch("/api/line-bots/:id/toggle-notifications", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const bot = await coll.findOne({ _id: new ObjectId(id) });
    if (!bot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    const requested = parseOptionalBoolean(req.body?.enabled);
    const nextValue =
      typeof requested === "boolean"
        ? requested
        : bot.notificationEnabled !== false
          ? false
          : true;

    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { notificationEnabled: nextValue, updatedAt: new Date() } },
    );

    res.json({
      message: `เปลี่ยนสถานะการแจ้งเตือน Line Bot เป็น ${
        nextValue ? "เปิดใช้งาน" : "ปิดใช้งาน"
      } เรียบร้อยแล้ว`,
      notificationEnabled: nextValue,
    });
  } catch (err) {
    console.error("Error toggling line bot notifications:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถเปลี่ยนสถานะการแจ้งเตือน Line Bot ได้" });
  }
});

// Test Line Bot
app.post("/api/line-bots/:id/test", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const lineBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!lineBot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    // Test Line Bot connection
    try {
      const lineConfig = {
        channelAccessToken: lineBot.channelAccessToken,
        channelSecret: lineBot.channelSecret,
      };
      const testClient = new line.Client(lineConfig);

      // Try to get bot profile (simple test)
      const profile = await testClient.getProfile();

      res.json({
        message: `ทดสอบ Line Bot สำเร็จ: ${profile.displayName}`,
        profile: profile,
      });
    } catch (lineError) {
      res.status(400).json({
        error: "ไม่สามารถเชื่อมต่อ Line Bot ได้: " + lineError.message,
      });
    }
  } catch (err) {
    console.error("Error testing line bot:", err);
    res.status(500).json({ error: "ไม่สามารถทดสอบ Line Bot ได้" });
  }
});

// Route: อัปเดต instruction ที่เลือกใช้ใน Line Bot
app.put("/api/line-bots/:id/instructions", async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedInstructions } = req.body;

    if (!Array.isArray(selectedInstructions)) {
      return res
        .status(400)
        .json({ error: "selectedInstructions ต้องเป็น array" });
    }

    const normalizedSelections =
      normalizeInstructionSelections(selectedInstructions);

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedInstructions: normalizedSelections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต instruction ที่เลือกใช้เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating line bot instructions:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดต instruction ที่เลือกใช้ได้" });
  }
});

app.put("/api/line-bots/:id/image-collections", async (req, res) => {
  try {
    const { id } = req.params;
    let { selectedImageCollections } = req.body;

    if (selectedImageCollections === null) {
      selectedImageCollections = [];
    }

    if (!Array.isArray(selectedImageCollections)) {
      return res
        .status(400)
        .json({ error: "selectedImageCollections ต้องเป็น array หรือ null" });
    }

    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections,
    );

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedImageCollections: normalizedCollections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดตคลังรูปภาพที่เลือกเรียบร้อยแล้ว",
      selectedImageCollections: normalizedCollections,
    });
  } catch (err) {
    console.error("Error updating line bot image collections:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดตคลังรูปภาพของ Line Bot ได้" });
  }
});

// Route: อัปเดต keyword settings สำหรับ Line Bot
app.put("/api/line-bots/:id/keywords", async (req, res) => {
  try {
    const { id } = req.params;
    const { keywordSettings } = req.body;

    if (!keywordSettings || typeof keywordSettings !== "object") {
      return res.status(400).json({ error: "keywordSettings ต้องเป็น object" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // รองรับทั้งรูปแบบเก่า (string) และใหม่ (object with keyword, response)
    const normalizeKeywordSetting = (setting) => {
      if (!setting) return { keyword: "", response: "" };
      if (typeof setting === "string") {
        return { keyword: setting.trim(), response: "" };
      }
      return {
        keyword: (setting.keyword || "").trim(),
        response: (setting.response || "").trim(),
      };
    };

    const normalizedSettings = {
      enableAI: normalizeKeywordSetting(keywordSettings.enableAI),
      disableAI: normalizeKeywordSetting(keywordSettings.disableAI),
      disableFollowUp: normalizeKeywordSetting(keywordSettings.disableFollowUp),
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          keywordSettings: normalizedSettings,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดต keyword settings เรียบร้อยแล้ว",
      keywordSettings: normalizedSettings,
    });
  } catch (err) {
    console.error("Error updating line bot keyword settings:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต keyword settings ได้" });
  }
});

// ============================ Facebook Bot API Endpoints ============================

// Initialize a Facebook Bot stub for webhook verification
app.post("/api/facebook-bots/init", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const providedVerifyToken = (req.body && req.body.verifyToken) || null;
    const verifyToken =
      providedVerifyToken ||
      "vt_" +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10);

    // Create minimal bot stub
    const stub = {
      name: "",
      description: "",
      pageId: "",
      accessToken: "",
      webhookUrl: "", // set after _id known
      verifyToken,
      status: "setup",
      isDefault: false,
      aiModel: "gpt-5",
      selectedInstructions: [],
      selectedImageCollections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insert = await coll.insertOne(stub);
    const id = insert.insertedId;

    // Build webhook URL using bot id
    const baseUrl = process.env.PUBLIC_BASE_URL || "https://" + req.get("host");
    const webhookUrl = `${baseUrl}/webhook/facebook/${id.toString()}`;

    await coll.updateOne({ _id: id }, { $set: { webhookUrl } });

    return res.json({ id: id.toString(), webhookUrl, verifyToken });
  } catch (err) {
    console.error("Error initializing facebook bot stub:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถเตรียมข้อมูลสำหรับยืนยัน Webhook ได้" });
  }
});

// Get all Facebook Bots
app.get("/api/facebook-bots", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    const facebookBots = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json(facebookBots);
  } catch (err) {
    console.error("Error fetching facebook bots:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Facebook Bot ได้" });
  }
});

// Get single Facebook Bot
app.get("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });

    if (!facebookBot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json(facebookBot);
  } catch (err) {
    console.error("Error fetching facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Facebook Bot ได้" });
  }
});

// Create new Facebook Bot
app.post("/api/facebook-bots", async (req, res) => {
  try {
    const {
      name,
      description,
      pageId,
      accessToken,
      webhookUrl,
      verifyToken,
      status,
      isDefault,
      aiModel,
      selectedInstructions,
      selectedImageCollections,
      openaiApiKeyId,
    } = req.body;

    if (!name || !pageId || !accessToken) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const existing = await coll.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    // Generate unique webhook URL if not provided
    let finalWebhookUrl = webhookUrl;
    if (!finalWebhookUrl) {
      const baseUrl =
        process.env.PUBLIC_BASE_URL || "https://" + req.get("host");
      const uniqueId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      finalWebhookUrl = `${baseUrl}/webhook/facebook/${uniqueId}`;
    }

    const normalizedSelections = normalizeInstructionSelections(
      selectedInstructions || [],
    );
    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections || [],
    );

    let datasetId =
      typeof req.body.datasetId === "string" ? req.body.datasetId.trim() : "";
    if (!datasetId) {
      const datasetResult = await fetchFacebookDatasetId({
        pageId,
        accessToken,
      });
      if (datasetResult?.success) {
        datasetId = datasetResult.datasetId;
      } else {
        console.warn(
          "[FB Dataset] Auto-create dataset failed:",
          datasetResult?.error || datasetResult?.reason || "unknown",
        );
      }
    }

    const facebookBot = {
      name,
      description: description || "",
      pageId,
      accessToken,
      webhookUrl: finalWebhookUrl,
      verifyToken: verifyToken || "your_verify_token",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: aiModel || "gpt-5",
      aiConfig: normalizeAiConfig(req.body.aiConfig || req.body),
      selectedInstructions: normalizedSelections,
      selectedImageCollections: normalizedCollections,
      openaiApiKeyId: openaiApiKeyId || null,
      datasetId: datasetId || null,
      keywordSettings: {
        enableAI: { keyword: "", response: "" },
        disableAI: { keyword: "", response: "" },
        disableFollowUp: { keyword: "", response: "" },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await coll.insertOne(facebookBot);
    facebookBot._id = result.insertedId;

    res.status(201).json(facebookBot);
  } catch (err) {
    console.error("Error creating facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถสร้าง Facebook Bot ได้" });
  }
});

// Update Facebook Bot
app.put("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      pageId,
      accessToken,
      webhookUrl,
      verifyToken,
      status,
      isDefault,
      aiModel,
      selectedImageCollections,
    } = req.body;

    if (!name || !pageId || !accessToken) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Fetch existing bot data first
    const existing = await coll.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    let datasetId =
      typeof req.body.datasetId === "string" ? req.body.datasetId.trim() : "";
    if (!datasetId) {
      datasetId =
        typeof existing.datasetId === "string" ? existing.datasetId.trim() : "";
    }
    if (!datasetId) {
      const datasetResult = await fetchFacebookDatasetId({
        pageId,
        accessToken,
      });
      if (datasetResult?.success) {
        datasetId = datasetResult.datasetId;
      } else {
        console.warn(
          "[FB Dataset] Auto-create dataset failed:",
          datasetResult?.error || datasetResult?.reason || "unknown",
        );
      }
    }

    const updateData = {
      name,
      description: description || "",
      pageId,
      accessToken,
      webhookUrl: webhookUrl || "",
      verifyToken: verifyToken || "your_verify_token",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: aiModel || existing.aiModel || "gpt-5",
      aiConfig: normalizeAiConfig(
        req.body.aiConfig ? req.body.aiConfig : { ...existing.aiConfig, ...req.body },
      ),
      openaiApiKeyId: req.body.openaiApiKeyId !== undefined ? (req.body.openaiApiKeyId || null) : existing.openaiApiKeyId,
      datasetId: datasetId || null,
      updatedAt: new Date(),
    };

    if (Array.isArray(selectedImageCollections)) {
      updateData.selectedImageCollections = normalizeImageCollectionSelections(
        selectedImageCollections,
      );
    } else if (selectedImageCollections === null) {
      updateData.selectedImageCollections = [];
    }

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต Facebook Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต Facebook Bot ได้" });
  }
});

// Auto fetch/create Dataset ID for Facebook Bot
app.post("/api/facebook-bots/:id/dataset", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "รหัส Facebook Bot ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const bot = await coll.findOne({ _id: new ObjectId(id) });
    if (!bot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    const pageId =
      typeof req.body?.pageId === "string" && req.body.pageId.trim()
        ? req.body.pageId.trim()
        : bot.pageId;
    const accessToken =
      typeof req.body?.accessToken === "string" && req.body.accessToken.trim()
        ? req.body.accessToken.trim()
        : bot.accessToken;

    if (!pageId || !accessToken) {
      return res.status(400).json({
        error: "ต้องระบุ Page ID และ Access Token ให้ถูกต้องก่อน",
      });
    }

    const datasetResult = await fetchFacebookDatasetId({
      pageId,
      accessToken,
    });

    if (!datasetResult?.success) {
      return res.status(502).json({
        error: datasetResult?.error || datasetResult?.reason || "ไม่สามารถสร้าง Dataset ได้",
        code: datasetResult?.code || null,
        status: datasetResult?.status || null,
      });
    }

    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { datasetId: datasetResult.datasetId, updatedAt: new Date() } },
    );

    res.json({ success: true, datasetId: datasetResult.datasetId });
  } catch (err) {
    console.error("Error creating facebook dataset:", err);
    res.status(500).json({ error: "ไม่สามารถสร้าง Dataset ได้" });
  }
});

// Delete Facebook Bot
app.delete("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({ message: "ลบ Facebook Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error deleting facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถลบ Facebook Bot ได้" });
  }
});

// Toggle Facebook Bot Status (Quick Enable/Disable)
app.patch("/api/facebook-bots/:id/toggle-status", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Get current bot
    const bot = await coll.findOne({ _id: new ObjectId(id) });
    if (!bot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    // Toggle status: active <-> inactive
    const newStatus = bot.status === "active" ? "inactive" : "active";

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: newStatus, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: `เปลี่ยนสถานะ Facebook Bot เป็น ${newStatus === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"} เรียบร้อยแล้ว`,
      status: newStatus,
    });
  } catch (err) {
    console.error("Error toggling facebook bot status:", err);
    res.status(500).json({ error: "ไม่สามารถเปลี่ยนสถานะ Facebook Bot ได้" });
  }
});

// Test Facebook Bot
app.post("/api/facebook-bots/:id/test", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!facebookBot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    // Test Facebook Bot connection
    try {
      // Test Facebook Graph API connection
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${facebookBot.pageId}`,
        {
          params: {
            access_token: facebookBot.accessToken,
            fields: "name,id",
          },
        },
      );

      res.json({
        message: `ทดสอบ Facebook Bot สำเร็จ: ${response.data.name}`,
        profile: response.data,
      });
    } catch (fbError) {
      res.status(400).json({
        error: "ไม่สามารถเชื่อมต่อ Facebook Bot ได้: " + fbError.message,
      });
    }
  } catch (err) {
    console.error("Error testing facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถทดสอบ Facebook Bot ได้" });
  }
});

// Route: อัปเดต instruction ที่เลือกใช้ใน Facebook Bot
app.put("/api/facebook-bots/:id/instructions", async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedInstructions } = req.body;

    if (!Array.isArray(selectedInstructions)) {
      return res
        .status(400)
        .json({ error: "selectedInstructions ต้องเป็น array" });
    }

    const normalizedSelections =
      normalizeInstructionSelections(selectedInstructions);

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedInstructions: normalizedSelections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต instruction ที่เลือกใช้เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating facebook bot instructions:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดต instruction ที่เลือกใช้ได้" });
  }
});

app.put("/api/facebook-bots/:id/image-collections", async (req, res) => {
  try {
    const { id } = req.params;
    let { selectedImageCollections } = req.body;

    if (selectedImageCollections === null) {
      selectedImageCollections = [];
    }

    if (!Array.isArray(selectedImageCollections)) {
      return res
        .status(400)
        .json({ error: "selectedImageCollections ต้องเป็น array หรือ null" });
    }

    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections,
    );

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedImageCollections: normalizedCollections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดตคลังรูปภาพที่เลือกเรียบร้อยแล้ว",
      selectedImageCollections: normalizedCollections,
    });
  } catch (err) {
    console.error("Error updating facebook bot image collections:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดตคลังรูปภาพของ Facebook Bot ได้" });
  }
});

// ============================ Facebook Comment v2 Admin API ============================

// List captured posts (per page/bot)
app.get("/api/facebook-posts", requireAdmin, async (req, res) => {
  try {
    const { botId, limit = 50 } = req.query;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_page_posts");

    const query = {};
    if (botId) {
      const botRef = toObjectId(botId) || botId;
      query.botId = botRef;
    }

    const posts = await coll
      .find(query)
      .sort({ createdTime: -1, syncedAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .toArray();

    res.json({ posts });
  } catch (err) {
    console.error("Error listing facebook posts:", err);
    res.status(500).json({ error: "ไม่สามารถดึงรายการโพสต์ได้" });
  }
});

async function fetchPagePostsFromFB(pageId, accessToken, limit = 20) {
  try {
    const url = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        fields: FACEBOOK_POST_FIELDS,
        limit: limit,
      },
    });
    return response.data?.data || [];
  } catch (error) {
    console.error(
      `[Facebook API] Error fetching posts for page ${pageId}:`,
      error?.response?.data || error.message,
    );
    throw error;
  }
}

app.post("/api/facebook-posts/fetch", requireAdmin, async (req, res) => {
  try {
    const { botId } = req.body;
    if (!botId) {
      return res.status(400).json({ error: "Bot ID is required" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const bot = await db
      .collection("facebook_bots")
      .findOne({ _id: new ObjectId(botId) });

    if (!bot) {
      return res.status(404).json({ error: "Facebook Bot not found" });
    }

    const pageId = bot.pageId || bot._id.toString();
    const accessToken = bot.accessToken;

    if (!accessToken) {
      return res
        .status(400)
        .json({ error: "Page Access Token not found for this bot" });
    }

    console.log(`[Facebook Fetch] Fetching posts for bot ${bot.name} (${pageId})`);
    const posts = await fetchPagePostsFromFB(pageId, accessToken, 50);
    console.log(`[Facebook Fetch] Found ${posts.length} posts`);

    let upsertCount = 0;
    for (const post of posts) {
      try {
        // Reuse existing upsert logic, but mark source as 'manual_fetch'
        // We need to adapt the post object structure if necessary,
        // but fetchPagePostsFromFB uses the same fields as fetchFacebookPostDetails
        // so we can pass the post ID to upsertFacebookPost which fetches details again
        // OR we can optimize upsertFacebookPost to accept post data directly.
        // For safety and consistency, let's just use the ID to upsert,
        // although it's N+1 calls, it ensures we get the full details consistently.
        // Optimization: upsertFacebookPost already fetches details.
        await upsertFacebookPost(db, bot, post.id, "manual_fetch");
        upsertCount++;
      } catch (err) {
        console.error(
          `[Facebook Fetch] Error upserting post ${post.id}:`,
          err.message,
        );
      }
    }

    res.json({
      success: true,
      message: `ดึงข้อมูลสำเร็จ ${upsertCount} โพสต์`,
      count: upsertCount,
    });
  } catch (err) {
    console.error("Error fetching facebook posts from API:", err);
    res.status(500).json({
      error: "เกิดข้อผิดพลาดในการดึงข้อมูลจาก Facebook: " + err.message,
    });
  }

});

// Update reply profile per post (default OFF, activate per post)
app.patch(
  "/api/facebook-posts/:postId/reply-profile",
  requireAdmin,
  async (req, res) => {
    try {
      const { postId } = req.params;
      const {
        botId,
        mode,
        templateMessage,
        aiModel,
        systemPrompt,
        privateReplyTemplate,
        pullToChat,
        sendPrivateReply,
        isActive,
        overridePageDefault,
      } = req.body || {};

      if (!postId) {
        return res.status(400).json({ error: "ต้องระบุ postId" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("facebook_page_posts");

      const query = { postId };
      if (botId) {
        query.botId = toObjectId(botId) || botId;
      }

      const existing = await coll.findOne(query);
      if (!existing) {
        return res.status(404).json({ error: "ไม่พบโพสต์" });
      }

      const currentProfile = existing.replyProfile || {};
      const mergedProfile = {
        ...buildDefaultReplyProfile(),
        ...currentProfile,
        mode: mode || currentProfile.mode || "off",
        templateMessage: templateMessage ?? currentProfile.templateMessage,
        aiModel: aiModel ?? currentProfile.aiModel,
        systemPrompt: systemPrompt ?? currentProfile.systemPrompt,
        privateReplyTemplate:
          privateReplyTemplate ?? currentProfile.privateReplyTemplate,
        pullToChat:
          pullToChat === undefined
            ? currentProfile.pullToChat || false
            : Boolean(pullToChat),
        sendPrivateReply:
          sendPrivateReply === undefined
            ? currentProfile.sendPrivateReply || false
            : Boolean(sendPrivateReply),
        isActive:
          isActive === undefined
            ? currentProfile.isActive || false
            : Boolean(isActive),
        status:
          isActive === true
            ? "active"
            : currentProfile.status || "off",
        overridePageDefault:
          overridePageDefault === undefined
            ? true
            : Boolean(overridePageDefault),
      };

      await coll.updateOne(
        query,
        {
          $set: {
            replyProfile: mergedProfile,
            updatedAt: new Date(),
          },
        },
      );

      const updated = await coll.findOne(query);
      res.json({ success: true, post: updated });
    } catch (err) {
      console.error("Error updating reply profile:", err);
      res.status(500).json({ error: "ไม่สามารถอัปเดตการตั้งค่าโพสต์ได้" });
    }
  },
);

// Get page default comment policy
app.get(
  "/api/facebook-bots/:id/comment-policy",
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("facebook_comment_policies");

      const policy = await coll.findOne({
        botId: toObjectId(id) || id,
        scope: "page_default",
      });

      res.json({ policy: policy || buildDefaultReplyProfile() });
    } catch (err) {
      console.error("Error fetching comment policy:", err);
      res.status(500).json({ error: "ไม่สามารถดึงนโยบายคอมเมนต์ได้" });
    }
  },
);

// Set page default comment policy
app.put(
  "/api/facebook-bots/:id/comment-policy",
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        mode,
        templateMessage,
        aiModel,
        systemPrompt,
        privateReplyTemplate,
        pullToChat,
        sendPrivateReply,
        isActive,
      } = req.body || {};

      if (!mode || !["off", "template", "ai"].includes(mode)) {
        return res.status(400).json({ error: "mode ต้องเป็น off | template | ai" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const botsColl = db.collection("facebook_bots");
      const policiesColl = db.collection("facebook_comment_policies");

      const botId = toObjectId(id) || id;
      const bot = await botsColl.findOne({ _id: botId });
      if (!bot) {
        return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
      }

      const policy = {
        ...buildDefaultReplyProfile(),
        botId,
        pageId: bot.pageId || "",
        scope: "page_default",
        mode,
        templateMessage: templateMessage || "",
        aiModel: aiModel || "",
        systemPrompt: systemPrompt || "",
        privateReplyTemplate: privateReplyTemplate || "",
        pullToChat: Boolean(pullToChat),
        sendPrivateReply: Boolean(sendPrivateReply),
        isActive: Boolean(isActive),
        status: isActive ? "active" : "off",
        updatedAt: new Date(),
      };

      await policiesColl.updateOne(
        { botId, scope: "page_default" },
        {
          $set: policy,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );

      res.json({ success: true, policy });
    } catch (err) {
      console.error("Error updating comment policy:", err);
      res.status(500).json({ error: "ไม่สามารถตั้งค่านโยบายคอมเมนต์ได้" });
    }
  },
);

// Route: อัปเดต keyword settings สำหรับ Facebook Bot
app.put("/api/facebook-bots/:id/keywords", async (req, res) => {
  try {
    const { id } = req.params;
    const { keywordSettings } = req.body;

    if (!keywordSettings || typeof keywordSettings !== "object") {
      return res.status(400).json({ error: "keywordSettings ต้องเป็น object" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // รองรับทั้งรูปแบบเก่า (string) และใหม่ (object with keyword, response)
    const normalizeKeywordSetting = (setting) => {
      if (!setting) return { keyword: "", response: "" };
      if (typeof setting === "string") {
        return { keyword: setting.trim(), response: "" };
      }
      return {
        keyword: (setting.keyword || "").trim(),
        response: (setting.response || "").trim(),
      };
    };

    const normalizedSettings = {
      enableAI: normalizeKeywordSetting(keywordSettings.enableAI),
      disableAI: normalizeKeywordSetting(keywordSettings.disableAI),
      disableFollowUp: normalizeKeywordSetting(keywordSettings.disableFollowUp),
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          keywordSettings: normalizedSettings,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดต keyword settings เรียบร้อยแล้ว",
      keywordSettings: normalizedSettings,
    });
  } catch (err) {
    console.error("Error updating facebook bot keyword settings:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต keyword settings ได้" });
  }
});

// Route: ดึงรายการ instruction library ทั้งหมด
app.get("/api/instructions/library", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const [legacyLibraries, instructionV2Docs] = await Promise.all([
      libraryColl
        .find(
          {},
          {
            projection: {
              date: 1,
              name: 1,
              description: 1,
              displayDate: 1,
              displayTime: 1,
              type: 1,
              savedAt: 1,
              convertedInstructionId: 1,
              convertedAt: 1,
            },
          },
        )
        .sort({ date: -1 })
        .toArray(),
      db
        .collection("instructions_v2")
        .aggregate([
          {
            $project: {
              instructionId: 1,
              name: 1,
              description: 1,
              createdAt: 1,
              updatedAt: 1,
              dataItemCount: {
                $size: { $ifNull: ["$dataItems", []] },
              },
            },
          },
          { $sort: { updatedAt: -1, createdAt: -1 } },
        ])
        .toArray(),
    ]);

    const toDateSafe = (value) => {
      if (value instanceof Date) return value;
      if (!value) return new Date();
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return new Date();
      return parsed;
    };

    const formatThaiDate = (value) =>
      toDateSafe(value).toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "short",
        day: "2-digit",
      });

    const formatThaiTime = (value) =>
      toDateSafe(value).toLocaleTimeString("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    const v2Libraries = instructionV2Docs.map((doc) => {
      const createdAt = doc.createdAt || doc.updatedAt || new Date();
      const updatedAt = doc.updatedAt || createdAt;
      return {
        date: doc.instructionId,
        name: doc.name,
        description: doc.description,
        displayDate: formatThaiDate(createdAt),
        displayTime: formatThaiTime(createdAt),
        type: "v2",
        source: "v2",
        instructionId: doc.instructionId,
        dataItemCount: doc.dataItemCount || 0,
        createdAt,
        updatedAt,
      };
    });

    const legacyWithSource = legacyLibraries.map((lib) => ({
      ...lib,
      source: lib.source || "legacy",
      dataItemCount: lib.dataItemCount || 0,
      convertedInstructionId: lib.convertedInstructionId || null,
      convertedAt: lib.convertedAt || null,
    }));

    const getSortTimestamp = (entry) => {
      if (!entry) return 0;
      if (entry.updatedAt) return toDateSafe(entry.updatedAt).getTime();
      if (entry.savedAt) return toDateSafe(entry.savedAt).getTime();
      if (entry.createdAt) return toDateSafe(entry.createdAt).getTime();
      if (entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date)) {
        return toDateSafe(entry.date.slice(0, 10)).getTime();
      }
      return 0;
    };

    const combined = [...v2Libraries, ...legacyWithSource].sort(
      (a, b) => getSortTimestamp(b) - getSortTimestamp(a),
    );

    res.json({ success: true, libraries: combined });
  } catch (err) {
    console.error("Error fetching instruction libraries:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถดึงรายการ instruction library ได้" });
  }
});

// Route: แปลง instruction library (legacy) เป็น Instruction V2
app.post("/api/instructions/library/:date/convert-to-v2", async (req, res) => {
  try {
    const { date } = req.params;
    if (!date) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุวันที่ของคลัง instruction" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const v2Coll = db.collection("instructions_v2");

    const library = await libraryColl.findOne({ date });
    if (!library) {
      return res
        .status(404)
        .json({ success: false, error: "ไม่พบคลัง instruction ของวันที่ระบุ" });
    }

    const existingInstruction = await v2Coll.findOne({ libraryDate: date });
    if (existingInstruction) {
      return res.json({
        success: true,
        alreadyConverted: true,
        instruction: {
          ...existingInstruction,
          _id: existingInstruction._id.toString(),
        },
      });
    }

    const now = new Date();
    const instructions = Array.isArray(library.instructions)
      ? library.instructions
      : [];

    const buildInstructionName = () => {
      if (library.name) return library.name;
      if (library.displayDate) return `Library: ${library.displayDate}`;
      if (library.date) {
        const match =
          library.date &&
          library.date.match(
            /^(\d{4})-(\d{2})-(\d{2})_(.+?)_(\d{2})-(\d{2})-(\d{2})$/,
          );
        if (match) {
          const [, year, month, day, type, hour, minute] = match;
          const thaiMonths = [
            "ม.ค.",
            "ก.พ.",
            "มี.ค.",
            "เม.ย.",
            "พ.ค.",
            "มิ.ย.",
            "ก.ค.",
            "ส.ค.",
            "ก.ย.",
            "ต.ค.",
            "พ.ย.",
            "ธ.ค.",
          ];
          const monthName = thaiMonths[parseInt(month, 10) - 1] || month;
          const typeLabel =
            type === "manual"
              ? "บันทึกเอง"
              : type === "auto"
                ? "อัตโนมัติ"
                : type;
          return `Library: ${day} ${monthName} ${year} - ${hour}:${minute} (${typeLabel})`;
        }
        return `Library: ${library.date}`;
      }
      return "Instruction จาก Library เดิม";
    };

    const dataItems = instructions.map((oldInstr, index) => {
      const item = {
        itemId: generateDataItemId(),
        title: oldInstr.title || `ชุดข้อมูลที่ ${index + 1}`,
        type: oldInstr.type || "text",
        content: "",
        data: null,
        order: index + 1,
        createdAt: oldInstr.createdAt || now,
        updatedAt: oldInstr.updatedAt || now,
      };

      if (oldInstr.type === "text") {
        item.content = oldInstr.content || "";
      } else if (oldInstr.type === "table") {
        item.data = oldInstr.data || { columns: [], rows: [] };
      }
      return item;
    });

    const instructionDoc = {
      instructionId: generateInstructionId(),
      name: buildInstructionName(),
      description:
        library.description ||
        `Instruction จาก Library: ${library.displayDate || date}`,
      dataItems,
      usageCount: 0,
      libraryDate: date,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await v2Coll.insertOne(instructionDoc);
    instructionDoc._id = insertResult.insertedId.toString();

    await libraryColl.updateOne(
      { date },
      {
        $set: {
          convertedInstructionId: instructionDoc.instructionId,
          convertedAt: now,
        },
      },
    );

    res.json({ success: true, instruction: instructionDoc });
  } catch (err) {
    console.error("Error converting instruction library:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถแปลง instruction library เป็น V2 ได้",
    });
  }
});

// Route: ดึงรายละเอียด instruction library พร้อม instructions
app.get("/api/instructions/library/:date/details", async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const library = await libraryColl.findOne({ date });
    if (!library) {
      return res.status(404).json({ error: "ไม่พบคลัง instruction ที่ระบุ" });
    }

    res.json({
      success: true,
      library: {
        date: library.date,
        name: library.name,
        description: library.description,
        displayDate: library.displayDate,
        displayTime: library.displayTime,
        type: library.type,
        savedAt: library.savedAt,
        instructions: library.instructions || [],
      },
    });
  } catch (err) {
    console.error("Error fetching library details:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถดึงรายละเอียดคลัง instruction ได้" });
  }
});

// Route: ดึงรายการ instructions พร้อมประวัติเวอร์ชัน
app.get("/api/instructions", async (req, res) => {
  try {
    await ensureInstructionIdentifiers();

    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const versionColl = db.collection("instruction_versions");

    const instructions = await instrColl
      .find({})
      .sort({ order: 1, title: 1, createdAt: 1 })
      .toArray();
    const instructionIds = instructions
      .map((instr) => instr.instructionId)
      .filter(Boolean);

    let versionDocs = [];
    if (instructionIds.length > 0) {
      versionDocs = await versionColl
        .find({ instructionId: { $in: instructionIds } })
        .sort({ instructionId: 1, version: -1 })
        .toArray();
    }

    const versionMap = new Map();
    for (const doc of versionDocs) {
      if (!doc || !doc.instructionId) continue;
      if (!versionMap.has(doc.instructionId))
        versionMap.set(doc.instructionId, []);
      versionMap.get(doc.instructionId).push(doc);
    }

    const response = instructions.map((instr) => {
      const currentType = instr.type || "text";
      const historyDocs = versionMap.get(instr.instructionId) || [];
      const versionHistory = historyDocs.map((item) => ({
        version: item.version,
        title: item.title || "",
        type: item.type || "text",
        updatedAt: item.updatedAt || item.snapshotAt || item.createdAt || null,
        snapshotAt: item.snapshotAt || null,
      }));

      let preview = "";
      if (currentType === "table") {
        const rowCount = instr?.data?.rows ? instr.data.rows.length : 0;
        const colCount = instr?.data?.columns ? instr.data.columns.length : 0;
        preview = `ตาราง ${rowCount} แถว ${colCount} คอลัมน์`;
      } else {
        const text = (instr?.content || "").toString();
        preview = text.length > 160 ? `${text.slice(0, 157)}...` : text;
      }

      return {
        _id: instr._id,
        instructionId: instr.instructionId,
        version: instr.version || 1,
        title: instr.title || "",
        type: currentType,
        content: instr.content || "",
        data: currentType === "table" ? instr.data || null : null,
        createdAt: instr.createdAt || null,
        updatedAt: instr.updatedAt || null,
        order: instr.order || null,
        preview,
        versionHistory,
      };
    });

    res.json({ success: true, instructions: response });
  } catch (err) {
    console.error("Error fetching instructions with versions:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายการ instructions ได้" });
  }
});

// Route: ดึงรายละเอียด instruction ตาม instructionId และเวอร์ชัน
app.get(
  "/api/instructions/:instructionId/versions/:version",
  async (req, res) => {
    try {
      const { instructionId, version } = req.params;
      if (!instructionId) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาระบุ instructionId" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const instrColl = db.collection("instructions");
      const versionColl = db.collection("instruction_versions");

      const versionParam =
        version?.toLowerCase?.() === "latest" ? "latest" : version;
      let doc = null;
      let source = "version";

      if (versionParam === "latest") {
        doc = await instrColl.findOne({ instructionId });
        source = "current";
      } else {
        const versionNumber = parseInt(versionParam, 10);
        if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
          return res
            .status(400)
            .json({ success: false, error: "เวอร์ชันไม่ถูกต้อง" });
        }
        doc = await versionColl.findOne({
          instructionId,
          version: versionNumber,
        });
        if (!doc) {
          // หากไม่พบในคลังเวอร์ชัน ลองดึงเวอร์ชันปัจจุบันใน instructions
          doc = await instrColl.findOne({
            instructionId,
            version: versionNumber,
          });
          if (doc) source = "current";
        }
      }

      if (!doc) {
        return res
          .status(404)
          .json({ success: false, error: "ไม่พบ instruction เวอร์ชันที่ระบุ" });
      }

      const payload = {
        instructionId: doc.instructionId || instructionId,
        version:
          doc.version || (source === "current" ? doc.version || 1 : null),
        title: doc.title || "",
        type: doc.type || "text",
        content: doc.content || "",
        data: doc.type === "table" ? doc.data || null : null,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null,
        snapshotAt: doc.snapshotAt || null,
        source,
      };

      res.json({ success: true, instruction: payload });
    } catch (err) {
      console.error("Error fetching instruction version detail:", err);
      res.status(500).json({
        success: false,
        error: "ไม่สามารถดึงรายละเอียด instruction ได้",
      });
    }
  },
);

// Dashboard (V2 - New Instruction System)
app.get("/admin/dashboard", async (req, res) => {
  try {
    const instructions = await getInstructionsV2();
    const aiEnabled = await getAiEnabled();
    res.render("admin-dashboard-v2", { instructions, aiEnabled });
  } catch (err) {
    res.render("admin-dashboard-v2", {
      instructions: [],
      aiEnabled: false,
      error: err.message,
    });
  }
});

// API Usage Statistics Page
app.get("/admin/api-usage", async (req, res) => {
  res.render("admin-api-usage");
});

// Create Data Item (V2) - Full Page Editor for Text
app.get(
  "/admin/instructions-v2/:instructionId/data-items/new",
  async (req, res) => {
    try {
      const { instructionId } = req.params;
      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("instructions_v2");

      const instruction = await coll.findOne({
        _id: new ObjectId(instructionId),
      });
      if (!instruction) {
        return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
      }

      const templateDataItem = {
        _id: instructionId,
        instructionId: "",
        type: "text",
        title: "",
        content: "",
        data: null,
        createdAt: null,
        updatedAt: null,
        parentInstructionName: instruction.name,
      };

      res.render("edit-data-item-v2", {
        instruction: templateDataItem,
        instructionId,
        itemId: "",
        isNew: true,
      });
    } catch (err) {
      console.error("Error rendering create data item page:", err);
      res.redirect(
        "/admin/dashboard?error=" + encodeURIComponent(err.message || "Error"),
      );
    }
  },
);

// Edit Data Item (V2) - Full Page Editor
app.get("/admin/instructions-v2/:instructionId/data-items/:itemId/edit", async (req, res) => {
  try {
    const { instructionId, itemId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    // ดึง instruction
    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    // หา data item
    const dataItem = (instruction.dataItems || []).find(item => item.itemId === itemId);
    if (!dataItem) {
      return res.redirect("/admin/dashboard?error=ไม่พบชุดข้อมูล");
    }

    // สร้าง instruction object สำหรับ EJS (ใช้ structure แบบเดิม)
    const instructionForEdit = {
      _id: instructionId,
      instructionId: dataItem.itemId,
      type: dataItem.type || 'text',
      title: dataItem.title || '',
      content: dataItem.content || '',
      data: dataItem.data || null,
      createdAt: dataItem.createdAt,
      updatedAt: dataItem.updatedAt,
      parentInstructionName: instruction.name // เพิ่มชื่อ instruction หลักสำหรับแสดง
    };

    res.render("edit-data-item-v2", {
      instruction: instructionForEdit,
      instructionId: instructionId,
      itemId: itemId,
      isNew: false,
    });
  } catch (err) {
    console.error("Error rendering edit data item page:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message));
  }
});

// Create Data Item (V2) - Save
app.post(
  "/admin/instructions-v2/:instructionId/data-items/new",
  async (req, res) => {
    try {
      const { instructionId } = req.params;
      let { type = "text", title = "", content = "", tableData } = req.body;

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("instructions_v2");

      const instruction = await coll.findOne({
        _id: new ObjectId(instructionId),
      });
      if (!instruction) {
        return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
      }

      title = (title || "").trim();
      if (!title) {
        return res.redirect(
          `/admin/instructions-v2/${instructionId}/data-items/new?error=` +
          encodeURIComponent("กรุณาระบุชื่อชุดข้อมูล"),
        );
      }

      const allowedTypes = ["text", "table"];
      if (!allowedTypes.includes(type)) {
        type = "text";
      }

      const items = Array.isArray(instruction.dataItems)
        ? instruction.dataItems
        : [];
      const now = new Date();
      const newItem = {
        itemId: generateDataItemId(),
        title,
        type,
        content: "",
        data: null,
        order: items.length + 1,
        createdAt: now,
        updatedAt: now,
      };

      if (type === "table") {
        if (!tableData || tableData.trim() === "") {
          return res.redirect(
            `/admin/instructions-v2/${instructionId}/data-items/new?error=` +
            encodeURIComponent("กรุณากรอกข้อมูลตารางหรือเลือกประเภทข้อความ"),
          );
        }
        try {
          const parsedData = JSON.parse(tableData);
          if (!parsedData || typeof parsedData !== "object") {
            throw new Error("invalid");
          }
          newItem.data = parsedData;
          newItem.content = "";
        } catch (parseErr) {
          console.error("Invalid table data payload:", parseErr);
          return res.redirect(
            `/admin/instructions-v2/${instructionId}/data-items/new?error=` +
            encodeURIComponent("ข้อมูลตารางไม่ถูกต้อง"),
          );
        }
      } else {
        newItem.content = content || "";
        newItem.data = null;
      }

      await coll.updateOne(
        { _id: new ObjectId(instructionId) },
        {
          $push: { dataItems: newItem },
          $set: { updatedAt: now },
        },
      );

      res.redirect(
        `/admin/dashboard?success=${encodeURIComponent(
          "สร้างชุดข้อมูลเรียบร้อยแล้ว",
        )}&instructionId=${instructionId}`,
      );
    } catch (err) {
      console.error("Error creating data item:", err);
      res.redirect(
        "/admin/dashboard?error=" + encodeURIComponent(err.message || "Error"),
      );
    }
  },
);

// Save Data Item (V2) - Full Page Editor
app.post("/admin/instructions-v2/:instructionId/data-items/:itemId/edit", async (req, res) => {
  try {
    const { instructionId, itemId } = req.params;
    const { type, title, content, tableData } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    // ดึง instruction
    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    // หา index ของ data item
    const itemIndex = (instruction.dataItems || []).findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return res.redirect("/admin/dashboard?error=ไม่พบชุดข้อมูล");
    }

    const now = new Date();
    const updateFields = {};
    const isTable = type === 'table';
    let parsedTableData = null;

    // อัปเดต title
    if (title !== undefined) {
      updateFields[`dataItems.${itemIndex}.title`] = title.trim();
    }

    // อัปเดตตาม type
    if (isTable) {
      // ตาราง: อัปเดต data field
      if (!tableData || tableData.trim() === "") {
        return res.redirect(
          `/admin/instructions-v2/${instructionId}/data-items/${itemId}/edit?error=${encodeURIComponent("กรุณากรอกข้อมูลตาราง")}`,
        );
      }
      try {
        parsedTableData = JSON.parse(tableData);
        if (!parsedTableData || typeof parsedTableData !== "object") {
          throw new Error("Invalid table payload");
        }
      } catch (parseErr) {
        console.error("Error parsing table data:", parseErr);
        return res.redirect(
          `/admin/instructions-v2/${instructionId}/data-items/${itemId}/edit?error=${encodeURIComponent("ข้อมูลตารางไม่ถูกต้อง")}`,
        );
      }
      updateFields[`dataItems.${itemIndex}.data`] = parsedTableData;
      updateFields[`dataItems.${itemIndex}.content`] = ""; // ล้าง content สำหรับตาราง
    } else {
      // ข้อความ: อัปเดต content field
      updateFields[`dataItems.${itemIndex}.content`] = content || "";
      updateFields[`dataItems.${itemIndex}.data`] = null; // ล้าง data สำหรับข้อความ
    }

    updateFields[`dataItems.${itemIndex}.type`] = isTable ? "table" : "text";
    updateFields[`dataItems.${itemIndex}.updatedAt`] = now;
    updateFields.updatedAt = now;

    // บันทึกลง database
    await coll.updateOne(
      { _id: new ObjectId(instructionId) },
      { $set: updateFields }
    );

    res.redirect(`/admin/dashboard?success=แก้ไขชุดข้อมูลเรียบร้อยแล้ว&instructionId=${instructionId}`);
  } catch (err) {
    console.error("Error saving data item:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message));
  }
});

// ============================================
// Instructions V3 - Jspreadsheet Editor
// ============================================

// View/Edit Data Item (V3) - Jspreadsheet Full Page Editor
app.get("/admin/instructions-v3/:instructionId/data-items/:itemId/edit", async (req, res) => {
  try {
    const { instructionId, itemId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    // ดึง instruction
    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    // หา data item
    const dataItem = (instruction.dataItems || []).find(item => item.itemId === itemId);
    if (!dataItem) {
      return res.redirect("/admin/dashboard?error=ไม่พบชุดข้อมูล");
    }

    // สร้าง instruction object สำหรับ EJS
    const instructionForEdit = {
      _id: instructionId,
      instructionId: dataItem.itemId,
      type: dataItem.type || 'table',
      title: dataItem.title || '',
      content: dataItem.content || '',
      data: dataItem.data || null,
      createdAt: dataItem.createdAt,
      updatedAt: dataItem.updatedAt,
      parentInstructionName: instruction.name
    };

    res.render("edit-data-item-v3", {
      instruction: instructionForEdit,
      instructionId: instructionId,
      itemId: itemId,
      isNew: false,
    });
  } catch (err) {
    console.error("Error rendering V3 edit data item page:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message));
  }
});

// Create Data Item (V3) - Jspreadsheet Full Page Editor
app.get("/admin/instructions-v3/:instructionId/data-items/new", async (req, res) => {
  try {
    const { instructionId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    const templateDataItem = {
      _id: instructionId,
      instructionId: "",
      type: "table",
      title: "",
      content: "",
      data: null,
      createdAt: null,
      updatedAt: null,
      parentInstructionName: instruction.name,
    };

    res.render("edit-data-item-v3", {
      instruction: templateDataItem,
      instructionId,
      itemId: "",
      isNew: true,
    });
  } catch (err) {
    console.error("Error rendering V3 create data item page:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message || "Error"));
  }
});

// Save New Data Item (V3)
app.post("/admin/instructions-v3/:instructionId/data-items/new", async (req, res) => {
  try {
    const { instructionId } = req.params;
    let { type = "table", title = "", content = "", tableData } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    title = (title || "").trim();
    if (!title) {
      return res.redirect(
        `/admin/instructions-v3/${instructionId}/data-items/new?error=` +
        encodeURIComponent("กรุณาระบุชื่อชุดข้อมูล")
      );
    }

    const items = Array.isArray(instruction.dataItems) ? instruction.dataItems : [];
    const now = new Date();
    const newItem = {
      itemId: generateDataItemId(),
      title,
      type: "table",
      content: "",
      data: null,
      order: items.length + 1,
      createdAt: now,
      updatedAt: now,
    };

    if (tableData && tableData.trim() !== "") {
      try {
        const parsedData = JSON.parse(tableData);
        if (parsedData && typeof parsedData === "object") {
          newItem.data = parsedData;
        }
      } catch (parseErr) {
        console.error("V3: Invalid table data payload:", parseErr);
        return res.redirect(
          `/admin/instructions-v3/${instructionId}/data-items/new?error=` +
          encodeURIComponent("ข้อมูลตารางไม่ถูกต้อง")
        );
      }
    }

    await coll.updateOne(
      { _id: new ObjectId(instructionId) },
      {
        $push: { dataItems: newItem },
        $set: { updatedAt: now },
      }
    );

    res.redirect(
      `/admin/dashboard?success=${encodeURIComponent("สร้างชุดข้อมูลเรียบร้อยแล้ว")}&instructionId=${instructionId}`
    );
  } catch (err) {
    console.error("V3: Error creating data item:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message || "Error"));
  }
});

// Save Edit Data Item (V3)
app.post("/admin/instructions-v3/:instructionId/data-items/:itemId/edit", async (req, res) => {
  try {
    const { instructionId, itemId } = req.params;
    const { type, title, content, tableData } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    // ดึง instruction
    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    // หา index ของ data item
    const itemIndex = (instruction.dataItems || []).findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return res.redirect("/admin/dashboard?error=ไม่พบชุดข้อมูล");
    }

    const now = new Date();
    const updateFields = {};

    // อัปเดต title
    if (title !== undefined) {
      updateFields[`dataItems.${itemIndex}.title`] = (title || "").trim();
    }

    // อัปเดต table data
    if (tableData && tableData.trim() !== "") {
      try {
        const parsedData = JSON.parse(tableData);
        if (parsedData && typeof parsedData === "object") {
          updateFields[`dataItems.${itemIndex}.data`] = parsedData;
        }
      } catch (parseErr) {
        console.error("V3: Error parsing table data:", parseErr);
        return res.redirect(
          `/admin/instructions-v3/${instructionId}/data-items/${itemId}/edit?error=${encodeURIComponent("ข้อมูลตารางไม่ถูกต้อง")}`
        );
      }
    }

    updateFields[`dataItems.${itemIndex}.type`] = "table";
    updateFields[`dataItems.${itemIndex}.content`] = "";
    updateFields[`dataItems.${itemIndex}.updatedAt`] = now;
    updateFields.updatedAt = now;

    // บันทึกลง database
    await coll.updateOne(
      { _id: new ObjectId(instructionId) },
      { $set: updateFields }
    );

    res.redirect(`/admin/dashboard?success=แก้ไขชุดข้อมูลเรียบร้อยแล้ว&instructionId=${instructionId}`);
  } catch (err) {
    console.error("V3: Error saving data item:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message));
  }
});

// Export Data Item (V3) - True XLSX (from current sheet data)
app.post("/admin/instructions-v3/export-xlsx", async (req, res) => {
  try {
    const { filename, headers, rows } = req.body || {};

    if (!Array.isArray(headers) || headers.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "ไม่พบหัวตารางสำหรับส่งออก" });
    }
    if (!Array.isArray(rows)) {
      return res
        .status(400)
        .json({ success: false, error: "ข้อมูลตารางไม่ถูกต้อง" });
    }

    const safeHeaders = headers.map((h) => (h === null || h === undefined ? "" : String(h)));
    const safeRows = rows.map((row) => {
      const rowArr = Array.isArray(row) ? row : [];
      const normalized = [];
      for (let i = 0; i < safeHeaders.length; i += 1) {
        const value = rowArr[i];
        normalized.push(value === null || value === undefined ? "" : String(value));
      }
      return normalized;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([safeHeaders, ...safeRows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const sanitizeFilename = (input) =>
      String(input || "")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .slice(0, 120);

    const baseName =
      sanitizeFilename(filename) ||
      `data-export_${moment().tz("Asia/Bangkok").format("YYYYMMDD_HHmm")}`;
    const finalName = `${baseName}.xlsx`;
    const fallbackName = finalName.replace(/[^\x20-\x7E]+/g, "_");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(finalName)}`,
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting V3 data item:", err);
    res.status(500).json({ success: false, error: err.message || "Error" });
  }
});

// Admin settings page
app.get("/admin/settings", async (req, res) => {
  try {
    res.render("admin-settings");
  } catch (err) {
    console.error("Error rendering admin settings:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Admin settings2 page (new modern design)
app.get("/admin/settings2", async (req, res) => {
  try {
    res.render("admin-settings-v2");
  } catch (err) {
    console.error("Error rendering admin settings2:", err);
    res.status(500).send("Internal Server Error");
  }
});



// Toggle global AI enabled
app.post("/admin/ai-toggle", async (req, res) => {
  try {
    const { enabled } = req.body;
    await setAiEnabled(enabled === "true" || enabled === true);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Add new instruction
app.post("/admin/instructions", async (req, res) => {
  try {
    const { type, title, content, tableData } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const now = new Date();
    const instr = {
      instructionId: generateInstructionId(),
      version: 1,
      type,
      title: title || "",
      content: content || "",
      createdAt: now,
      updatedAt: now,
      order: Date.now(),
    };

    if (type === "table" && tableData) {
      try {
        instr.data = JSON.parse(tableData);
      } catch {
        instr.data = [];
      }
    } else {
      delete instr.data;
    }

    const result = await coll.insertOne(instr);
    await recordInstructionVersionSnapshot(
      { ...instr, _id: result.insertedId },
      db,
    );
    res.redirect("/admin/dashboard");
  } catch (err) {
    res.redirect("/admin/dashboard?error=ไม่สามารถเพิ่มข้อมูลได้");
  }
});

// Delete instruction
app.post("/admin/instructions/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    await coll.deleteOne({ _id: new ObjectId(id) });
    res.redirect("/admin/dashboard");
  } catch (err) {
    res.redirect("/admin/dashboard?error=ไม่สามารถลบข้อมูลได้");
  }
});

// Edit instruction form
app.get("/admin/instructions/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    res.render("edit-instruction", { instruction });
  } catch (err) {
    res.redirect("/admin/dashboard?error=ไม่พบข้อมูลที่ต้องการแก้ไข");
  }
});

// Handle edit submission
app.post("/admin/instructions/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, content, tableData } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    // ดึงข้อมูลเดิมก่อนเพื่อเป็น fallback
    const existingInstruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!existingInstruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบข้อมูลที่ต้องการแก้ไข");
    }

    const now = new Date();
    const baseInstructionId =
      existingInstruction.instructionId || generateInstructionId();
    const currentVersion = Number.isInteger(existingInstruction.version)
      ? existingInstruction.version
      : 1;
    const newVersion = currentVersion + 1;

    const updateData = {
      instructionId: baseInstructionId,
      version: newVersion,
      type,
      title: title || "",
      content: content || "",
      updatedAt: now,
    };

    console.log("[Edit] Request body keys:", Object.keys(req.body));
    console.log(
      "[Edit] Table data received length:",
      tableData ? tableData.length : 0,
    );

    let unsetData = null;

    if (type === "table") {
      if (tableData && tableData.trim() !== "") {
        try {
          const parsedData = JSON.parse(tableData);
          if (parsedData && typeof parsedData === "object") {
            updateData.data = parsedData;
            console.log("[Edit] Table data parsed successfully");
            console.log(
              "[Edit] Parsed data columns:",
              parsedData.columns ? parsedData.columns.length : 0,
            );
            console.log(
              "[Edit] Parsed data rows:",
              parsedData.rows ? parsedData.rows.length : 0,
            );
          } else {
            console.warn(
              "[Edit] Invalid table data structure, keeping existing data",
            );
            updateData.data = existingInstruction.data || {
              columns: [],
              rows: [],
            };
          }
        } catch (parseError) {
          console.error("[Edit] JSON parse error:", parseError);
          console.log(
            "[Edit] Raw table data preview:",
            tableData.substring(0, 200),
          );
          console.log("[Edit] Keeping existing table data due to parse error");
          updateData.data = existingInstruction.data || {
            columns: [],
            rows: [],
          };
        }
      } else {
        console.warn("[Edit] Empty table data received, keeping existing data");
        updateData.data = existingInstruction.data || { columns: [], rows: [] };
      }
    } else {
      unsetData = { data: "" };
    }

    console.log("[Edit] Updating instruction:", id, "Type:", type);
    console.log("[Edit] Update data keys:", Object.keys(updateData));

    const mongoUpdate = unsetData
      ? { $set: updateData, $unset: unsetData }
      : { $set: updateData };

    console.log(
      "[Edit] MongoDB update operation:",
      JSON.stringify(mongoUpdate, null, 2),
    );

    const updateResult = await coll.updateOne(
      { _id: new ObjectId(id) },
      mongoUpdate,
    );
    console.log("[Edit] Update result:", updateResult);

    if (updateResult.modifiedCount === 1) {
      console.log("[Edit] Instruction updated successfully");
    } else {
      console.warn("[Edit] No documents were modified");
    }

    const updatedInstruction = {
      ...existingInstruction,
      ...updateData,
    };
    if (unsetData) {
      delete updatedInstruction.data;
    }

    await recordInstructionVersionSnapshot(updatedInstruction, db);

    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[Edit] Error updating instruction:", err);
    console.error("[Edit] Error stack:", err.stack);
    res.redirect("/admin/dashboard?error=ไม่สามารถแก้ไขข้อมูลได้");
  }
});

// Instruction export endpoints
app.get("/admin/instructions/export/json", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const exportedAt = new Date().toISOString();
    const previewText = buildInstructionText(instructions, {
      tableMode: "placeholder",
      emptyText: "",
    });
    const detailedText = buildInstructionText(instructions, {
      tableMode: "json",
      emptyText: "_ไม่มีเนื้อหา_",
    });
    const sanitizedInstructions = instructions.map((instruction) => {
      const { _id, ...rest } = instruction;
      return {
        id: _id ? _id.toString() : null,
        ...rest,
      };
    });

    const payload = {
      exportedAt,
      total: instructions.length,
      preview: previewText,
      detailed: detailedText,
      instructions: sanitizedInstructions,
    };
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instructions-${timestamp}.json"`,
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถส่งออกข้อมูล JSON ได้",
      details: err.message,
    });
  }
});

app.get("/admin/instructions/export/markdown", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const markdown =
      instructions.length === 0
        ? "ไม่มีข้อมูล instructions"
        : buildInstructionText(instructions, {
          tableMode: "json",
          emptyText: "_ไม่มีเนื้อหา_",
        });
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instructions-${timestamp}.md"`,
    );
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(markdown);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถส่งออกข้อมูล Markdown ได้",
      details: err.message,
    });
  }
});

app.get("/admin/instructions/export/excel", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set();

    const reserveSheetName = (title, index) => {
      const fallback = `Instruction_${index + 1}`;
      const baseName = sanitizeSheetName(title, fallback);
      let candidate = baseName;
      let counter = 1;
      while (usedNames.has(candidate)) {
        const suffix = `_${counter++}`;
        const maxLength = Math.max(31 - suffix.length, 1);
        candidate = `${baseName.substring(0, maxLength)}${suffix}`;
      }
      usedNames.add(candidate);
      return candidate;
    };

    if (instructions.length === 0) {
      const sheetName = sanitizeSheetName("Instructions", "Instructions");
      const worksheet = XLSX.utils.aoa_to_sheet([["ไม่มีข้อมูล instructions"]]);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    } else {
      instructions.forEach((instruction, idx) => {
        const sheetName = reserveSheetName(instruction.title, idx);
        let sheetData = [];

        if (instruction.type === "table" && instruction.data) {
          const columns =
            Array.isArray(instruction.data.columns) &&
              instruction.data.columns.length > 0
              ? instruction.data.columns
              : Array.from(
                new Set(
                  (instruction.data.rows || []).flatMap((row) =>
                    Object.keys(row),
                  ),
                ),
              );
          const rows = Array.isArray(instruction.data.rows)
            ? instruction.data.rows
            : [];

          if (columns.length === 0) {
            sheetData = [["ไม่มีข้อมูลตาราง"]];
          } else {
            sheetData.push(columns);
            if (rows.length === 0) {
              sheetData.push(new Array(columns.length).fill(""));
            } else {
              rows.forEach((row) => {
                sheetData.push(
                  columns.map((col) => {
                    const value = row[col];
                    return value === undefined || value === null
                      ? ""
                      : String(value);
                  }),
                );
              });
            }
          }
        } else {
          const text = instruction.content ? String(instruction.content) : "";
          sheetData = [[text]];
        }

        if (sheetData.length === 0) {
          sheetData = [[""]];
        }

        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instructions-${timestamp}.xlsx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถส่งออกไฟล์ Excel ได้",
      details: err.message,
    });
  }
});

// Preview combined instructions (simple implementation)
app.get("/admin/instructions/preview", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const preview =
      instructions.length === 0
        ? ""
        : buildInstructionText(instructions, {
          tableMode: "placeholder",
          emptyText: "",
        });
    res.json({ success: true, instructions: preview });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Simple reorder (up/down)
app.post("/admin/instructions/reorder", async (req, res) => {
  try {
    const { instructionId, direction } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const current = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!current)
      return res.json({ success: false, error: "ไม่พบ instruction" });

    const all = await coll.find({}).sort({ order: 1, createdAt: 1 }).toArray();
    const idx = all.findIndex((x) => x._id.toString() === instructionId);
    let targetIdx = idx;
    if (direction === "up" && idx > 0) targetIdx = idx - 1;
    if (direction === "down" && idx < all.length - 1) targetIdx = idx + 1;

    if (idx === targetIdx)
      return res.json({ success: false, error: "ไม่สามารถเลื่อนได้" });

    const target = all[targetIdx];
    await coll.updateOne(
      { _id: current._id },
      { $set: { order: target.order || targetIdx } },
    );
    await coll.updateOne(
      { _id: target._id },
      { $set: { order: current.order || idx } },
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/admin/instructions/reorder/drag", async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.json({ success: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    const objectIds = orderedIds.map((id) => {
      const objectId = toObjectId(id);
      if (!objectId) {
        throw new Error("พบรหัส instruction ที่ไม่ถูกต้อง");
      }
      return objectId;
    });

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const total = await coll.countDocuments();
    if (total !== objectIds.length) {
      return res.json({
        success: false,
        error: "จำนวนนับไม่ตรงกับในระบบ กรุณารีเฟรชแล้วลองอีกครั้ง",
      });
    }

    const bulkOps = objectIds.map((objectId, index) => ({
      updateOne: {
        filter: { _id: objectId },
        update: { $set: { order: index } },
      },
    }));

    if (bulkOps.length > 0) {
      await coll.bulkWrite(bulkOps, { ordered: true });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[Instructions] drag reorder error:", err);
    res.json({
      success: false,
      error: err.message || "ไม่สามารถจัดลำดับใหม่ได้",
    });
  }
});

// API endpoint สำหรับดึงรายการ instructions (สำหรับ dynamic updates)
app.get("/admin/instructions/list", async (req, res) => {
  try {
    const instructions = await getInstructions();
    res.json({
      success: true,
      instructions: instructions.map((instruction) => ({
        _id: instruction._id,
        type: instruction.type,
        title: instruction.title,
        content: instruction.content,
        data: instruction.data,
        order: instruction.order,
        createdAt: instruction.createdAt,
        updatedAt: instruction.updatedAt,
      })),
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================ Instruction Assets API ============================
// List all instruction assets
app.get("/admin/instructions/assets", async (req, res) => {
  try {
    const assets = await getInstructionAssets();
    res.json({ success: true, assets });
  } catch (err) {
    console.error("[Assets] list error:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายการรูปภาพได้" });
  }
});

// Helper: Generate slug from Thai text
function generateSlugFromLabel(label) {
  // แผนที่แปลงคำภาษาไทยที่ใช้บ่อย -> ภาษาอังกฤษ
  const thaiToEng = {
    สินค้า: "product",
    ผลิตภัณฑ์: "product",
    บริการ: "service",
    เซอร์วิส: "service",
    ราคา: "price",
    ค่าใช้จ่าย: "price",
    โปรโมชั่น: "promotion",
    โปรโมชัน: "promotion",
    ติดต่อ: "contact",
    ติดต่อเรา: "contact",
    ชำระเงิน: "payment",
    จ่ายเงิน: "payment",
    จัดส่ง: "delivery",
    ส่งของ: "delivery",
    คิวอาร์: "qr",
    คิวอาร์โค้ด: "qr-code",
    โค้ด: "code",
    รหัส: "code",
    แคตตาล็อก: "catalog",
    แคตตาล็อค: "catalog",
    เมนู: "menu",
    รายการ: "menu",
    แผนที่: "map",
    ตำแหน่ง: "location",
    เวลา: "time",
    เปิดปิด: "hours",
    ส่วนลด: "discount",
    ลดราคา: "discount",
  };

  let slug = label.toLowerCase().trim();

  // แทนที่คำภาษาไทยด้วยภาษาอังกฤษ
  Object.keys(thaiToEng).forEach((thai) => {
    slug = slug.replace(new RegExp(thai, "g"), thaiToEng[thai]);
  });

  // แปลงตัวเลขไทยเป็นอารบิก
  const thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  thaiDigits.forEach((digit, index) => {
    slug = slug.replace(new RegExp(digit, "g"), index.toString());
  });

  // ลบภาษาไทยที่เหลือทั้งหมด
  slug = slug.replace(/[ก-๙]/g, "");

  // แปลง space และตัวอักษรพิเศษเป็น dash
  slug = slug.replace(/\s+/g, "-");
  slug = slug.replace(/[^a-z0-9_-]/g, "-");

  // ลบ dash ซ้ำ
  slug = slug.replace(/-+/g, "-");

  // ตัด dash หน้า-หลัง
  slug = slug.replace(/^-+|-+$/g, "");

  // ถ้าว่างเปล่า ให้สร้างจาก timestamp
  if (!slug) {
    slug = "asset-" + Date.now();
  }

  return slug;
}

async function ensureUniqueInstructionSlug(
  coll,
  baseSlug,
  { excludeLabel } = {},
) {
  if (!coll) return baseSlug;
  const sanitizedBase = baseSlug || `asset-${Date.now()}`;
  let candidate = sanitizedBase;
  let counter = 1;
  const maxAttempts = 50;

  while (counter <= maxAttempts) {
    const query = { slug: candidate };
    if (excludeLabel) {
      query.label = { $ne: excludeLabel };
    }
    const conflict = await coll.findOne(query);
    if (!conflict) {
      return candidate;
    }
    candidate = `${sanitizedBase}-${counter++}`;
  }

  return `${sanitizedBase}-${Date.now().toString(36)}`;
}

// Upload a new instruction asset
app.post(
  "/admin/instructions/assets",
  imageUpload.single("image"),
  async (req, res) => {
    try {
      const label = (req.body.label || "").trim();
      const alt = (req.body.alt || "").trim();
      const description = (req.body.description || "").trim();
      const overwrite =
        String(req.body.overwrite || "").toLowerCase() === "true";

      // ตรวจสอบว่ามี label หรือไม่
      if (!label) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาระบุชื่อ Label" });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาอัพโหลดไฟล์รูปภาพ" });
      }

      // Convert to optimized JPEG and thumbnail
      const inputBuffer = req.file.buffer;
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();
      const optimized = await image
        .jpeg({ quality: 88, progressive: true })
        .toBuffer();
      const thumb = await sharp(optimized)
        .resize({
          width: 512,
          height: 512,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const urlBase = PUBLIC_BASE_URL ? PUBLIC_BASE_URL.replace(/\/$/, "") : "";
      let slug = generateSlugFromLabel(label);

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("instruction_assets");
      const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });

      const existing = await coll.findOne({ label });
      if (existing && !overwrite) {
        return res.status(409).json({
          success: false,
          error: "label นี้มีอยู่แล้ว หากต้องการแทนที่ให้ส่ง overwrite=true",
        });
      }

      if (existing?.slug) {
        slug = existing.slug;
      } else {
        slug = await ensureUniqueInstructionSlug(coll, slug, {
          excludeLabel: existing ? label : undefined,
        });
      }

      const fileName = `${slug}.jpg`;
      const thumbName = `${slug}_thumb.jpg`;
      const url = `${urlBase}/assets/instructions/${fileName}`;
      const thumbUrl = `${urlBase}/assets/instructions/${thumbName}`;

      if (existing) {
        await deleteGridFsEntries(bucket, [
          { id: existing.fileId },
          { id: existing.thumbFileId },
          { filename: existing.fileName },
          { filename: existing.thumbFileName || `${existing.slug}_thumb.jpg` },
        ]);
      }

      const [fileId, thumbFileId] = await Promise.all([
        uploadBufferToGridFS(bucket, fileName, optimized, {
          contentType: "image/jpeg",
          metadata: {
            label,
            slug,
            type: "original",
            width: metadata.width || null,
            height: metadata.height || null,
          },
        }),
        uploadBufferToGridFS(bucket, thumbName, thumb, {
          contentType: "image/jpeg",
          metadata: { label, slug, type: "thumb" },
        }),
      ]);

      const sha256 = crypto
        .createHash("sha256")
        .update(optimized)
        .digest("hex")
        .slice(0, 16);
      const doc = {
        label,
        slug,
        fileName,
        thumbFileName: thumbName,
        fileId,
        thumbFileId,
        storage: "mongo",
        mime: "image/jpeg",
        size: optimized.length,
        width: metadata.width || null,
        height: metadata.height || null,
        sha256,
        alt,
        description,
        url,
        thumbUrl,
        updatedAt: new Date(),
        createdAt: existing?.createdAt || new Date(),
      };

      await coll.updateOne({ label }, { $set: doc }, { upsert: true });

      const savedAsset = await coll.findOne({ label });
      if (!savedAsset) {
        throw new Error("ไม่สามารถบันทึกข้อมูลรูปภาพได้");
      }

      await syncInstructionAssetToCollections(db, savedAsset);

      res.json({
        success: true,
        asset: mapInstructionAssetResponse(savedAsset),
      });
    } catch (err) {
      console.error("[Assets] upload error:", err);
      res.status(400).json({
        success: false,
        error: err.message || "อัพโหลดรูปภาพไม่สำเร็จ",
      });
    }
  },
);

app.put("/admin/instructions/assets/:label", async (req, res) => {
  try {
    const originalLabel = req.params.label;
    let { label: newLabel, description } = req.body || {};
    newLabel = typeof newLabel === "string" ? newLabel.trim() : "";
    description = typeof description === "string" ? description.trim() : "";

    if (!newLabel) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุชื่อรูปภาพ" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    const doc = await coll.findOne({ label: originalLabel });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, error: "ไม่พบรูปภาพที่ต้องการแก้ไข" });
    }

    if (newLabel !== originalLabel) {
      const exists = await coll.findOne({ label: newLabel });
      if (exists) {
        return res
          .status(409)
          .json({ success: false, error: "มีชื่อรูปภาพนี้อยู่แล้ว" });
      }
    }

    const update = {
      label: newLabel,
      description,
      alt: description,
      updatedAt: new Date(),
    };

    await coll.updateOne({ _id: doc._id }, { $set: update });
    const updatedDoc = await coll.findOne({ _id: doc._id });
    await syncInstructionAssetToCollections(db, updatedDoc);

    res.json({ success: true, asset: mapInstructionAssetResponse(updatedDoc) });
  } catch (err) {
    console.error("[Assets] update error:", err);
    res.status(500).json({ success: false, error: "ไม่สามารถแก้ไขรูปภาพได้" });
  }
});

// Delete an instruction asset by label
app.delete("/admin/instructions/assets/:label", async (req, res) => {
  try {
    const { label } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const doc = await coll.findOne({ label });
    if (!doc)
      return res.status(404).json({ success: false, error: "ไม่พบ asset" });

    await performInstructionAssetDeletion(db, doc);

    res.json({ success: true });
  } catch (err) {
    console.error("[Assets] delete error:", err);
    res.status(500).json({ success: false, error: "ลบรูปภาพไม่สำเร็จ" });
  }
});

app.post("/admin/instructions/assets/bulk-delete", async (req, res) => {
  try {
    const labels = Array.isArray(req.body?.labels)
      ? Array.from(
        new Set(
          req.body.labels
            .map((label) => (typeof label === "string" ? label.trim() : ""))
            .filter((label) => !!label),
        ),
      )
      : [];

    if (labels.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุชื่อรูปภาพที่ต้องการลบ" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    const deleted = [];
    const failed = [];

    for (const label of labels) {
      try {
        const doc = await coll.findOne({ label });
        if (!doc) {
          failed.push({ label, error: "ไม่พบรูปภาพ" });
          continue;
        }

        await performInstructionAssetDeletion(db, doc);
        deleted.push(label);
      } catch (err) {
        failed.push({ label, error: err.message || "ลบไม่สำเร็จ" });
      }
    }

    const success = deleted.length > 0;
    if (!success) {
      return res.status(400).json({
        success: false,
        error: "ไม่สามารถลบรูปภาพได้",
        failed,
      });
    }

    res.json({ success: true, deleted, failed });
  } catch (err) {
    console.error("[Assets] bulk delete error:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถลบรูปภาพที่เลือกได้" });
  }
});

// Check and fix asset data consistency
app.post("/admin/instructions/assets/check-consistency", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const results = {
      instruction_assets: await checkAndFixAssetConsistency(
        db,
        "instruction_assets",
        "instructionAssets"
      ),
      follow_up_assets: await checkAndFixAssetConsistency(
        db,
        "follow_up_assets",
        "followupAssets"
      ),
    };

    const totalFixed =
      results.instruction_assets.fixed + results.follow_up_assets.fixed;
    const totalDeleted =
      results.instruction_assets.deleted + results.follow_up_assets.deleted;
    const totalOk = results.instruction_assets.ok + results.follow_up_assets.ok;

    let message = "ข้อมูลถูกต้องครบถ้วน";
    if (totalFixed > 0 || totalDeleted > 0) {
      const parts = [];
      if (totalFixed > 0) parts.push(`ซ่อมแซม ${totalFixed} รายการ`);
      if (totalDeleted > 0) parts.push(`ลบ ${totalDeleted} รายการ`);
      message = parts.join(" และ ");
    }

    res.json({
      success: true,
      message,
      results,
      summary: {
        ok: totalOk,
        fixed: totalFixed,
        deleted: totalDeleted,
      },
    });
  } catch (err) {
    console.error("[Assets] consistency check error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถตรวจสอบความสมบูรณ์ของข้อมูลได้",
    });
  }
});

async function checkAndFixAssetConsistency(db, collectionName, bucketName) {
  const coll = db.collection(collectionName);
  const bucket = new GridFSBucket(db, { bucketName });

  const assets = await coll.find({}).toArray();
  let fixedCount = 0;
  let okCount = 0;
  let deletedCount = 0;
  const fixedItems = [];
  const deletedItems = [];

  for (const asset of assets) {
    const label = asset.label || asset.fileName || asset._id.toString();
    const baseName = getInstructionAssetBaseName(asset);
    const mainFileNames = Array.from(
      new Set(
        [
          asset.fileName,
          ...buildInstructionAssetVariantFilenames(baseName, "main"),
        ]
          .filter((name) => typeof name === "string" && name.trim())
          .map((name) => name.trim()),
      ),
    );
    const thumbFileNames = Array.from(
      new Set(
        [
          asset.thumbFileName,
          ...buildInstructionAssetVariantFilenames(baseName, "thumb"),
        ]
          .filter((name) => typeof name === "string" && name.trim())
          .map((name) => name.trim()),
      ),
    );
    let needsUpdate = false;
    let needsDelete = false;
    const updates = {};

    // Check main file
    let mainFileExists = true;
    if (asset.fileId) {
      const exists = await checkGridFsFileExists(bucket, asset.fileId);
      if (!exists) {
        console.log(
          `[Consistency] Missing fileId ${asset.fileId} for ${label}`
        );
        updates.fileId = null;
        updates.fileName = null;
        updates.url = null;
        updates.mime = null;
        needsUpdate = true;
        mainFileExists = false;
        deleteLocalInstructionAssetFile(asset.fileName);
      }
    } else {
      mainFileExists = false;
    }

    // Check thumbnail file
    let thumbFileExists = true;
    const thumbId = asset.thumbFileId || asset.thumbId;
    if (thumbId) {
      const exists = await checkGridFsFileExists(bucket, thumbId);
      if (!exists) {
        console.log(`[Consistency] Missing thumbFileId ${thumbId} for ${label}`);
        updates.thumbFileId = null;
        if (asset.thumbId) updates.thumbId = null;
        updates.thumbFileName = null;
        updates.thumbUrl = null;
        updates.thumbMime = null;
        needsUpdate = true;
        thumbFileExists = false;
        const thumbName = asset.thumbFileName || `${asset.label}_thumb.jpg`;
        deleteLocalInstructionAssetFile(thumbName);
      }
    } else {
      thumbFileExists = false;
    }

    // Delete orphaned records (no files at all)
    if (!mainFileExists && !thumbFileExists) {
      console.log(`[Consistency] Deleting orphaned record: ${label}`);
      await removeInstructionAssetFromCollections(db, asset);
      await deleteGridFsEntries(bucket, [
        { id: asset.fileId },
        { id: asset.thumbFileId },
        { filename: asset.fileName },
        { filename: asset.thumbFileName },
      ]);
      await coll.deleteOne({ _id: asset._id });
      deleteLocalInstructionAssetFile(asset.fileName);
      const thumbName = asset.thumbFileName || `${asset.label}_thumb.jpg`;
      deleteLocalInstructionAssetFile(thumbName);
      deletedItems.push({ label, reason: 'No files in GridFS' });
      deletedCount++;
      needsDelete = true;
    }

    if (needsDelete) {
      continue;
    }

    if (needsUpdate) {
      await coll.updateOne({ _id: asset._id }, { $set: updates });
      fixedItems.push({ label, fixes: updates });
      fixedCount++;
    } else {
      okCount++;
    }
  }

  return {
    total: assets.length,
    ok: okCount,
    fixed: fixedCount,
    deleted: deletedCount,
    items: fixedItems,
    deletedItems,
  };
}

async function resolveInstructionAssetStream(db, asset, { isThumbRequest }) {
  if (!db || !asset) {
    return { stream: null, mime: null, missingReferences: {} };
  }

  const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
  const docHasThumb = Boolean(
    asset.thumbFileId || asset.thumbFileName || asset.thumbUrl,
  );
  const docHasMain = Boolean(asset.fileId || asset.fileName || asset.url);

  const seen = new Set();
  const candidates = [];
  const addCandidate = (variant, type, value) => {
    if (!value) return;
    const key = `${variant}:${type}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ variant, type, value });
  };

  if (isThumbRequest) {
    if (docHasThumb) {
      addCandidate("thumb", "id", asset.thumbFileId);
      addCandidate("thumb", "filename", asset.thumbFileName);
      if (asset.label) {
        addCandidate("thumb", "filename", `${asset.label}_thumb.jpg`);
      }
    }
    if (docHasMain) {
      addCandidate("main", "id", asset.fileId);
      addCandidate("main", "filename", asset.fileName);
      if (asset.label) {
        addCandidate("main", "filename", `${asset.label}.jpg`);
      }
    }
  } else {
    if (docHasMain) {
      addCandidate("main", "id", asset.fileId);
      addCandidate("main", "filename", asset.fileName);
      if (asset.label) {
        addCandidate("main", "filename", `${asset.label}.jpg`);
      }
    }
    if (docHasThumb) {
      addCandidate("thumb", "id", asset.thumbFileId);
      addCandidate("thumb", "filename", asset.thumbFileName);
      if (asset.label) {
        addCandidate("thumb", "filename", `${asset.label}_thumb.jpg`);
      }
    }
  }

  const missingReferences = {
    main: { id: false, filename: false },
    thumb: { id: false, filename: false },
  };

  for (const candidate of candidates) {
    const isThumbVariant = candidate.variant === "thumb";
    const shouldTrackMissing = isThumbVariant ? docHasThumb : docHasMain;
    const refKey = isThumbVariant ? "thumb" : "main";

    try {
      if (candidate.type === "id") {
        const objectId = toObjectId(candidate.value);
        if (!objectId) {
          if (shouldTrackMissing) {
            missingReferences[refKey].id = true;
          }
          continue;
        }
        const exists = await checkGridFsFileExists(bucket, objectId);
        if (!exists) {
          if (shouldTrackMissing) {
            missingReferences[refKey].id = true;
          }
          continue;
        }
        const stream = bucket.openDownloadStream(objectId);
        const mime = isThumbVariant
          ? asset.thumbMime || asset.mime || "image/jpeg"
          : asset.mime || asset.thumbMime || "image/jpeg";
        return {
          stream,
          mime,
          missingReferences,
          servedVariant: refKey,
        };
      }

      if (candidate.type === "filename") {
        const files = await bucket
          .find({ filename: candidate.value })
          .sort({ uploadDate: -1 })
          .limit(1)
          .toArray();
        if (!files.length) {
          if (shouldTrackMissing) {
            missingReferences[refKey].filename = true;
          }
          continue;
        }
        const stream = bucket.openDownloadStream(files[0]._id);
        const mime = isThumbVariant
          ? asset.thumbMime || asset.mime || "image/jpeg"
          : asset.mime || asset.thumbMime || "image/jpeg";
        return {
          stream,
          mime,
          missingReferences,
          servedVariant: refKey,
        };
      }
    } catch (err) {
      console.warn(
        "[Assets] Failed to resolve instruction asset stream:",
        err?.message || err,
      );
      if (shouldTrackMissing) {
        if (candidate.type === "id") {
          missingReferences[refKey].id = true;
        } else if (candidate.type === "filename") {
          missingReferences[refKey].filename = true;
        }
      }
    }
  }

  return { stream: null, mime: null, missingReferences, servedVariant: null };
}

async function markInstructionAssetMissingVariants(
  db,
  asset,
  missingReferences = {},
) {
  if (!db || !asset) return;
  const coll = db.collection("instruction_assets");
  const updates = {};
  let shouldUpdate = false;

  if (missingReferences.main?.id && asset.fileId) {
    updates.fileId = null;
    shouldUpdate = true;
  }

  if (missingReferences.main?.filename && asset.fileName) {
    updates.fileName = null;
    updates.url = null;
    updates.mime = null;
    shouldUpdate = true;
    deleteLocalInstructionAssetFile(asset.fileName);
  }

  if (missingReferences.thumb?.id && asset.thumbFileId) {
    updates.thumbFileId = null;
    shouldUpdate = true;
  }

  if (missingReferences.thumb?.filename && asset.thumbFileName) {
    updates.thumbFileName = null;
    updates.thumbUrl = null;
    updates.thumbMime = null;
    shouldUpdate = true;
    const thumbName = asset.thumbFileName || `${asset.label}_thumb.jpg`;
    deleteLocalInstructionAssetFile(thumbName);
  }

  if (!shouldUpdate) return;

  updates.updatedAt = new Date();
  try {
    await coll.updateOne({ _id: asset._id }, { $set: updates });
  } catch (err) {
    console.warn(
      "[Assets] Failed to mark missing instruction asset variants:",
      err?.message || err,
    );
  }
}

function deleteLocalInstructionAssetFile(fileName) {
  if (!fileName) return;
  try {
    const filePath = path.join(ASSETS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(
      "[Assets] Failed to remove local instruction asset file:",
      err?.message || err,
    );
  }
}

async function checkGridFsFileExists(bucket, fileId) {
  try {
    const objectId = toObjectId(fileId);
    if (!objectId) return false;

    const files = await bucket.find({ _id: objectId }).toArray();
    return files.length > 0;
  } catch (err) {
    return false;
  }
}

// ==================== IMAGE COLLECTIONS API ====================

// Helper: ดึง Image Collections ทั้งหมด
async function getImageCollections() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");
    const collections = await coll.find({}).sort({ createdAt: -1 }).toArray();
    return collections;
  } catch (e) {
    console.error("[Collections] Error fetching collections:", e);
    return [];
  }
}

// Helper: ดึงรูปภาพจาก collections ที่เลือก (สำหรับ bot)
async function getImagesFromSelectedCollections(selectedCollectionIds = []) {
  try {
    if (
      !Array.isArray(selectedCollectionIds) ||
      selectedCollectionIds.length === 0
    ) {
      return [];
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");

    const stringIds = new Set();
    const objectIds = [];
    for (const rawId of selectedCollectionIds) {
      if (!rawId) continue;
      if (typeof rawId === "string") {
        const trimmed = rawId.trim();
        if (!trimmed) continue;
        stringIds.add(trimmed);
        if (ObjectId.isValid(trimmed)) {
          objectIds.push(new ObjectId(trimmed));
        }
      } else if (rawId instanceof ObjectId) {
        objectIds.push(rawId);
      } else if (rawId && typeof rawId === "object" && rawId._id) {
        const nestedId = rawId._id;
        if (nestedId instanceof ObjectId) {
          objectIds.push(nestedId);
        } else if (typeof nestedId === "string" && nestedId.trim()) {
          stringIds.add(nestedId.trim());
          if (ObjectId.isValid(nestedId.trim())) {
            objectIds.push(new ObjectId(nestedId.trim()));
          }
        }
      }
    }

    const queries = [];
    if (stringIds.size > 0) {
      queries.push({ _id: { $in: Array.from(stringIds) } });
    }
    if (objectIds.length > 0) {
      queries.push({ _id: { $in: objectIds } });
    }

    const findQuery =
      queries.length === 0
        ? { _id: { $in: Array.from(stringIds) } }
        : queries.length === 1
          ? queries[0]
          : { $or: queries };

    const collections = await coll.find(findQuery).toArray();

    // รวมรูปภาพจากทุก collection
    const allImages = [];
    const seenLabels = new Set();

    for (const collection of collections) {
      if (Array.isArray(collection.images)) {
        for (const img of collection.images) {
          // ป้องกันรูปซ้ำ (ใช้ label เป็น key)
          if (img.label && !seenLabels.has(img.label)) {
            const resolvedImage = {
              ...img,
              url: resolveInstructionAssetUrl(img.url, img.fileName),
              thumbUrl: resolveInstructionAssetUrl(
                img.thumbUrl || img.url,
                img.thumbFileName || img.fileName,
              ),
            };
            allImages.push(resolvedImage);
            seenLabels.add(img.label);
          }
        }
      }
    }

    return allImages;
  } catch (e) {
    console.error("[Collections] Error getting images from collections:", e);
    return [];
  }
}

function buildCollectionImageEntryFromAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  const label = typeof asset.label === "string" ? asset.label.trim() : "";
  if (!label) return null;
  const slug =
    typeof asset.slug === "string" && asset.slug.trim()
      ? asset.slug.trim()
      : label;
  const fileName =
    typeof asset.fileName === "string" && asset.fileName.trim()
      ? asset.fileName.trim()
      : null;
  const thumbFileName =
    typeof asset.thumbFileName === "string" && asset.thumbFileName.trim()
      ? asset.thumbFileName.trim()
      : null;

  const resolvedUrl = resolveInstructionAssetUrl(asset.url, fileName);
  const resolvedThumbUrl = resolveInstructionAssetUrl(
    asset.thumbUrl || resolvedUrl,
    thumbFileName || fileName,
  );

  return {
    label,
    slug,
    url: resolvedUrl,
    thumbUrl: resolvedThumbUrl,
    description:
      typeof asset.description === "string" && asset.description.trim()
        ? asset.description.trim()
        : typeof asset.alt === "string"
          ? asset.alt.trim()
          : "",
    fileName: fileName || undefined,
    assetId: asset._id
      ? asset._id.toString()
      : asset.assetId
        ? String(asset.assetId)
        : undefined,
  };
}

async function syncInstructionAssetToCollections(db, asset) {
  if (!db || !asset) return;
  const collectionEntry = buildCollectionImageEntryFromAsset(asset);
  if (!collectionEntry) return;

  const collectionsColl = db.collection("image_collections");
  const orConditions = [];
  if (collectionEntry.assetId) {
    orConditions.push({ "images.assetId": collectionEntry.assetId });
  }
  orConditions.push({ "images.label": collectionEntry.label });
  orConditions.push({ isDefault: true });

  const query =
    orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
  const collections = await collectionsColl.find(query).toArray();

  let defaultUpdated = false;

  for (const collection of collections) {
    const currentImages = Array.isArray(collection.images)
      ? [...collection.images]
      : [];
    let changed = false;
    const matchIndex = currentImages.findIndex((img) => {
      if (!img) return false;
      if (
        collectionEntry.assetId &&
        img.assetId &&
        String(img.assetId) === collectionEntry.assetId
      ) {
        return true;
      }
      return img.label === collectionEntry.label;
    });

    if (matchIndex >= 0) {
      currentImages[matchIndex] = {
        ...currentImages[matchIndex],
        ...collectionEntry,
      };
      changed = true;
    } else if (collection.isDefault) {
      currentImages.unshift(collectionEntry);
      changed = true;
      defaultUpdated = true;
    }

    if (collection.isDefault) {
      defaultUpdated = true;
    }

    if (changed) {
      await collectionsColl.updateOne(
        { _id: collection._id },
        {
          $set: {
            images: currentImages,
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  if (!defaultUpdated) {
    const defaultCollection = await collectionsColl.findOne({
      isDefault: true,
    });
    if (defaultCollection) {
      const images = Array.isArray(defaultCollection.images)
        ? [collectionEntry, ...defaultCollection.images.filter(Boolean)]
        : [collectionEntry];
      await collectionsColl.updateOne(
        { _id: defaultCollection._id },
        {
          $set: {
            images,
            updatedAt: new Date(),
          },
        },
      );
    } else {
      const assetsColl = db.collection("instruction_assets");
      const allAssets = await assetsColl
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      const imageEntries = [];
      for (const assetDoc of allAssets) {
        const entry = buildCollectionImageEntryFromAsset(assetDoc);
        if (entry) {
          imageEntries.push(entry);
        }
      }
      const defaultId = `default-collection-${Date.now()}`;
      await collectionsColl.insertOne({
        _id: defaultId,
        name: "รูปภาพทั้งหมด (สร้างอัตโนมัติ)",
        description:
          "ระบบสร้างคอลเลกชันเริ่มต้นขึ้นใหม่ เนื่องจากไม่พบข้อมูลเดิม",
        images: imageEntries,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.warn(
        "[Assets] Default image collection was missing. A new collection has been created automatically.",
      );
    }
  }
}

async function removeInstructionAssetFromCollections(db, asset) {
  if (!db || !asset) return;
  const label =
    typeof asset.label === "string" && asset.label.trim()
      ? asset.label.trim()
      : null;
  const assetId = asset._id ? asset._id.toString() : asset.assetId || null;
  if (!label && !assetId) return;

  const collectionsColl = db.collection("image_collections");
  const filters = [];
  if (assetId) {
    filters.push({ "images.assetId": assetId });
  }
  if (label) {
    filters.push({ "images.label": label });
  }
  if (filters.length === 0) return;

  const query = filters.length === 1 ? filters[0] : { $or: filters };
  const collections = await collectionsColl.find(query).toArray();

  for (const collection of collections) {
    const before = Array.isArray(collection.images) ? collection.images : [];
    const filtered = before.filter((img) => {
      if (!img) return false;
      const matchById =
        assetId && img.assetId && String(img.assetId) === String(assetId);
      const matchByLabel = label && img.label === label;
      return !matchById && !matchByLabel;
    });
    if (filtered.length !== before.length) {
      await collectionsColl.updateOne(
        { _id: collection._id },
        {
          $set: {
            images: filtered,
            updatedAt: new Date(),
          },
        },
      );
    }
  }
}

async function performInstructionAssetDeletion(db, asset) {
  if (!db || !asset) return false;
  const coll = db.collection("instruction_assets");
  await coll.deleteOne({ _id: asset._id });

  await removeInstructionAssetFromCollections(db, asset);

  const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
  const baseName = getInstructionAssetBaseName(asset);
  const mainFileNames = Array.from(
    new Set(
      [
        asset.fileName,
        ...buildInstructionAssetVariantFilenames(baseName, "main"),
      ]
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => name.trim()),
    ),
  );
  const thumbFileNames = Array.from(
    new Set(
      [
        asset.thumbFileName,
        ...buildInstructionAssetVariantFilenames(baseName, "thumb"),
      ]
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => name.trim()),
    ),
  );
  await deleteGridFsEntries(bucket, [
    { id: asset.fileId },
    { id: asset.thumbFileId },
    ...mainFileNames.map((name) => ({ filename: name })),
    ...thumbFileNames.map((name) => ({ filename: name })),
  ]);

  const baseDir = ASSETS_DIR;
  const filePaths = [...mainFileNames, ...thumbFileNames]
    .filter((name) => typeof name === "string" && name)
    .map((name) => path.join(baseDir, name));
  filePaths.forEach((p) => {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) { }
  });

  return true;
}

function mapInstructionAssetResponse(asset) {
  if (!asset || typeof asset !== "object") return null;
  return {
    ...asset,
    fileId: asset.fileId?.toString?.() || asset.fileId,
    thumbFileId: asset.thumbFileId?.toString?.() || asset.thumbFileId,
    url: resolveInstructionAssetUrl(asset.url, asset.fileName),
    thumbUrl: resolveInstructionAssetUrl(
      asset.thumbUrl || asset.url,
      asset.thumbFileName || asset.fileName,
    ),
  };
}

// GET: ดึงรายการ Image Collections ทั้งหมด
// GET: ดึงรายการ Image Collections ทั้งหมด
app.get("/api/image-collections", async (req, res) => {
  try {
    const collections = await getImageCollections();
    res.json({ success: true, collections });
  } catch (err) {
    console.error("[Collections] list error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงรายการ Image Collections ได้",
    });
  }
});

// Category Management Routes
app.get("/admin/categories", requireAdmin, async (req, res) => {
  res.render("admin-categories", {
    user: req.session.adminUser,
    activePage: "categories",
  });
});

app.get("/admin/categories/:categoryId/data", requireAdmin, async (req, res) => {
  const { categoryId } = req.params;
  res.render("admin-category-data", {
    user: req.session.adminUser,
    activePage: "categories",
    categoryId,
  });
});

app.get("/admin/image-collections", async (req, res) => {
  try {
    const collections = await getImageCollections();
    res.json({ success: true, collections });
  } catch (err) {
    console.error("[Collections] API list error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงรายการ Image Collections ได้",
    });
  }
});

// GET: ดึง Image Collection เดียว
app.get("/admin/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");

    const collection = await coll.findOne({ _id: id });

    if (!collection) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ Image Collection",
      });
    }

    res.json({ success: true, collection });
  } catch (err) {
    console.error("[Collections] get error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงข้อมูล Image Collection ได้",
    });
  }
});

// POST: สร้าง Image Collection ใหม่
app.post("/admin/image-collections", async (req, res) => {
  try {
    const { name, description, imageLabels } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุชื่อ Collection",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const collectionsColl = db.collection("image_collections");
    const assetsColl = db.collection("instruction_assets");

    // ดึงข้อมูลรูปภาพจาก labels ที่เลือก
    const selectedAssets = await assetsColl
      .find({
        label: { $in: imageLabels || [] },
      })
      .toArray();

    const images = selectedAssets.map((asset) => ({
      label: asset.label,
      slug: asset.slug || asset.label,
      url: asset.url,
      thumbUrl: asset.thumbUrl || asset.url,
      description: asset.description || asset.alt || "",
      fileName: asset.fileName,
      assetId: asset._id.toString(),
    }));

    const newCollection = {
      _id:
        "collection-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 9),
      name: name.trim(),
      description: (description || "").trim(),
      images: images,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collectionsColl.insertOne(newCollection);

    res.json({
      success: true,
      collection: newCollection,
      message: `สร้าง Collection "${newCollection.name}" สำเร็จ (${images.length} รูป)`,
    });
  } catch (err) {
    console.error("[Collections] create error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถสร้าง Image Collection ได้",
    });
  }
});

// PUT: แก้ไข Image Collection
app.put("/admin/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, imageLabels } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุชื่อ Collection",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const collectionsColl = db.collection("image_collections");
    const assetsColl = db.collection("instruction_assets");

    // ตรวจสอบว่า collection มีอยู่หรือไม่
    const existing = await collectionsColl.findOne({ _id: id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ Image Collection",
      });
    }

    // ดึงข้อมูลรูปภาพจาก labels ที่เลือก
    const selectedAssets = await assetsColl
      .find({
        label: { $in: imageLabels || [] },
      })
      .toArray();

    const images = selectedAssets.map((asset) => ({
      label: asset.label,
      slug: asset.slug || asset.label,
      url: asset.url,
      thumbUrl: asset.thumbUrl || asset.url,
      description: asset.description || asset.alt || "",
      fileName: asset.fileName,
      assetId: asset._id.toString(),
    }));

    await collectionsColl.updateOne(
      { _id: id },
      {
        $set: {
          name: name.trim(),
          description: (description || "").trim(),
          images: images,
          updatedAt: new Date(),
        },
      },
    );

    const updated = await collectionsColl.findOne({ _id: id });

    res.json({
      success: true,
      collection: updated,
      message: `แก้ไข Collection "${updated.name}" สำเร็จ (${images.length} รูป)`,
    });
  } catch (err) {
    console.error("[Collections] update error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถแก้ไข Image Collection ได้",
    });
  }
});

// DELETE: ลบ Image Collection
app.delete("/admin/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");

    // ตรวจสอบว่าเป็น default collection หรือไม่
    const collection = await coll.findOne({ _id: id });
    if (!collection) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ Image Collection",
      });
    }

    if (collection.isDefault) {
      return res.status(400).json({
        success: false,
        error: "ไม่สามารถลบ Default Collection ได้",
      });
    }

    // ลบ collection reference จาก bots
    await db
      .collection("line_bots")
      .updateMany(
        { selectedImageCollections: id },
        { $pull: { selectedImageCollections: id } },
      );

    await db
      .collection("facebook_bots")
      .updateMany(
        { selectedImageCollections: id },
        { $pull: { selectedImageCollections: id } },
      );

    // ลบ collection
    await coll.deleteOne({ _id: id });

    res.json({
      success: true,
      message: `ลบ Collection "${collection.name}" สำเร็จ`,
    });
  } catch (err) {
    console.error("[Collections] delete error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถลบ Image Collection ได้",
    });
  }
});

// ==================== END IMAGE COLLECTIONS API ====================

// Enhanced delete instruction with JSON response
app.delete("/admin/instructions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const deleteQueries = [];
    if (ObjectId.isValid(id)) {
      deleteQueries.push({ _id: new ObjectId(id) });
    }
    deleteQueries.push({ _id: id }); // กรณีที่ _id ถูกเก็บเป็นสตริง
    deleteQueries.push({ instructionId: id });

    let deleted = 0;
    for (const condition of deleteQueries) {
      const result = await coll.deleteOne(condition);
      if (result.deletedCount > 0) {
        deleted = result.deletedCount;
        break;
      }
    }

    if (deleted > 0) {
      res.json({ success: true, message: "ลบข้อมูลเรียบร้อยแล้ว" });
    } else {
      res.json({ success: false, error: "ไม่พบข้อมูลที่ต้องการลบ" });
    }
  } catch (err) {
    console.error("Delete instruction error:", err);
    res.json({ success: false, error: "ไม่สามารถลบข้อมูลได้" });
  }
});

// Show JSON for a table instruction
app.get("/admin/instructions/:id/json", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction || instruction.type !== "table") {
      return res.json({
        success: false,
        error: "ไม่พบ instruction หรือตรงประเภท",
      });
    }
    res.json({
      success: true,
      tableData: instruction.data,
      title: instruction.title || "",
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==========================================
// Broadcast System - Queue & Helpers
// ==========================================

const activeBroadcasts = new Map();

class BroadcastQueue {
  constructor(jobId, data, options = {}) {
    this.jobId = jobId;
    this.data = data; // { messages, targets, channels }
    this.options = options; // { batchSize, batchDelay, messageDelay }
    this.stats = {
      total: data.targets.length,
      sent: 0,
      failed: 0,
      status: "pending", // pending, running, completed, cancelled, failed
      startTime: null,
      endTime: null,
      errors: [],
    };
    this.isCancelled = false;
    this.botsCache = new Map(); // Cache bot data
  }

  async start() {
    this.stats.status = "running";
    this.stats.startTime = new Date();
    await this.saveHistory();

    const { targets } = this.data;
    const { batchSize = 10, batchDelay = 60, messageDelay = 1 } = this.options;

    try {
      // Pre-fetch bot data
      await this.loadBots();

      for (let i = 0; i < targets.length; i += batchSize) {
        if (this.isCancelled) break;

        const batch = targets.slice(i, i + batchSize);

        // Process batch safely
        const batchPromises = batch.map(async (target, index) => {
          if (this.isCancelled) return;
          // Add delay between messages in the same batch
          if (messageDelay > 0 && index > 0) {
            await new Promise((r) => setTimeout(r, index * messageDelay * 1000));
          }
          if (this.isCancelled) return;
          await this.sendToTarget(target);
        });

        await Promise.allSettled(batchPromises);

        await this.updateProgress();

        // Wait for batch delay if not the last batch
        if (i + batchSize < targets.length && !this.isCancelled) {
          await new Promise((r) => setTimeout(r, batchDelay * 1000));
        }
      }

      this.stats.status = this.isCancelled ? "cancelled" : "completed";
    } catch (error) {
      console.error(`[Broadcast] Job ${this.jobId} failed:`, error);
      this.stats.status = "failed";
      this.stats.errors.push({ error: error.message, timestamp: new Date() });
    } finally {
      this.stats.endTime = new Date();
      await this.saveHistory();
    }
  }

  async loadBots() {
    const client = await connectDB();
    const db = client.db("chatbot");

    // Unique bots needed
    const botKeys = new Set(this.data.targets.map(t => `${t.platform}:${t.botId}`));

    for (const key of botKeys) {
      const [platform, botId] = key.split(":");
      if (!botId || !ObjectId.isValid(botId)) continue;

      let bot;
      if (platform === 'facebook') {
        bot = await db.collection("facebook_bots").findOne({ _id: new ObjectId(botId) });
      } else if (platform === 'line') {
        bot = await db.collection("line_bots").findOne({ _id: new ObjectId(botId) });
      }

      if (bot) {
        this.botsCache.set(key, bot);
      }
    }
  }

  async sendToTarget(target) {
    const { userId, platform, botId } = target;
    const { messages } = this.data;
    const bot = this.botsCache.get(`${platform}:${botId}`);

    if (!bot) {
      this.stats.failed++;
      this.stats.errors.push({ userId, error: "Bot not found" });
      return;
    }

    try {
      if (platform === "facebook") {
        for (const msg of messages) {
          // Send each message sequentially
          if (msg.type === 'text') {
            await sendFacebookMessage(userId, msg.content, bot.accessToken, { metadata: "broadcast_auto" });
          } else if (msg.type === 'image') {
            // For image, we accept URL or fileId. 
            // Assuming msg.url is a public URL (e.g. from our upload)
            // Re-using sendFacebookMessage or direct axios if needed.
            // The sendFacebookMessage logic handles simple text. 
            // Let's try to construct a payload that sendFacebookMessage might prefer or just call axios directly.
            // Since sendFacebookMessage is complex, let's call axios directly for image to be safe.
            await axios.post(
              `https://graph.facebook.com/v18.0/me/messages`,
              {
                recipient: { id: userId },
                message: {
                  attachment: {
                    type: "image",
                    payload: { url: msg.url, is_reusable: true }
                  },
                  metadata: "broadcast_auto"
                }
              },
              {
                params: { access_token: bot.accessToken },
                headers: { "Content-Type": "application/json" }
              }
            );
          }
        }
      } else if (platform === "line") {
        const client = createLineClient(bot.channelAccessToken, bot.channelSecret);
        const lineMessages = messages.map(msg => {
          if (msg.type === 'text') {
            return { type: 'text', text: normalizeOutgoingText(msg.content) };
          }
          if (msg.type === 'image') return { type: 'image', originalContentUrl: msg.url, previewImageUrl: msg.url };
          return null;
        }).filter(Boolean);

        if (lineMessages.length > 0) {
          await client.pushMessage(userId, lineMessages);
        }
      }
      this.stats.sent++;
    } catch (e) {
      console.error(`[Broadcast] Failed to send to ${userId}: ${e.message}`);
      this.stats.failed++;
      // Limit error size
      if (this.stats.errors.length < 100) {
        this.stats.errors.push({ userId, error: e.message });
      }
    }
  }

  cancel() {
    this.isCancelled = true;
  }

  async saveHistory() {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("broadcast_history");

      await coll.updateOne(
        { _id: new ObjectId(this.jobId) },
        {
          $set: {
            stats: this.stats,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (e) {
      console.error("[Broadcast] Failed to save history:", e);
    }
  }

  async updateProgress() {
    // In-memory update is instant, but we might want to emit socket event here
    if (typeof io !== 'undefined') {
      io.emit('broadcastProgress', {
        jobId: this.jobId,
        stats: this.stats
      });
    }
    // Periodically save to DB? `saveHistory` handles that.
    // Maybe save every N updates.
    await this.saveHistory();
  }
}

async function getBroadcastAudience(channels, audienceType) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const chatColl = db.collection("chat_history");
  const followUpColl = db.collection("follow_up_status");

  let users = [];
  const getChatUserIdsForChannel = async (platform, botId) => {
    const pipeline = [
      { $match: { platform, botId } },
      {
        $addFields: {
          userKey: {
            $let: {
              vars: {
                raw: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$senderId", null] },
                        { $eq: ["$senderId", ""] },
                      ],
                    },
                    "$userId",
                    "$senderId",
                  ],
                },
              },
              in: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$$raw", null] },
                      { $eq: ["$$raw", ""] },
                    ],
                  },
                  null,
                  { $toString: "$$raw" },
                ],
              },
            },
          },
        },
      },
      { $match: { userKey: { $nin: [null, ""] } } },
      { $group: { _id: "$userKey" } },
    ];

    const rows = await chatColl.aggregate(pipeline).toArray();
    return rows.map((row) => row._id).filter(Boolean);
  };

  for (const ch of channels) {
    const [platform, botId] = ch.split(":");

    // Base query: all users for this bot
    let userIds = await getChatUserIdsForChannel(platform, botId);

    if (audienceType === 'all') {
      // No filter
    } else if (audienceType === 'tagged') {
      // Filter only those with hasFollowUp: true
      const taggedUsers = await followUpColl.find({
        senderId: { $in: userIds },
        hasFollowUp: true
      }).project({ senderId: 1 }).toArray();
      const taggedSet = new Set(taggedUsers.map(u => u.senderId));
      userIds = userIds.filter(id => taggedSet.has(id));
    } else if (audienceType === 'untagged') {
      // Filter exclude hasFollowUp: true
      const taggedUsers = await followUpColl.find({
        senderId: { $in: userIds },
        hasFollowUp: true
      }).project({ senderId: 1 }).toArray();
      const taggedSet = new Set(taggedUsers.map(u => u.senderId));
      userIds = userIds.filter(id => !taggedSet.has(id));
    }

    // Map to target objects
    users.push(...userIds.map(id => ({ userId: id, platform, botId })));
  }

  return users;
}

// Broadcast page
app.get("/admin/broadcast", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const lineBots = await db.collection("line_bots").find({}).toArray();
    const facebookBots = await db
      .collection("facebook_bots")
      .find({})
      .toArray();
    res.render("admin-broadcast", { lineBots, facebookBots });
  } catch (err) {
    console.error("Error loading broadcast page:", err);
    res.render("admin-broadcast", {
      lineBots: [],
      facebookBots: [],
      error: "ไม่สามารถโหลดข้อมูลบอทได้",
    });
  }
});

// Broadcast action
// Preview Audience
app.post("/admin/broadcast/preview", async (req, res) => {
  try {
    const { channels = [], audience = "all" } = req.body;
    if (!channels.length) {
      return res.json({ success: true, count: 0, users: [] });
    }
    const users = await getBroadcastAudience(channels, audience);

    const lineCount = users.filter((u) => u.platform === "line").length;
    const fbCount = users.filter((u) => u.platform === "facebook").length;

    res.json({
      success: true,
      count: users.length,
      counts: { total: users.length, line: lineCount, facebook: fbCount },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Start Broadcast (with Queue & Image Upload)
app.post("/admin/broadcast", upload.array("images"), async (req, res) => {
  try {
    let { messages, audience, channels, settings } = req.body;

    // Parse JSON fields if multipart
    const parseJSON = (val) => {
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch (e) {
          return val;
        }
      }
      return val;
    };

    messages = parseJSON(messages);
    channels = parseJSON(channels);
    audience = parseJSON(audience);
    settings = parseJSON(settings);

    // Default settings if not provided
    settings = {
      batchSize: parseInt(settings?.batchSize || 10),
      batchDelay: parseInt(settings?.batchDelay || 60),
      messageDelay: parseFloat(settings?.messageDelay || 1)
    };

    if (!messages || !channels || channels.length === 0) {
      throw new Error("กรุณากรอกข้อความและเลือกช่องทาง");
    }

    // Wrap single message if legacy format (string)
    if (typeof messages === 'string') {
      messages = [{ type: 'text', content: messages }];
    }

    // Process uploaded images
    if (req.files && req.files.length > 0) {
      const client = await connectDB();
      const db = client.db("chatbot");
      const bucket = new GridFSBucket(db, { bucketName: "broadcastAssets" });
      const { Readable } = require("stream");

      let fileIndex = 0;
      for (let i = 0; i < messages.length; i++) {
        if (
          messages[i].type === "image" &&
          !messages[i].url &&
          fileIndex < req.files.length
        ) {
          const file = req.files[fileIndex++];
          const filename = `broadcast-${Date.now()}-${file.originalname}`;

          // Upload to GridFS
          await new Promise((resolve, reject) => {
            const uploadStream = bucket.openUploadStream(filename, {
              contentType: file.mimetype,
            });
            const bufferStream = new Readable();
            bufferStream.push(file.buffer);
            bufferStream.push(null);

            bufferStream
              .pipe(uploadStream)
              .on("error", reject)
              .on("finish", () => resolve());
          });

          // Set URL
          messages[i].url = `/broadcast/assets/${filename}`;
        }
      }
    }

    // Get targets
    const users = await getBroadcastAudience(channels, audience);
    if (users.length === 0) {
      return res.json({ success: false, error: "ไม่พบกลุ่มเป้าหมายตามเงื่อนไขที่เลือก" });
    }

    // Create Job
    const jobId = new ObjectId().toString();
    const job = new BroadcastQueue(
      jobId,
      {
        messages,
        targets: users,
        channels,
      },
      settings,
    );

    activeBroadcasts.set(jobId, job);

    // Start in background
    job.start();

    res.json({ success: true, broadcastId: jobId, count: users.length });
  } catch (err) {
    console.error("Broadcast failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check Status
app.get("/admin/broadcast/status/:jobId", (req, res) => {
  const job = activeBroadcasts.get(req.params.jobId);
  if (!job) {
    return res.json({ success: false, error: "ไม่พบรายการ หรือรายการเสร็จสิ้นแล้ว" });
  }
  res.json({ success: true, stats: job.stats });
});

// Cancel Broadcast
app.delete("/admin/broadcast/cancel/:jobId", (req, res) => {
  const job = activeBroadcasts.get(req.params.jobId);
  if (job) {
    job.cancel();
    return res.json({ success: true });
  }
  res.json({ success: false, error: "ไม่พบรายการ" });
});

// Serve Broadcast Assets
app.get("/broadcast/assets/:filename", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const bucket = new GridFSBucket(db, { bucketName: "broadcastAssets" });

    const files = await bucket
      .find({ filename: req.params.filename })
      .toArray();
    if (!files || files.length === 0)
      return res.status(404).send("File not found");

    const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
    res.set("Content-Type", files[0].contentType || "image/jpeg");
    downloadStream.pipe(res);
  } catch (e) {
    res.status(500).send("Error");
  }
});

// Follow-up page (stub)
app.get("/admin/followup", async (req, res) => {
  try {
    const baseConfig = await getFollowUpBaseConfig();
    res.render("admin-followup", {
      followUpConfig: {
        analysisEnabled: baseConfig.analysisEnabled !== false,
        showDashboard: baseConfig.showInDashboard !== false,
      },
      orderPromptDefaults: {
        instructions:
          baseConfig.orderPromptInstructions || DEFAULT_ORDER_PROMPT_BODY,
        jsonSuffix: ORDER_PROMPT_JSON_SUFFIX,
      },
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถโหลดหน้าติดตามลูกค้าได้:", error);
    res.render("admin-followup", {
      followUpConfig: {
        analysisEnabled: false,
        showDashboard: false,
      },
      orderPromptDefaults: {
        instructions: DEFAULT_ORDER_PROMPT_BODY,
        jsonSuffix: ORDER_PROMPT_JSON_SUFFIX,
      },
    });
  }
});

// Follow-up status page now redirects to unified dashboard
app.get("/admin/followup/status", (req, res) => {
  return res.redirect("/admin/followup");
});

app.get("/admin/followup/overview", async (req, res) => {
  try {
    const overview = await buildFollowUpOverview();
    res.json({
      success: true,
      summary: overview.summary,
      groups: overview.groups,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงข้อมูลสรุปได้:", error);
    res.json({
      success: false,
      error: error.message || "ไม่สามารถดึงข้อมูลสรุปได้",
    });
  }
});

app.get("/admin/followup/users", async (req, res) => {
  try {
    const { platform, botId } = req.query || {};
    const normalizedPlatform = platform || null;
    const normalizedBotId = botId ? normalizeFollowUpBotId(botId) : null;
    const contextConfig = await getFollowUpConfigForContext(
      normalizedPlatform || "line",
      normalizedBotId,
    );

    if (contextConfig.showInDashboard === false) {
      return res.json({
        success: false,
        disabled: true,
        message: "หน้าติดตามลูกค้าถูกปิดใช้งานสำหรับเพจนี้",
        config: contextConfig,
      });
    }

    const result = await getFollowUpUsers({
      platform: normalizedPlatform || undefined,
      botId: normalizedBotId || undefined,
    });

    res.json({
      success: true,
      users: result.users,
      summary: result.summary,
      config: contextConfig,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงรายการผู้ใช้ได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/followup/clear", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.json({ success: false, error: "กรุณาระบุ userId" });
    }
    const client = await connectDB();
    const db = client.db("chatbot");
    const existing = await db
      .collection("follow_up_status")
      .findOne({ senderId: userId });
    let platform = existing?.platform || null;
    let botId = existing ? normalizeFollowUpBotId(existing?.botId) : null;
    if (!platform) {
      const latestTask = await db
        .collection("follow_up_tasks")
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      if (latestTask.length > 0) {
        platform = latestTask[0].platform || null;
        botId = normalizeFollowUpBotId(latestTask[0].botId);
      }
    }

    const contextConfig = await getFollowUpConfigForContext(
      platform || "line",
      botId,
    );
    if (contextConfig.showInDashboard === false) {
      // อนุญาตให้ล้างแท็กแม้ถูกปิดแสดง แต่แจ้งเตือนฝั่ง client
      console.warn(
        "[FollowUp] Clearing status on hidden page:",
        platform,
        botId,
      );
    }

    await cancelFollowUpTasksForUser(userId, platform, botId, {
      reason: "manual_clear",
    });
    await clearFollowUpStatus(userId);
    try {
      if (io) {
        io.emit("followUpTagged", {
          userId,
          hasFollowUp: false,
          followUpReason: "",
          followUpUpdatedAt: new Date(),
          platform,
          botId,
        });
      }
    } catch (_) { }
    res.json({ success: true });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถล้างสถานะได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.get("/admin/followup/page-settings", async (req, res) => {
  try {
    const result = await listFollowUpPageSettings();
    res.json({
      success: true,
      pages: result.pages,
      baseConfig: result.baseConfig,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงการตั้งค่าหน้าเพจได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/followup/page-settings", async (req, res) => {
  try {
    const { platform, botId, settings } = req.body || {};
    if (!platform || !["line", "facebook"].includes(platform)) {
      return res
        .status(400)
        .json({ success: false, error: "ระบุแพลตฟอร์มไม่ถูกต้อง" });
    }

    const normalizedBotId = normalizeFollowUpBotId(botId);
    const sanitized = {};
    const boolKeys = [
      "analysisEnabled",
      "showInChat",
      "showInDashboard",
      "autoFollowUpEnabled",
    ];
    const numberKeys = {};

    boolKeys.forEach((key) => {
      if (typeof settings?.[key] === "boolean") {
        sanitized[key] = settings[key];
      }
    });

    Object.keys(numberKeys).forEach((key) => {
      const value = settings?.[key];
      if (typeof value === "number" && !Number.isNaN(value)) {
        const range = numberKeys[key];
        const clamped = Math.min(Math.max(value, range.min), range.max);
        sanitized[key] = clamped;
      }
    });

    if (
      typeof settings?.orderPromptInstructions === "string" &&
      settings.orderPromptInstructions.trim().length
    ) {
      const trimmedPrompt = settings.orderPromptInstructions.trim();
      sanitized.orderPromptInstructions = trimmedPrompt.slice(0, 4000);
    }

    if (
      typeof settings?.model === "string" &&
      settings.model.trim().length > 0
    ) {
      sanitized.model = settings.model.trim();
    }

    if (Array.isArray(settings?.rounds)) {
      sanitized.rounds = normalizeFollowUpRounds(settings.rounds);
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_page_settings");

    await coll.updateOne(
      { platform, botId: normalizedBotId },
      {
        $set: {
          platform,
          botId: normalizedBotId,
          settings: sanitized,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    resetFollowUpConfigCache();

    res.json({ success: true });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถปรับปรุงการตั้งค่าหน้าเพจได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.delete("/admin/followup/page-settings", async (req, res) => {
  try {
    const { platform, botId } = req.body || {};
    if (!platform || !["line", "facebook"].includes(platform)) {
      return res
        .status(400)
        .json({ success: false, error: "ระบุแพลตฟอร์มไม่ถูกต้อง" });
    }
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_page_settings");

    await coll.deleteOne({ platform, botId: normalizedBotId });
    resetFollowUpConfigCache();

    res.json({ success: true });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถรีเซ็ตการตั้งค่าหน้าเพจได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post(
  "/admin/followup/assets",
  imageUpload.array("images", 5),
  async (req, res) => {
    try {
      const files =
        Array.isArray(req.files) && req.files.length
          ? req.files
          : req.file
            ? [req.file]
            : [];
      if (!files.length) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาอัพโหลดไฟล์รูปภาพ" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("follow_up_assets");
      const bucket = new GridFSBucket(db, { bucketName: "followupAssets" });
      const urlBase = PUBLIC_BASE_URL
        ? PUBLIC_BASE_URL.replace(/\/$/, "")
        : req.get("host")
          ? `https://${req.get("host")}`
          : "";

      const assets = [];
      for (const file of files) {
        const image = sharp(file.buffer);
        const metadata = await image.metadata();
        const optimized = await image
          .jpeg({ quality: 88, progressive: true })
          .toBuffer();
        const sha256 = crypto
          .createHash("sha256")
          .update(optimized)
          .digest("hex");

        const existing = await coll.findOne({ sha256 });
        if (existing) {
          assets.push({
            id: existing._id?.toString(),
            assetId: existing._id?.toString(),
            url: existing.url,
            previewUrl: existing.thumbUrl || existing.url,
            thumbUrl: existing.thumbUrl,
            width: existing.width || null,
            height: existing.height || null,
            size: existing.size || null,
            fileName: existing.fileName || null,
          });
          continue;
        }

        const thumb = await sharp(optimized)
          .resize({
            width: 512,
            height: 512,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        const uniqueId = crypto.randomBytes(8).toString("hex");
        const timestamp = Date.now();
        const baseName = `followup_${timestamp}_${uniqueId}`;
        const fileName = `${baseName}.jpg`;
        const thumbName = `${baseName}_thumb.jpg`;
        const [fileId, thumbFileId] = await Promise.all([
          uploadBufferToGridFS(bucket, fileName, optimized, {
            contentType: "image/jpeg",
            metadata: {
              type: "original",
              width: metadata.width || null,
              height: metadata.height || null,
            },
          }),
          uploadBufferToGridFS(bucket, thumbName, thumb, {
            contentType: "image/jpeg",
            metadata: { type: "thumb" },
          }),
        ]);

        const assetDoc = {
          fileName,
          thumbName,
          thumbFileName: thumbName,
          fileId,
          thumbFileId,
          storage: "mongo",
          sha256,
          mime: "image/jpeg",
          size: optimized.length,
          width: metadata.width || null,
          height: metadata.height || null,
          url: `${urlBase}/assets/followup/${fileName}`,
          thumbUrl: `${urlBase}/assets/followup/${thumbName}`,
          originalName: file.originalname || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const insertResult = await coll.insertOne(assetDoc);
        const assetId = insertResult.insertedId?.toString();

        assets.push({
          id: assetId,
          assetId,
          url: assetDoc.url,
          previewUrl: assetDoc.thumbUrl || assetDoc.url,
          thumbUrl: assetDoc.thumbUrl,
          width: assetDoc.width,
          height: assetDoc.height,
          size: assetDoc.size,
          fileName: assetDoc.fileName,
        });
      }

      res.json({ success: true, assets });
    } catch (error) {
      console.error("[FollowUp] อัพโหลดรูปภาพไม่สำเร็จ:", error);
      res.status(400).json({
        success: false,
        error: error.message || "อัพโหลดรูปภาพไม่สำเร็จ",
      });
    }
  },
);

// ============================ Chat System Routes ============================

// Chat page
app.get("/admin/chat", async (req, res) => {
  try {
    const analysisEnabled = await getSettingValue(
      "enableFollowUpAnalysis",
      true,
    );
    const showInChat = await getSettingValue("followUpShowInChat", true);
    res.render("admin-chat", {
      followUpConfig: {
        analysisEnabled,
        showInChat,
      },
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถโหลดหน้าจัดการแชทได้:", error);
    res.render("admin-chat", {
      followUpConfig: {
        analysisEnabled: false,
        showInChat: false,
      },
    });
  }
});

app.get("/admin/orders", async (req, res) => {
  try {
    res.render("admin-orders");
  } catch (error) {
    console.error("[Orders] ไม่สามารถโหลดหน้าออเดอร์ได้:", error);
    res.render("admin-orders");
  }
});

// ============================ Customer Statistics Routes ============================

function parseCustomerStatsDateRange(startDateStr, endDateStr) {
  const today = getBangkokMoment();
  let startMoment = startDateStr
    ? moment.tz(startDateStr, "YYYY-MM-DD", BANGKOK_TZ)
    : today.clone();
  let endMoment = endDateStr
    ? moment.tz(endDateStr, "YYYY-MM-DD", BANGKOK_TZ)
    : today.clone();

  if (!startMoment.isValid()) {
    startMoment = today.clone();
  }
  if (!endMoment.isValid()) {
    endMoment = startMoment.clone();
  }

  startMoment = startMoment.startOf("day");
  endMoment = endMoment.endOf("day");

  if (endMoment.isBefore(startMoment)) {
    endMoment = startMoment.clone().endOf("day");
  }

  return { startMoment, endMoment };
}

app.get("/admin/customer-stats", async (req, res) => {
  try {
    res.render("admin-customer-stats");
  } catch (error) {
    console.error("[CustomerStats] ไม่สามารถโหลดหน้าสถิติลูกค้าได้:", error);
    res.render("admin-customer-stats");
  }
});

app.get("/admin/customer-stats/data", async (req, res) => {
  try {
    const { pageKey, startDate, endDate } = req.query;
    const client = await connectDB();
    const db = client.db("chatbot");

    // Parse date filters (normalize to Bangkok time)
    const { startMoment, endMoment } = parseCustomerStatsDateRange(
      startDate,
      endDate,
    );
    const dateStart = startMoment.toDate();
    const dateEnd = endMoment.toDate();
    const startDateKey = startMoment.format("YYYY-MM-DD");
    const endDateKey = endMoment.format("YYYY-MM-DD");

    // Parse pageKey to get platform and botId
    let filterPlatform = null;
    let filterBotId = null;
    if (pageKey) {
      const parsed = parseOrderPageKey(pageKey);
      filterPlatform = parsed.platform;
      filterBotId = parsed.botId;
    }

    // Build base query for orders
    const orderQuery = {
      extractedAt: { $gte: dateStart, $lte: dateEnd }
    };
    if (filterPlatform) orderQuery.platform = filterPlatform;
    if (filterBotId) orderQuery.botId = filterBotId;

    // Build base query for chat history
    const chatQuery = {
      timestamp: { $gte: dateStart, $lte: dateEnd },
      role: "user"
    };
    if (filterPlatform) chatQuery.platform = filterPlatform;
    if (filterBotId) chatQuery.botId = filterBotId;

    // Get orders
    const orders = await db.collection("orders").find(orderQuery).toArray();

    // Get chat messages for hourly distribution
    const chatMessages = await db.collection("chat_history")
      .find(chatQuery)
      .project({ senderId: 1, timestamp: 1 })
      .toArray();

    // Calculate overview stats
    const uniqueUsers = new Set(
      chatMessages.map((m) => m.senderId || m.userId).filter(Boolean),
    );
    const totalActiveUsers = uniqueUsers.size;
    const totalMessages = chatMessages.length;

    // Find new users (first message in the period)
    const userFirstMessages = {};
    chatMessages.forEach(m => {
      const senderId = m.senderId || m.userId;
      if (!senderId) return;
      const ts = getBangkokMoment(m.timestamp).valueOf();
      if (!userFirstMessages[senderId] || ts < userFirstMessages[senderId]) {
        userFirstMessages[senderId] = ts;
      }
    });

    // Check if user had messages before dateStart
    const allUserIds = [...uniqueUsers];
    let newUsers = 0;
    if (allUserIds.length > 0) {
      const existingMatch = {
        senderId: { $in: allUserIds },
        timestamp: { $lt: dateStart },
        role: "user",
      };
      if (filterPlatform) existingMatch.platform = filterPlatform;
      if (filterBotId) existingMatch.botId = filterBotId;

      const existingUsers = await db.collection("chat_history")
        .aggregate([
          {
            $match: existingMatch
          },
          { $group: { _id: "$senderId" } }
        ])
        .toArray();
      const existingUserIds = new Set(existingUsers.map(u => u._id));
      newUsers = allUserIds.filter(id => !existingUserIds.has(id)).length;
    }

    // Calculate sales stats
    const uniqueBuyers = new Set(
      orders.map((o) => o.userId).filter(Boolean),
    ).size;
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === "pending").length;
    const confirmedOrders = orders.filter(o => o.status === "confirmed").length;
    const shippedOrders = orders.filter(o => o.status === "shipped").length;
    const completedOrders = orders.filter(o => o.status === "completed").length;
    const cancelledOrders = orders.filter(o => o.status === "cancelled").length;

    let totalSales = 0;
    let totalShipping = 0;
    orders.forEach(order => {
      const orderData = order.orderData || {};
      const items = Array.isArray(orderData.items) ? orderData.items : [];
      items.forEach(item => {
        totalSales += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
      });
      totalShipping += parseFloat(orderData.shippingCost) || 0;
    });

    // Calculate conversion rates
    const conversionRate = totalActiveUsers > 0 ? (uniqueBuyers / totalActiveUsers * 100) : 0;
    const orderConfirmationRate = totalOrders > 0 ? ((confirmedOrders + shippedOrders + completedOrders) / totalOrders * 100) : 0;
    const orderCompletionRate = totalOrders > 0 ? (completedOrders / totalOrders * 100) : 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
    const avgCustomerValue = uniqueBuyers > 0 ? Math.round(totalSales / uniqueBuyers) : 0;

    // Calculate hourly message distribution (3 modes: all, buyers, non-buyers)
    const buyerUserIds = new Set(
      orders.map((o) => o.userId).filter(Boolean),
    );

    const hourlyAll = Array.from({ length: 24 }, () => new Set());
    const hourlyBuyers = Array.from({ length: 24 }, () => new Set());
    const hourlyNonBuyers = Array.from({ length: 24 }, () => new Set());

    chatMessages.forEach((m) => {
      const senderId = m.senderId || m.userId;
      if (!senderId) return;
      const ts = getBangkokMoment(m.timestamp);
      const hour = ts.hour();
      const dateKey = ts.format("YYYY-MM-DD");
      const userDayKey = `${dateKey}:${senderId}`;

      hourlyAll[hour].add(userDayKey);
      if (buyerUserIds.has(senderId)) {
        hourlyBuyers[hour].add(userDayKey);
      } else {
        hourlyNonBuyers[hour].add(userDayKey);
      }
    });

    const hourlyMessages = {
      all: hourlyAll.map(set => set.size),
      buyers: hourlyBuyers.map(set => set.size),
      nonBuyers: hourlyNonBuyers.map(set => set.size)
    };

    // Get follow-up stats
    const followUpQuery = {
      dateKey: { $gte: startDateKey, $lte: endDateKey }
    };
    if (filterPlatform) followUpQuery.platform = filterPlatform;
    if (filterBotId) followUpQuery.botId = normalizeFollowUpBotId(filterBotId);

    const followUpTasks = await db.collection("follow_up_tasks").find(followUpQuery).toArray();
    const followUpActive = followUpTasks.filter(
      (t) => t.canceled !== true && t.completed !== true && t.status !== "failed",
    ).length;
    const followUpCompleted = followUpTasks.filter((t) => t.completed === true).length;
    const followUpCanceled = followUpTasks.filter((t) => t.canceled === true).length;
    const followUpFailed = followUpTasks.filter((t) => {
      if (t.status === "failed") return true;
      if (t.cancelReason === "send_failed") return true;
      const rounds = Array.isArray(t.rounds) ? t.rounds : [];
      return rounds.some((r) => r?.status === "failed");
    }).length;

    // Calculate payment methods
    let codCount = 0;
    let transferCount = 0;
    let otherCount = 0;
    orders.forEach(order => {
      const payment = (order.orderData?.paymentMethod || "").toLowerCase();
      if (payment.includes("ปลายทาง") || payment.includes("cod")) {
        codCount++;
      } else if (payment.includes("โอน") || payment.includes("transfer")) {
        transferCount++;
      } else if (payment) {
        otherCount++;
      }
    });

    // Calculate top products
    const productStats = {};
    orders.forEach(order => {
      const items = Array.isArray(order.orderData?.items) ? order.orderData.items : [];
      items.forEach(item => {
        const name = item.product || "ไม่ระบุ";
        if (!productStats[name]) {
          productStats[name] = { name, quantity: 0, revenue: 0 };
        }
        productStats[name].quantity += parseInt(item.quantity) || 0;
        productStats[name].revenue += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
      });
    });
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Calculate top customers
    const customerStats = {};
    orders.forEach(order => {
      const userId = order.userId;
      if (!userId) return;
      if (!customerStats[userId]) {
        customerStats[userId] = {
          userId,
          name: order.orderData?.customerName || null,
          orderCount: 0,
          totalSpent: 0
        };
      }
      customerStats[userId].orderCount++;
      const items = Array.isArray(order.orderData?.items) ? order.orderData.items : [];
      items.forEach(item => {
        customerStats[userId].totalSpent += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0);
      });
    });

    // Get display names for top customers
    const topCustomersRaw = Object.values(customerStats)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    const customerUserIds = topCustomersRaw.map(c => c.userId).filter(Boolean);
    let profileMap = {};
    if (customerUserIds.length > 0) {
      const profiles = await db.collection("user_profiles")
        .find({ userId: { $in: customerUserIds } })
        .project({ userId: 1, displayName: 1 })
        .toArray();
      profiles.forEach(p => {
        profileMap[p.userId] = p.displayName;
      });
    }

    const topCustomers = topCustomersRaw.map(c => ({
      ...c,
      name: c.name || profileMap[c.userId] || c.userId?.substring(0, 12) || "ไม่ระบุ"
    }));

    res.json({
      success: true,
      data: {
        overview: {
          newUsers,
          totalActiveUsers,
          totalMessages
        },
        sales: {
          uniqueBuyers,
          totalOrders,
          pendingOrders,
          confirmedOrders,
          shippedOrders,
          completedOrders,
          cancelledOrders,
          totalSales: Math.round(totalSales),
          totalShipping: Math.round(totalShipping)
        },
        conversion: {
          conversionRate,
          orderConfirmationRate,
          orderCompletionRate,
          avgOrderValue,
          avgCustomerValue
        },
        followUp: {
          active: followUpActive,
          completed: followUpCompleted,
          canceled: followUpCanceled,
          failed: followUpFailed
        },
        hourlyMessages,
        topProducts,
        topCustomers,
        paymentMethods: {
          cod: codCount,
          transfer: transferCount,
          other: otherCount
        }
      }
    });
  } catch (error) {
    console.error("[CustomerStats] ไม่สามารถดึงข้อมูลสถิติได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.get("/admin/orders/pages", async (req, res) => {
  res.json({
    success: true,
    pages: [],
    settings: {
      schedulingEnabled: false,
      defaultCutoffTime: "00:00",
      extractionMode: "realtime",
    },
  });

});


// Get users who have chatted
app.get("/admin/chat/users", async (req, res) => {
  try {
    const rawFocus =
      (req.query && (req.query.focus || req.query.userId || req.query.user)) ||
      "";
    const focusUserId = Array.isArray(rawFocus)
      ? String(rawFocus[0] || "").trim()
      : String(rawFocus || "").trim();
    // ใช้ฟังก์ชันตัวกรองข้อมูลใหม่
    const users = await getNormalizedChatUsers({
      applyFilter: true,
      focusUserId,
    });

    res.json({ success: true, users: users });
  } catch (err) {
    console.error("Error getting chat users:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get per-user AI status
app.get("/admin/chat/user-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await getUserStatus(userId);
    res.json({
      success: true,
      aiEnabled: !!status.aiEnabled,
      updatedAt: status.updatedAt,
    });
  } catch (err) {
    console.error("Error getting user status:", err);
    res.json({ success: false, error: err.message });
  }
});

// Set per-user AI status
app.post("/admin/chat/user-status", async (req, res) => {
  try {
    const { userId, aiEnabled } = req.body || {};
    if (!userId || typeof aiEnabled === "undefined") {
      return res.json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    await setUserStatus(userId, !!aiEnabled);

    // บันทึกข้อความระบบลงประวัติ (ไม่ส่งถึงผู้ใช้จริง)
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");
    const lastChat = await coll.findOne(
      buildChatHistoryUserMatch(userId),
      { sort: { timestamp: -1 } },
    );
    const platform = lastChat?.platform || "line";
    const botId = lastChat?.botId || null;

    const controlText = aiEnabled
      ? "เปิด AI สำหรับผู้ใช้นี้แล้ว"
      : "ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว";
    const controlDoc = {
      senderId: userId,
      role: "assistant",
      content: `[ระบบ] ${controlText}`,
      timestamp: new Date(),
      source: "admin_chat",
      platform,
      botId,
    };
    const controlInsertResult = await coll.insertOne(controlDoc);
    if (controlInsertResult?.insertedId) {
      controlDoc._id = controlInsertResult.insertedId;
    }

    try {
      await resetUserUnreadCount(userId);
    } catch (_) { }

    // Notify admin UIs
    try {
      io.emit("newMessage", {
        userId,
        message: controlDoc,
        sender: "assistant",
        timestamp: controlDoc.timestamp,
      });
    } catch (_) { }

    res.json({ success: true, aiEnabled: !!aiEnabled });
  } catch (err) {
    console.error("Error setting user status:", err);
    res.json({ success: false, error: err.message });
  }
});

app.post("/admin/chat/users/:userId/refresh-profile", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.json({ success: false, error: "ไม่พบรหัสผู้ใช้" });
    }

    const { platform: bodyPlatform, botId: bodyBotId } = req.body || {};

    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");

    let platform = bodyPlatform || null;
    let botId = bodyBotId || null;

    if (!platform || !botId) {
      const lastChat = await chatColl.findOne(
        buildChatHistoryUserMatch(userId),
        { sort: { timestamp: -1 }, projection: { platform: 1, botId: 1 } },
      );
      platform = platform || lastChat?.platform || null;
      botId = botId || lastChat?.botId || null;
    }

    if (platform !== "facebook") {
      return res.json({
        success: false,
        error: "สามารถอัปเดตได้เฉพาะผู้ใช้ Facebook เท่านั้น",
      });
    }

    if (!botId) {
      return res.json({
        success: false,
        error: "ไม่พบข้อมูลเพจสำหรับผู้ใช้นี้",
      });
    }

    const fbColl = db.collection("facebook_bots");
    let facebookBot = null;

    if (ObjectId.isValid(botId)) {
      facebookBot = await fbColl.findOne({ _id: new ObjectId(botId) });
    }
    if (!facebookBot) {
      facebookBot = await fbColl.findOne({ _id: botId });
    }
    if (!facebookBot) {
      facebookBot = await fbColl.findOne({ pageId: botId });
    }

    if (!facebookBot || !facebookBot.accessToken) {
      return res.json({
        success: false,
        error: "ไม่พบข้อมูลเพจหรือ Access Token ของ Facebook Bot",
      });
    }

    await ensureFacebookProfileDisplayName(userId, facebookBot.accessToken);

    const profile = await db
      .collection("user_profiles")
      .findOne(
        { userId, platform: "facebook" },
        { projection: { displayName: 1, updatedAt: 1 } },
      );

    if (!profile?.displayName) {
      return res.json({
        success: false,
        error: "ไม่สามารถดึงชื่อจาก Facebook ได้",
      });
    }

    res.json({
      success: true,
      displayName: profile.displayName,
      updatedAt: profile.updatedAt || null,
    });
  } catch (error) {
    console.error("[Chat] refresh-profile error:", error);
    res.json({ success: false, error: error.message || "เกิดข้อผิดพลาด" });
  }
});

app.post("/admin/chat/mark-read/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.json({ success: false, error: "ไม่พบรหัสผู้ใช้" });
    }

    await resetUserUnreadCount(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Chat] mark-read error:", error);
    res.json({ success: false, error: error.message || "เกิดข้อผิดพลาด" });
  }
});

// Get chat history for a specific user
app.get("/admin/chat/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // ใช้ฟังก์ชันตัวกรองข้อมูลใหม่
    const messages = await getNormalizedChatHistory(userId);

    // รีเซ็ต unread count เมื่อแอดมินดูประวัติการสนทนา
    await resetUserUnreadCount(userId);

    res.json({ success: true, messages: messages });
  } catch (err) {
    console.error("Error getting chat history:", err);
    res.json({ success: false, error: err.message });
  }
});

// Send message as admin (AI assistant)
app.post("/admin/chat/send", async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    // ตรวจจับคำสั่งควบคุมจากแอดมิน
    const trimmed = String(message).trim();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    // Determine platform and bot from latest chat
    const lastChat = await coll.findOne(
      buildChatHistoryUserMatch(userId),
      { sort: { timestamp: -1 } },
    );
    const platform = lastChat?.platform || "line";
    const botId = lastChat?.botId || null;

    // ดึงข้อมูล bot เพื่อตรวจสอบ keyword settings
    let keywordSettings = {};
    if (botId && ObjectId.isValid(botId)) {
      const botColl =
        platform === "facebook"
          ? db.collection("facebook_bots")
          : db.collection("line_bots");
      const bot = await botColl.findOne({ _id: new ObjectId(botId) });
      if (bot && bot.keywordSettings) {
        keywordSettings = bot.keywordSettings;
      }
    }

    // ตรวจสอบ keyword actions ก่อน (เช่น เปิด/ปิด AI, ปิดระบบติดตาม)
    const keywordResult = await detectKeywordAction(
      trimmed,
      keywordSettings,
      userId,
      platform,
      botId,
      true, // isFromAdmin = true
    );

    if (keywordResult.action) {
      // ถ้ามี keyword action และต้องการส่งข้อความตอบกลับ
      if (keywordResult.sendResponse && keywordResult.message) {
        const controlDoc = {
          senderId: userId,
          role: "assistant",
          content: `[ระบบ] ${keywordResult.message}`,
          timestamp: new Date(),
          source: "admin_chat",
          platform,
          botId,
        };
        const controlInsertResult = await coll.insertOne(controlDoc);
        if (controlInsertResult?.insertedId) {
          controlDoc._id = controlInsertResult.insertedId;
        }
        await resetUserUnreadCount(userId);

        // Emit เพื่ออัปเดต UI ของแอดมิน
        io.emit("newMessage", {
          userId: userId,
          message: controlDoc,
          sender: "assistant",
          timestamp: controlDoc.timestamp,
        });

        return res.json({
          success: true,
          control: true,
          displayMessage: keywordResult.message,
          skipEcho: true,
        });
      } else {
        // ไม่ส่งข้อความตอบกลับ แต่ดำเนินการสำเร็จ
        return res.json({
          success: true,
          control: true,
          displayMessage: "ดำเนินการเรียบร้อยแล้ว (ไม่ส่งข้อความตอบกลับ)",
          skipEcho: true,
          silent: true,
        });
      }
    }

    // กรณีเป็นคำสั่ง [ปิด] / [เปิด] (legacy)
    if (trimmed === "[ปิด]" || trimmed === "[เปิด]") {
      const enable = trimmed === "[เปิด]";
      await setUserStatus(userId, enable);

      const controlText = enable
        ? "เปิด AI สำหรับผู้ใช้นี้แล้ว"
        : "ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว";
      const controlDoc = {
        senderId: userId,
        role: "assistant",
        content: `[ระบบ] ${controlText}`,
        timestamp: new Date(),
        source: "admin_chat",
        platform,
        botId,
      };
      const legacyControlInsert = await coll.insertOne(controlDoc);
      if (legacyControlInsert?.insertedId) {
        controlDoc._id = legacyControlInsert.insertedId;
      }

      // รีเซ็ต unread count เมื่อแอดมินตอบกลับ
      await resetUserUnreadCount(userId);

      // ไม่ส่งข้อความควบคุมไปยังผู้ใช้

      // Emit เพื่ออัปเดต UI ของแอดมิน
      io.emit("newMessage", {
        userId: userId,
        message: controlDoc,
        sender: "assistant",
        timestamp: controlDoc.timestamp,
      });

      return res.json({
        success: true,
        control: true,
        displayMessage: controlText,
        skipEcho: true,
      });
    }

    // ส่งต่อไปยังแพลตฟอร์มของผู้ใช้ (และหลีกเลี่ยงการบันทึกซ้ำในกรณี Facebook เพื่อกันแสดงซ้ำ)
    if (platform === "facebook") {
      try {
        if (botId) {
          const fbBot = await db
            .collection("facebook_bots")
            .findOne({ _id: new ObjectId(botId) });
          if (fbBot) {
            await sendFacebookMessage(userId, message, fbBot.accessToken, {
              metadata: "admin_manual",
            });
            console.log(
              `[Admin Chat] ส่งข้อความไปยัง Facebook user ${userId}: ${message.substring(0, 50)}...`,
            );
            // ไม่ insert messageDoc และไม่ emit ที่นี่ ให้รอ Facebook echo บันทึกและกระจาย UI แทน
            return res.json({ success: true, skipEcho: true });
          }
        }
        // ถ้าไม่มี fbBot ให้ถือว่าไม่สามารถส่งได้
        return res.json({
          success: false,
          error: "ไม่พบ Facebook Bot สำหรับผู้ใช้นี้",
        });
      } catch (fbError) {
        console.log(
          `[Admin Chat] ไม่สามารถส่งไปยัง Facebook ได้: ${fbError.message}`,
        );
        return res.json({
          success: false,
          error: "ไม่สามารถส่งไปยัง Facebook ได้",
        });
      }
    }

    // LINE หรือแพลตฟอร์มอื่น: insert และ emit ตามปกติ
    const messageDoc = {
      senderId: userId,
      role: "assistant",
      content: message,
      timestamp: new Date(),
      source: "admin_chat",
      platform,
      botId,
    };

    const messageInsertResult = await coll.insertOne(messageDoc);
    if (messageInsertResult?.insertedId) {
      messageDoc._id = messageInsertResult.insertedId;
    }
    await resetUserUnreadCount(userId);

    try {
      const normalizedMessage = normalizeOutgoingText(message);
      await lineClient.pushMessage(userId, {
        type: "text",
        text: normalizedMessage,
      });
      console.log(
        `[Admin Chat] ส่งข้อความไปยัง LINE user ${userId}: ${message.substring(0, 50)}...`,
      );
    } catch (lineError) {
      console.log(
        `[Admin Chat] ไม่สามารถส่งไปยัง LINE ได้: ${lineError.message}`,
      );
      // ไม่ return error เพราะข้อความยังบันทึกลง database ได้
    }

    io.emit("newMessage", {
      userId,
      message: messageDoc,
      sender: "assistant",
      timestamp: messageDoc.timestamp,
    });

    res.json({ success: true, message: "ส่งข้อความเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error sending admin message:", err);
    res.json({ success: false, error: err.message });
  }
});

// Clear chat history for a user
app.delete("/admin/chat/clear/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await clearUserChatHistory(userId);

    // รีเซ็ต unread count เมื่อล้างประวัติ
    await resetUserUnreadCount(userId);

    // Emit to socket clients
    io.emit("chatCleared", { userId });

    res.json({ success: true, message: "ล้างประวัติการสนทนาเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error clearing chat:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========== Tag Management APIs ==========

// Get tags for a specific user
app.get("/admin/chat/tags/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const tagsColl = db.collection("user_tags");

    const userTags = await tagsColl.findOne({ userId });

    res.json({
      success: true,
      tags: userTags ? userTags.tags : [],
    });
  } catch (err) {
    console.error("Error getting user tags:", err);
    res.json({ success: false, error: err.message });
  }
});

// Set tags for a specific user
app.post("/admin/chat/tags/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.json({ success: false, error: "tags ต้องเป็น array" });
    }

    // ตรวจสอบและทำความสะอาด tags
    const cleanTags = tags
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0 && tag.length <= 50)
      .slice(0, 20); // จำกัดไม่เกิน 20 tags ต่อคน

    const client = await connectDB();
    const db = client.db("chatbot");
    const tagsColl = db.collection("user_tags");

    await tagsColl.updateOne(
      { userId },
      {
        $set: {
          tags: cleanTags,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    // Emit to socket clients
    io.emit("userTagsUpdated", { userId, tags: cleanTags });

    res.json({ success: true, tags: cleanTags });
  } catch (err) {
    console.error("Error setting user tags:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========== Message Feedback APIs ==========

app.post("/admin/chat/feedback", async (req, res) => {
  try {
    const { messageId, userId, feedback, notes } = req.body || {};
    const trimmedUserId = typeof userId === "string" ? userId.trim() : "";
    const allowedFeedback = ["positive", "negative", "clear"];

    if (!messageId || !trimmedUserId || !feedback) {
      return res.json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    if (!allowedFeedback.includes(feedback)) {
      return res.json({ success: false, error: "ประเภทการประเมินไม่ถูกต้อง" });
    }

    const messageObjectId = toObjectId(messageId);
    if (!messageObjectId) {
      return res.json({ success: false, error: "รหัสข้อความไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const historyColl = db.collection("chat_history");
    const feedbackColl = db.collection("chat_feedback");

    const messageDoc = await historyColl.findOne({ _id: messageObjectId });
    if (!messageDoc) {
      return res.json({
        success: false,
        error: "ไม่พบข้อความที่ต้องการประเมิน",
      });
    }

    const messageSenderId =
      messageDoc.senderId || messageDoc.userId || "";
    if (messageSenderId !== trimmedUserId) {
      return res.json({
        success: false,
        error: "ข้อความนี้ไม่ตรงกับผู้ใช้ที่กำหนด",
      });
    }

    if (messageDoc.role !== "assistant") {
      return res.json({
        success: false,
        error: "สามารถประเมินได้เฉพาะข้อความของ AI เท่านั้น",
      });
    }

    if (feedback === "clear") {
      await feedbackColl.deleteOne({ messageId: messageObjectId });
      return res.json({ success: true, feedback: null });
    }

    const sanitizedNotes =
      typeof notes === "string" ? notes.trim().substring(0, 500) : "";
    const now = new Date();

    await feedbackColl.updateOne(
      { messageId: messageObjectId },
      {
        $set: {
          messageId: messageObjectId,
          messageIdString: messageObjectId.toString(),
          userId: trimmedUserId,
          senderId: messageSenderId || null,
          senderRole: messageDoc.role || null,
          platform: messageDoc.platform || null,
          botId: messageDoc.botId || null,
          feedback,
          notes: sanitizedNotes,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

    res.json({
      success: true,
      feedback,
      notes: sanitizedNotes,
      updatedAt: now,
    });
  } catch (err) {
    console.error("Error saving chat feedback:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========== Order Management APIs ==========

// Get orders for a specific user
app.get("/admin/chat/orders/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await getUserOrders(userId);

    res.json({
      success: true,
      orders: orders,
    });
  } catch (err) {
    console.error("Error getting user orders:", err);
    res.json({ success: false, error: err.message });
  }
});

// Update order
app.put("/admin/chat/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderData, status, notes } = req.body;

    if (!ObjectId.isValid(orderId)) {
      return res.json({ success: false, error: "orderId ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const existingOrder = await coll.findOne({ _id: new ObjectId(orderId) });
    if (!existingOrder) {
      return res.json({ success: false, error: "ไม่พบออเดอร์" });
    }

    const updateDoc = {
      updatedAt: new Date(),
    };

    const hasOrderData = Object.prototype.hasOwnProperty.call(
      req.body,
      "orderData",
    );
    if (hasOrderData) {
      if (!orderData || typeof orderData !== "object") {
        return res.json({ success: false, error: "ข้อมูลออเดอร์ไม่ถูกต้อง" });
      }
      const mergedOrderData = {
        ...(existingOrder.orderData || {}),
        ...orderData,
      };
      const normalizedOrderData = {
        ...mergedOrderData,
        shippingCost: normalizeShippingCostValue(mergedOrderData.shippingCost),
        customerName: normalizeCustomerName(mergedOrderData.customerName),
      };
      const requiredFields = await getOrderRequiredFieldsSetting();
      const requirementCheck = validateOrderRequirements(
        normalizedOrderData,
        requiredFields,
      );
      if (!requirementCheck.ok) {
        return res.json({
          success: false,
          error: `ข้อมูลออเดอร์ยังไม่ครบ: ${formatMissingOrderFields(
            requirementCheck.missing,
          )}`,
        });
      }
      updateDoc.orderData = normalizedOrderData;
    }
    if (status) {
      updateDoc.status = status;
    }
    if (notes !== undefined) {
      updateDoc.notes = notes;
    }

    const result = await coll.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: updateDoc },
    );

    if (result.matchedCount === 0) {
      return res.json({ success: false, error: "ไม่พบออเดอร์" });
    }

    // ดึงข้อมูลออเดอร์ที่อัปเดตแล้ว
    const updatedOrder = await coll.findOne({ _id: new ObjectId(orderId) });

    // Emit socket event
    try {
      if (io) {
        io.emit("orderUpdated", {
          orderId,
          userId: updatedOrder.userId,
          orderData: updatedOrder.orderData,
          status: updatedOrder.status,
          notes: updatedOrder.notes,
          updatedAt: updatedOrder.updatedAt,
        });
      }
    } catch (_) { }

    res.json({
      success: true,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Error updating order:", err);
    res.json({ success: false, error: err.message });
  }
});

// Delete order
app.delete("/admin/chat/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!ObjectId.isValid(orderId)) {
      return res.json({ success: false, error: "orderId ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    // ดึงข้อมูลออเดอร์ก่อนลบ
    const order = await coll.findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return res.json({ success: false, error: "ไม่พบออเดอร์" });
    }

    const result = await coll.deleteOne({ _id: new ObjectId(orderId) });

    if (result.deletedCount === 0) {
      return res.json({ success: false, error: "ไม่สามารถลบออเดอร์ได้" });
    }

    // Emit socket event
    try {
      if (io) {
        io.emit("orderDeleted", {
          orderId,
          userId: order.userId,
        });
      }
    } catch (_) { }

    await maybeAnalyzeFollowUp(order.userId, order.platform, order.botId, {
      forceUpdate: true,
    });

    res.json({
      success: true,
      message: "ลบออเดอร์เรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get all orders (for reporting)
app.get("/admin/chat/orders", async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const query = {};
    if (status) {
      query.status = status;
    }

    const orders = await coll
      .find(query)
      .sort({ extractedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .toArray();

    const totalCount = await coll.countDocuments(query);

    res.json({
      success: true,
      orders,
      totalCount,
      hasMore: parseInt(offset) + orders.length < totalCount,
    });
  } catch (err) {
    console.error("Error getting all orders:", err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Bot Management APIs ============================

app.get("/admin/api/all-bots", requireAdmin, async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const lineBots = await db.collection("line_bots").find({}).project({ _id: 1, name: 1 }).toArray();
    const facebookBots = await db.collection("facebook_bots").find({}).project({ _id: 1, name: 1 }).toArray();

    const bots = [
      ...lineBots.map(b => ({ id: b._id, name: b.name, platform: "line" })),
      ...facebookBots.map(b => ({ id: b._id, name: b.name, platform: "facebook" }))
    ];

    res.json({ success: true, bots });
  } catch (err) {
    console.error("Error fetching all bots:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ Notification Channels APIs ============================

function normalizeNotificationChannelSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  const includeCustomer = parseOptionalBoolean(raw.includeCustomer);
  const includeItemsCount = parseOptionalBoolean(raw.includeItemsCount);
  const includeItemsDetail = parseOptionalBoolean(raw.includeItemsDetail);
  const includeAddress = parseOptionalBoolean(raw.includeAddress);
  const includePhone = parseOptionalBoolean(raw.includePhone);
  const includePaymentMethod = parseOptionalBoolean(raw.includePaymentMethod);
  const includeTotalAmount = parseOptionalBoolean(raw.includeTotalAmount);
  const includeOrderLink = parseOptionalBoolean(raw.includeOrderLink);
  const slipOkEnabled = parseOptionalBoolean(raw.slipOkEnabled);

  const slipOkApiUrl =
    typeof raw.slipOkApiUrl === "string" ? raw.slipOkApiUrl.trim() : "";
  const slipOkApiKey =
    typeof raw.slipOkApiKey === "string" ? raw.slipOkApiKey.trim() : "";

  return {
    template: "simple",
    includeCustomer: includeCustomer !== false,
    includeItemsCount: includeItemsCount !== false,
    includeItemsDetail: includeItemsDetail !== false,
    includeAddress: includeAddress !== false,
    includePhone: includePhone !== false,
    includePaymentMethod: includePaymentMethod !== false,
    includeTotalAmount: includeTotalAmount !== false,
    includeOrderLink: includeOrderLink === true,
    slipOkEnabled: slipOkEnabled === true,
    slipOkApiUrl,
    slipOkApiKey,
  };
}

const NOTIFICATION_DELIVERY_MODES = new Set(["realtime", "scheduled"]);
const NOTIFICATION_SUMMARY_TIME_REGEX = /^([0-1]?\d|2[0-3])[:.]([0-5]\d)$/;

function normalizeNotificationDeliveryMode(value) {
  if (typeof value !== "string") return "realtime";
  const normalized = value.trim().toLowerCase();
  return NOTIFICATION_DELIVERY_MODES.has(normalized)
    ? normalized
    : "realtime";
}

function normalizeNotificationChannelType(value) {
  if (typeof value !== "string") return "line_group";
  const normalized = value.trim().toLowerCase();
  return normalized || "line_group";
}

function normalizeNotificationSummaryTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(NOTIFICATION_SUMMARY_TIME_REGEX);
  if (!match) return null;
  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

function normalizeNotificationSummaryTimes(values) {
  const list = [];
  if (Array.isArray(values)) {
    list.push(...values);
  } else if (typeof values === "string") {
    list.push(...values.split(/[,\s]+/));
  }

  const normalized = [];
  const seen = new Set();
  list.forEach((value) => {
    const parsed = normalizeNotificationSummaryTime(
      typeof value === "string" ? value : String(value || ""),
    );
    if (!parsed || seen.has(parsed)) return;
    seen.add(parsed);
    normalized.push(parsed);
  });

  normalized.sort((a, b) => {
    const [ah, am] = a.split(":").map((part) => parseInt(part, 10));
    const [bh, bm] = b.split(":").map((part) => parseInt(part, 10));
    return ah * 60 + am - (bh * 60 + bm);
  });

  return normalized;
}

const NOTIFICATION_SUMMARY_INTERVAL_MS = 60 * 1000;
let notificationSummaryTimer = null;
let notificationSummaryProcessing = false;

function getSummaryTimeMinutes(time) {
  const [hoursStr, minutesStr] = time.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getSummaryMomentForTime(time, baseMoment, timezone) {
  const tz = timezone || BANGKOK_TZ;
  const [hoursStr, minutesStr] = time.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const momentBase = baseMoment ? baseMoment.clone() : moment.tz(tz);
  return momentBase
    .clone()
    .hours(hours)
    .minutes(minutes)
    .seconds(0)
    .milliseconds(0);
}

function getLatestDueSummaryMoment(nowMoment, summaryTimes, timezone) {
  if (!summaryTimes.length) return null;
  let dueMoment = null;
  summaryTimes.forEach((time) => {
    const candidate = getSummaryMomentForTime(time, nowMoment, timezone);
    if (!candidate) return;
    if (nowMoment.isSameOrAfter(candidate)) {
      dueMoment = candidate;
    }
  });
  return dueMoment;
}

function getPreviousSummaryMoment(baseMoment, summaryTimes, timezone) {
  if (!baseMoment || !summaryTimes.length) return null;
  const baseMinutes = baseMoment.hours() * 60 + baseMoment.minutes();
  let previousTime = null;
  summaryTimes.forEach((time) => {
    const minutes = getSummaryTimeMinutes(time);
    if (minutes === null) return;
    if (minutes < baseMinutes) previousTime = time;
  });

  if (previousTime) {
    return getSummaryMomentForTime(previousTime, baseMoment, timezone);
  }

  const prevDay = baseMoment.clone().subtract(1, "day");
  const lastTime = summaryTimes[summaryTimes.length - 1];
  return getSummaryMomentForTime(lastTime, prevDay, timezone);
}

function buildSummarySlotKey(momentValue) {
  if (!momentValue) return "";
  return momentValue.format("YYYY-MM-DD|HH:mm");
}

async function evaluateNotificationSummarySchedules() {
  if (notificationSummaryProcessing) {
    return;
  }

  notificationSummaryProcessing = true;
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const channels = await db
      .collection("notification_channels")
      .find({ isActive: true })
      .toArray();

    if (!channels.length) return;

    for (const channel of channels) {
      try {
        const channelType = normalizeNotificationChannelType(channel.type);
        if (channelType !== "line_group") continue;
        const deliveryMode = normalizeNotificationDeliveryMode(
          channel.deliveryMode,
        );
        if (deliveryMode !== "scheduled") continue;

        const summaryTimes = normalizeNotificationSummaryTimes(
          channel.summaryTimes || [],
        );
        if (!summaryTimes.length) continue;

        const timezone = channel.summaryTimezone || BANGKOK_TZ;
        const nowMoment = moment.tz(timezone);
        const dueMoment = getLatestDueSummaryMoment(
          nowMoment,
          summaryTimes,
          timezone,
        );
        if (!dueMoment) continue;

        const slotKey = buildSummarySlotKey(dueMoment);
        if (channel.lastSummarySlotKey === slotKey) {
          continue;
        }

        let windowStartMoment = null;
        if (channel.lastSummaryAt) {
          const lastMoment = moment.tz(channel.lastSummaryAt, timezone);
          if (lastMoment.isValid()) {
            windowStartMoment = lastMoment;
          }
        }

        if (!windowStartMoment || windowStartMoment.isAfter(dueMoment)) {
          windowStartMoment = getPreviousSummaryMoment(
            dueMoment,
            summaryTimes,
            timezone,
          );
        }

        if (!windowStartMoment || !windowStartMoment.isValid()) {
          windowStartMoment = dueMoment.clone().startOf("day");
        }

        if (windowStartMoment.isSameOrAfter(dueMoment)) {
          windowStartMoment = dueMoment.clone().startOf("day");
        }

        if (windowStartMoment.isSameOrAfter(dueMoment)) {
          continue;
        }

        const result = await notificationService.sendOrderSummary(channel, {
          windowStart: windowStartMoment.toDate(),
          windowEnd: dueMoment.toDate(),
        });

        if (result?.success) {
          await db.collection("notification_channels").updateOne(
            { _id: channel._id },
            {
              $set: {
                lastSummaryAt: dueMoment.toDate(),
                lastSummarySlotKey: slotKey,
                updatedAt: new Date(),
              },
            },
          );
        }
      } catch (channelError) {
        console.error(
          `[Notifications] Summary channel error:`,
          channelError?.message || channelError,
        );
      }
    }
  } catch (error) {
    console.error(
      "[Notifications] Summary schedule error:",
      error?.message || error,
    );
  } finally {
    notificationSummaryProcessing = false;
  }
}

async function startNotificationSummaryScheduler() {
  if (notificationSummaryTimer) {
    clearInterval(notificationSummaryTimer);
  }

  notificationSummaryTimer = setInterval(() => {
    evaluateNotificationSummarySchedules().catch((err) => {
      console.error(
        "[Notifications] Summary scheduler loop error:",
        err?.message || err,
      );
    });
  }, NOTIFICATION_SUMMARY_INTERVAL_MS);

  setTimeout(() => {
    evaluateNotificationSummarySchedules().catch((err) => {
      console.error(
        "[Notifications] Summary scheduler initial error:",
        err?.message || err,
      );
    });
  }, 5000);

  console.log(
    `[Notifications] Summary scheduler started (interval ${NOTIFICATION_SUMMARY_INTERVAL_MS / 1000}s)`,
  );
}

function normalizeNotificationSourcesInput(sources) {
  if (!Array.isArray(sources)) return [];
  const seen = new Set();
  const out = [];

  sources.forEach((source) => {
    const platform = normalizeOrderPlatform(source?.platform);
    const botId = normalizeOrderBotId(source?.botId);
    if (!botId) return;
    const key = `${platform}:${botId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ platform, botId });
  });

  return out;
}

function mapNotificationChannelDoc(doc, ctx = {}) {
  const channelId = doc?._id?.toString?.() || "";
  const senderBotId =
    (doc.senderBotId && doc.senderBotId.toString) ? doc.senderBotId.toString() : (doc.senderBotId || doc.botId || "");
  const groupId = doc.groupId || doc.lineGroupId || null;
  const groupKey = senderBotId && groupId ? `${senderBotId}:${groupId}` : null;
  const group = groupKey ? ctx.groupMap?.get(groupKey) : null;

  return {
    id: channelId,
    name: doc.name || "",
    type: doc.type || "line_group",
    senderBotId: senderBotId || null,
    senderBotName: senderBotId ? ctx.botMap?.get(senderBotId) || null : null,
    groupId,
    groupName: group?.groupName || null,
    groupStatus: group?.status || null,
    sourceType: group?.sourceType || null,
    receiveFromAllBots: doc.receiveFromAllBots === true,
    sources: normalizeNotificationSourcesInput(doc.sources || []),
    eventTypes: Array.isArray(doc.eventTypes) ? doc.eventTypes : ["new_order"],
    deliveryMode: normalizeNotificationDeliveryMode(doc.deliveryMode),
    summaryTimes: normalizeNotificationSummaryTimes(doc.summaryTimes || []),
    summaryTimezone: doc.summaryTimezone || BANGKOK_TZ,
    settings: normalizeNotificationChannelSettings(doc.settings || {}),
    isActive: doc.isActive === true,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

app.get("/admin/api/notification-channels", requireAdmin, async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const channels = await db
      .collection("notification_channels")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const senderBotIds = Array.from(
      new Set(
        channels
          .map((ch) => ch.senderBotId || ch.botId || null)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ).filter((id) => ObjectId.isValid(id));

    const botDocs = senderBotIds.length
      ? await db
        .collection("line_bots")
        .find({ _id: { $in: senderBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, displayName: 1, botName: 1 })
        .toArray()
      : [];

    const botMap = new Map();
    botDocs.forEach((bot) => {
      const label =
        bot.displayName ||
        bot.name ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`;
      botMap.set(bot._id.toString(), label);
    });

    const groupDocs = senderBotIds.length
      ? await db
        .collection("line_bot_groups")
        .find({ botId: { $in: senderBotIds } })
        .project({ botId: 1, groupId: 1, groupName: 1, status: 1, sourceType: 1 })
        .toArray()
      : [];

    const groupMap = new Map();
    groupDocs.forEach((group) => {
      if (!group?.botId || !group?.groupId) return;
      groupMap.set(`${group.botId}:${group.groupId}`, group);
    });

    res.json({
      success: true,
      channels: channels.map((doc) => mapNotificationChannelDoc(doc, { botMap, groupMap })),
    });
  } catch (err) {
    console.error("[Notifications] Error listing channels:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/admin/api/notification-channels", requireAdmin, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const senderBotId =
      typeof req.body?.senderBotId === "string" ? req.body.senderBotId.trim() : "";
    const groupId =
      typeof req.body?.groupId === "string" ? req.body.groupId.trim() : "";

    if (!name || !ObjectId.isValid(senderBotId) || !groupId) {
      return res.status(400).json({
        success: false,
        error: "กรุณากรอก name, senderBotId และ groupId ให้ถูกต้อง",
      });
    }

    const receiveFromAllBots = parseOptionalBoolean(req.body?.receiveFromAllBots);
    const sources = normalizeNotificationSourcesInput(req.body?.sources || []);
    const settings = normalizeNotificationChannelSettings(req.body?.settings || {});
    const isActive = parseOptionalBoolean(req.body?.isActive);
    const receiveAll = receiveFromAllBots !== false;
    const deliveryMode = normalizeNotificationDeliveryMode(
      req.body?.deliveryMode,
    );
    const summaryTimes = normalizeNotificationSummaryTimes(
      req.body?.summaryTimes,
    );

    if (!receiveAll && sources.length === 0) {
      return res.status(400).json({
        success: false,
        error: "กรุณาเลือกบอทต้นทางอย่างน้อย 1 รายการ หรือเลือก 'รับจากทุกบอท'",
      });
    }

    if (deliveryMode === "scheduled" && summaryTimes.length === 0) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุเวลาสรุปอย่างน้อย 1 เวลา",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    const senderBot = await db
      .collection("line_bots")
      .findOne({ _id: new ObjectId(senderBotId) }, { projection: { _id: 1 } });
    if (!senderBot) {
      return res.status(400).json({ success: false, error: "ไม่พบ LINE Bot ที่ระบุ" });
    }

    const group = await db.collection("line_bot_groups").findOne({
      botId: senderBotId,
      groupId,
      status: { $ne: "left" },
    });
    if (!group) {
      return res.status(400).json({
        success: false,
        error:
          "ยังไม่พบกลุ่มนี้ในระบบ กรุณาเชิญบอทเข้ากลุ่ม แล้วพิมพ์ 1 ข้อความในกลุ่มเพื่อให้ระบบจับกลุ่มได้",
      });
    }

    const now = new Date();
    const doc = {
      name,
      type: "line_group",
      senderBotId,
      groupId,
      receiveFromAllBots: receiveAll,
      sources: receiveAll ? [] : sources,
      eventTypes: ["new_order"],
      deliveryMode,
      summaryTimes,
      summaryTimezone: BANGKOK_TZ,
      settings,
      isActive: isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("notification_channels").insertOne(doc);
    doc._id = result.insertedId;

    res.status(201).json({ success: true, channel: mapNotificationChannelDoc(doc) });
  } catch (err) {
    console.error("[Notifications] Error creating channel:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/admin/api/notification-channels/:id", requireAdmin, async (req, res) => {
  try {
    const channelId = req.params.id;
    if (!ObjectId.isValid(channelId)) {
      return res.status(400).json({ success: false, error: "Channel ID ไม่ถูกต้อง" });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const senderBotId =
      typeof req.body?.senderBotId === "string" ? req.body.senderBotId.trim() : "";
    const groupId =
      typeof req.body?.groupId === "string" ? req.body.groupId.trim() : "";

    if (!name || !ObjectId.isValid(senderBotId) || !groupId) {
      return res.status(400).json({
        success: false,
        error: "กรุณากรอก name, senderBotId และ groupId ให้ถูกต้อง",
      });
    }

    const receiveFromAllBots = parseOptionalBoolean(req.body?.receiveFromAllBots);
    const sources = normalizeNotificationSourcesInput(req.body?.sources || []);
    const settings = normalizeNotificationChannelSettings(req.body?.settings || {});
    const isActive = parseOptionalBoolean(req.body?.isActive);
    const receiveAll = receiveFromAllBots !== false;
    const deliveryMode = normalizeNotificationDeliveryMode(
      req.body?.deliveryMode,
    );
    const summaryTimes = normalizeNotificationSummaryTimes(
      req.body?.summaryTimes,
    );

    if (!receiveAll && sources.length === 0) {
      return res.status(400).json({
        success: false,
        error: "กรุณาเลือกบอทต้นทางอย่างน้อย 1 รายการ หรือเลือก 'รับจากทุกบอท'",
      });
    }

    if (deliveryMode === "scheduled" && summaryTimes.length === 0) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุเวลาสรุปอย่างน้อย 1 เวลา",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    const existing = await db
      .collection("notification_channels")
      .findOne({ _id: new ObjectId(channelId) });
    if (!existing) {
      return res.status(404).json({ success: false, error: "ไม่พบช่องทางที่ระบุ" });
    }

    const group = await db.collection("line_bot_groups").findOne({
      botId: senderBotId,
      groupId,
      status: { $ne: "left" },
    });
    if (!group) {
      return res.status(400).json({
        success: false,
        error:
          "ยังไม่พบกลุ่มนี้ในระบบ กรุณาเชิญบอทเข้ากลุ่ม แล้วพิมพ์ 1 ข้อความในกลุ่มเพื่อให้ระบบจับกลุ่มได้",
      });
    }

    const update = {
      name,
      senderBotId,
      groupId,
      receiveFromAllBots: receiveAll,
      sources: receiveAll ? [] : sources,
      eventTypes: ["new_order"],
      deliveryMode,
      summaryTimes,
      summaryTimezone: BANGKOK_TZ,
      settings,
      updatedAt: new Date(),
    };
    if (!existing.type) {
      update.type = "line_group";
    }
    if (typeof isActive === "boolean") {
      update.isActive = isActive;
    }

    await db
      .collection("notification_channels")
      .updateOne({ _id: new ObjectId(channelId) }, { $set: update });

    const updated = await db
      .collection("notification_channels")
      .findOne({ _id: new ObjectId(channelId) });

    res.json({ success: true, channel: mapNotificationChannelDoc(updated) });
  } catch (err) {
    console.error("[Notifications] Error updating channel:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch(
  "/admin/api/notification-channels/:id/toggle",
  requireAdmin,
  async (req, res) => {
    try {
      const channelId = req.params.id;
      if (!ObjectId.isValid(channelId)) {
        return res.status(400).json({ success: false, error: "Channel ID ไม่ถูกต้อง" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("notification_channels");

      const existing = await coll.findOne({ _id: new ObjectId(channelId) });
      if (!existing) {
        return res.status(404).json({ success: false, error: "ไม่พบช่องทางที่ระบุ" });
      }

      const requested = parseOptionalBoolean(req.body?.isActive);
      const nextValue = typeof requested === "boolean" ? requested : !existing.isActive;

      await coll.updateOne(
        { _id: new ObjectId(channelId) },
        { $set: { isActive: nextValue, updatedAt: new Date() } },
      );

      res.json({ success: true, isActive: nextValue });
    } catch (err) {
      console.error("[Notifications] Error toggling channel:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.delete(
  "/admin/api/notification-channels/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const channelId = req.params.id;
      if (!ObjectId.isValid(channelId)) {
        return res.status(400).json({ success: false, error: "Channel ID ไม่ถูกต้อง" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const result = await db
        .collection("notification_channels")
        .deleteOne({ _id: new ObjectId(channelId) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, error: "ไม่พบช่องทางที่ระบุ" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[Notifications] Error deleting channel:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.post(
  "/admin/api/notification-channels/:id/test",
  requireAdmin,
  async (req, res) => {
    try {
      const channelId = req.params.id;
      if (!ObjectId.isValid(channelId)) {
        return res.status(400).json({ success: false, error: "Channel ID ไม่ถูกต้อง" });
      }

      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      const result = await notificationService.testChannel(channelId, { text });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "ทดสอบไม่สำเร็จ" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[Notifications] Error testing channel:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.get(
  "/admin/api/line-bots/:botId/groups",
  requireAdmin,
  async (req, res) => {
    try {
      const botId = typeof req.params.botId === "string" ? req.params.botId.trim() : "";
      if (!botId) {
        return res.status(400).json({ success: false, error: "botId ไม่ถูกต้อง" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const groups = await db
        .collection("line_bot_groups")
        .find({ botId, status: { $ne: "left" } })
        .sort({ lastEventAt: -1 })
        .toArray();

      res.json({
        success: true,
        groups: groups.map((group) => ({
          botId: group.botId || null,
          groupId: group.groupId || null,
          sourceType: group.sourceType || null,
          groupName: group.groupName || null,
          pictureUrl: group.pictureUrl || null,
          memberCount: group.memberCount || null,
          status: group.status || null,
          joinedAt: group.joinedAt || null,
          lastEventAt: group.lastEventAt || null,
        })),
      });
    } catch (err) {
      console.error("[LINE Group] Error listing groups:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.get("/admin/api/notification-logs", requireAdmin, async (req, res) => {
  try {
    const channelId =
      typeof req.query.channelId === "string" ? req.query.channelId.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const query = {};
    if (channelId) query.channelId = channelId;
    if (status) query.status = status;

    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    if (from || to) {
      query.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) query.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) query.createdAt.$lte = toDate;
      }
      if (!Object.keys(query.createdAt).length) {
        delete query.createdAt;
      }
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const logs = await db
      .collection("notification_logs")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      logs: logs.map((log) => ({
        id: log._id?.toString?.() || "",
        channelId: log.channelId || null,
        orderId: log.orderId || null,
        eventType: log.eventType || null,
        status: log.status || null,
        errorMessage: log.errorMessage || null,
        createdAt: log.createdAt || null,
      })),
    });
  } catch (err) {
    console.error("[Notifications] Error listing logs:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ Category Management APIs ============================

// GET: List all categories (filtered by botId and platform)
app.get("/admin/api/categories", requireAdmin, async (req, res) => {
  try {
    const { botId, platform } = req.query;
    const query = { isActive: true };

    if (botId) query.botId = botId;
    if (platform) query.platform = platform;

    const client = await connectDB();
    const db = client.db("chatbot");
    const categories = await db
      .collection("categories")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, categories });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST: Create a new category
app.post("/admin/api/categories", requireAdmin, async (req, res) => {
  try {
    const { name, description, columns, botId, platform } = req.body;

    if (!name || !columns || !Array.isArray(columns) || !botId || !platform) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    // Check for duplicate name in the same bot
    const existing = await db.collection("categories").findOne({
      name,
      botId,
      platform,
      isActive: true
    });

    if (existing) {
      return res.status(400).json({ success: false, error: "Category name already exists for this bot" });
    }

    const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Ensure columns have IDs
    const columnsWithIds = columns.map((col, index) => ({
      id: col.id || `col_${Math.random().toString(36).substr(2, 9)}`,
      index: index,
      name: col.name,
      type: col.type || "text",
    }));

    const newCategory = {
      categoryId,
      botId,
      platform,
      name,
      description,
      columns: columnsWithIds,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("categories").insertOne(newCategory);

    // Create empty table for this category
    await db.collection("category_tables").insertOne({
      categoryId,
      botId,
      platform,
      data: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({ success: true, category: newCategory });
  } catch (err) {
    console.error("Error creating category:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Update category
app.put("/admin/api/categories/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, columns } = req.body;

    const client = await connectDB();
    const db = client.collection("chatbot");

    // Process columns: preserve IDs for existing columns, generate for new ones
    const processedColumns = (columns || []).map((col, index) => ({
      id: col.id || new ObjectId().toString(),
      index: index,
      name: col.name,
      type: col.type || "text"
    }));

    const updateDoc = {
      updatedAt: new Date()
    };
    if (name) updateDoc.name = name;
    if (description !== undefined) updateDoc.description = description;
    if (columns) updateDoc.columns = processedColumns;

    const result = await db.collection("categories").findOneAndUpdate(
      { categoryId },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: "Category not found" });
    }

    res.json({ success: true, category: result });
  } catch (err) {
    console.error("Error updating category:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Delete category
app.delete("/admin/api/categories/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");

    // Delete category
    await db.collection("categories").deleteOne({ categoryId });

    // Delete associated table data
    await db.collection("category_tables").deleteOne({ categoryId });

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get category data
app.get("/admin/api/categories/:categoryId/data", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");

    const table = await db.collection("category_tables").findOne({ categoryId });

    if (!table) {
      return res.json({ success: true, data: [] });
    }

    res.json({ success: true, data: table.data });
  } catch (err) {
    console.error("Error getting category data:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Add row
app.post("/admin/api/categories/:categoryId/data", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { values } = req.body; // values should be keyed by columnId

    const client = await connectDB();
    const db = client.db("chatbot");

    const newRow = {
      rowId: new ObjectId().toString(),
      values: values || {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection("category_tables").updateOne(
      { categoryId },
      {
        $push: { data: newRow },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "Category table not found" });
    }

    res.json({ success: true, row: newRow });
  } catch (err) {
    console.error("Error adding row:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Update row
app.put("/admin/api/categories/:categoryId/data/:rowId", async (req, res) => {
  try {
    const { categoryId, rowId } = req.params;
    const { values } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");

    const result = await db.collection("category_tables").updateOne(
      { categoryId, "data.rowId": rowId },
      {
        $set: {
          "data.$.values": values,
          "data.$.updatedAt": new Date(),
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "Row not found" });
    }

    res.json({ success: true, message: "Row updated successfully" });
  } catch (err) {
    console.error("Error updating row:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Delete row
app.delete("/admin/api/categories/:categoryId/data/:rowId", async (req, res) => {
  try {
    const { categoryId, rowId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");

    const result = await db.collection("category_tables").updateOne(
      { categoryId },
      {
        $pull: { data: { rowId: rowId } },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "Category table not found" });
    }

    res.json({ success: true, message: "Row deleted successfully" });
  } catch (err) {
    console.error("Error deleting row:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Import Excel
app.post("/admin/api/categories/:categoryId/import-excel", upload.single("file"), async (req, res) => {
  try {
    const { categoryId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    // Get category to map columns
    const category = await db.collection("categories").findOne({ categoryId });
    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found" });
    }

    // Create a map of Column Name -> Column ID
    const columnMap = {};
    category.columns.forEach(col => {
      columnMap[col.name.trim()] = col.id;
    });

    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const newRows = rows.map(row => {
      const values = {};
      Object.keys(row).forEach(header => {
        const colId = columnMap[header.trim()];
        if (colId) {
          values[colId] = String(row[header]);
        }
      });
      return {
        rowId: new ObjectId().toString(),
        values,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    if (newRows.length > 0) {
      await db.collection("category_tables").updateOne(
        { categoryId },
        {
          $push: { data: { $each: newRows } },
          $set: { updatedAt: new Date() }
        }
      );
    }

    res.json({ success: true, importedCount: newRows.length });
  } catch (err) {
    console.error("Error importing excel:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Export Excel
app.get("/admin/api/categories/:categoryId/export-excel", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");

    const category = await db.collection("categories").findOne({ categoryId });
    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found" });
    }

    const table = await db.collection("category_tables").findOne({ categoryId });
    const data = table ? table.data : [];

    // Map data back to Column Names
    const exportData = data.map(row => {
      const rowObj = {};
      category.columns.forEach(col => {
        rowObj[col.name] = row.values[col.id] || "";
      });
      return rowObj;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(category.name)}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting excel:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ AI Tools for Categories ============================

async function getCategories(db, botId, platform) {
  const query = { isActive: true };
  if (botId) query.botId = botId;
  if (platform) query.platform = platform;

  const categories = await db.collection('categories')
    .find(query)
    .project({ name: 1, description: 1 })
    .toArray();

  // Return both name and description for better AI context
  return {
    categories: categories.map(c => ({
      name: c.name,
      description: c.description || ""
    }))
  };
}

async function searchItemByCategory(db, categoryName, keyword, botId, platform) {
  const query = { name: categoryName, isActive: true };
  if (botId) query.botId = botId;
  if (platform) query.platform = platform;

  const categoryDoc = await db.collection('categories').findOne(query);
  if (!categoryDoc) return { error: "Category not found" };

  const firstColId = categoryDoc.columns[0].id;
  const tableDoc = await db.collection('category_tables').findOne({ categoryId: categoryDoc.categoryId });
  if (!tableDoc) return { data: [] };

  const results = tableDoc.data.filter(row => {
    const val = row.values[firstColId];
    return val && String(val).toLowerCase().includes(keyword.toLowerCase());
  });

  // Map results to column names for AI readability
  const mappedResults = results.slice(0, 20).map(row => {
    const rowObj = {};
    categoryDoc.columns.forEach(col => {
      rowObj[col.name] = row.values[col.id] || "";
    });
    return rowObj;
  });

  return { data: mappedResults };
}

async function searchItemBroad(db, categoryName, keyword, botId, platform) {
  const query = { name: categoryName, isActive: true };
  if (botId) query.botId = botId;
  if (platform) query.platform = platform;

  const categoryDoc = await db.collection('categories').findOne(query);
  if (!categoryDoc) return { error: "Category not found" };

  const tableDoc = await db.collection('category_tables').findOne({ categoryId: categoryDoc.categoryId });
  if (!tableDoc) return { data: [] };

  const results = tableDoc.data.filter(row => {
    return Object.values(row.values).some(val =>
      val && String(val).toLowerCase().includes(keyword.toLowerCase())
    );
  });

  // Map results to column names for AI readability
  const mappedResults = results.slice(0, 20).map(row => {
    const rowObj = {};
    categoryDoc.columns.forEach(col => {
      rowObj[col.name] = row.values[col.id] || "";
    });
    return rowObj;
  });

  return { data: mappedResults };
}

// Get all available tags in the system
app.get("/admin/chat/available-tags", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const tagsColl = db.collection("user_tags");

    // ดึงแท็กทั้งหมดจากผู้ใช้ทั้งหมด
    const allUserTags = await tagsColl.find({}).toArray();

    // รวมแท็กทั้งหมดและนับจำนวนการใช้งาน
    const tagCount = {};
    allUserTags.forEach((userTag) => {
      if (userTag.tags && Array.isArray(userTag.tags)) {
        userTag.tags.forEach((tag) => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      }
    });

    // แปลงเป็น array และเรียงตามความนิยม
    const availableTags = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // เอาแค่ 50 tags ที่นิยมสุด

    res.json({ success: true, tags: availableTags });
  } catch (err) {
    console.error("Error getting available tags:", err);
    res.json({ success: false, error: err.message });
  }
});

// Toggle purchase status
app.post("/admin/chat/purchase-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { hasPurchased } = req.body;

    if (typeof hasPurchased !== "boolean") {
      return res.json({
        success: false,
        error: "hasPurchased ต้องเป็น boolean",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const statusColl = db.collection("user_purchase_status");

    await statusColl.updateOne(
      { userId },
      {
        $set: {
          hasPurchased,
          updatedAt: new Date(),
          updatedBy: "admin",
        },
      },
      { upsert: true },
    );

    // Emit to socket clients
    io.emit("userPurchaseStatusUpdated", { userId, hasPurchased });

    res.json({ success: true, hasPurchased });
  } catch (err) {
    console.error("Error setting purchase status:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get total unread count for all users
app.get("/admin/chat/unread-count", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    const result = await coll
      .aggregate([
        {
          $group: {
            _id: null,
            totalUnread: { $sum: "$unreadCount" },
          },
        },
      ])
      .toArray();

    const totalUnread = result.length > 0 ? result[0].totalUnread : 0;

    res.json({ success: true, totalUnread });
  } catch (err) {
    console.error("Error getting unread count:", err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Settings API Endpoints ============================

// Get all settings
app.get("/api/settings", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    const settings = await coll.find({}).toArray();
    const settingsObj = {};

    settings.forEach((setting) => {
      if (!setting || typeof setting.key !== "string") return;
      if (typeof setting.value === "undefined") return;
      settingsObj[setting.key] = setting.value;
    });

    // Set default values if not exists
    const defaultSettings = {
      chatDelaySeconds: 0,
      maxQueueMessages: 10,
      enableMessageMerging: true,
      showTokenUsage: false,
      showDebugInfo: false,
      audioAttachmentResponse: DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
      textModel: "gpt-5",
      visionModel: "gpt-5",
      maxImagesPerMessage: 3,
      defaultInstruction: "",
      aiEnabled: true,
      enableChatHistory: true,
      enableAdminNotifications: true,
      systemMode: "production",
      aiHistoryLimit: 20,
      // การตั้งค่าการกรองข้อความ
      enableMessageFiltering: true,
      hiddenWords: "",
      replacementText: "[ข้อความถูกซ่อน]",
      enableStrictFiltering: true,
      enableFollowUpAnalysis: true,
      followUpShowInChat: true,
      followUpShowInDashboard: true,
      orderRequiredFields: ORDER_REQUIRED_FIELDS_DEFAULT,
    };

    // Merge with existing settings
    const finalSettings = { ...defaultSettings, ...settingsObj };
    finalSettings.orderRequiredFields = normalizeOrderRequiredFields(
      finalSettings.orderRequiredFields,
    );

    res.json(finalSettings);
  } catch (err) {
    console.error("Error getting settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save chat settings
app.post("/api/settings/chat", async (req, res) => {
  try {
    const {
      chatDelaySeconds,
      maxQueueMessages,
      enableMessageMerging,
      showTokenUsage,
      enableFollowUpAnalysis,
      followUpShowInChat,
      followUpShowInDashboard,
      audioAttachmentResponse,
    } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    // Validate input
    if (chatDelaySeconds < 0 || chatDelaySeconds > 60) {
      return res.status(400).json({
        success: false,
        error: "ระยะเวลาดีเลย์ต้องอยู่ระหว่าง 0-60 วินาที",
      });
    }

    if (maxQueueMessages < 1 || maxQueueMessages > 20) {
      return res.status(400).json({
        success: false,
        error: "จำนวนข้อความในคิวต้องอยู่ระหว่าง 1-20",
      });
    }

    // Save settings
    await coll.updateOne(
      { key: "chatDelaySeconds" },
      { $set: { value: chatDelaySeconds } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "maxQueueMessages" },
      { $set: { value: maxQueueMessages } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableMessageMerging" },
      { $set: { value: enableMessageMerging } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "showTokenUsage" },
      { $set: { value: showTokenUsage } },
      { upsert: true },
    );

    const sanitizedAudioResponse =
      typeof audioAttachmentResponse === "string"
        ? audioAttachmentResponse.trim()
        : "";
    const finalAudioResponse =
      sanitizedAudioResponse || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;

    if (finalAudioResponse.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "ข้อความตอบกลับไฟล์เสียงต้องไม่เกิน 1000 ตัวอักษร",
      });
    }

    await coll.updateOne(
      { key: "audioAttachmentResponse" },
      { $set: { value: finalAudioResponse } },
      { upsert: true },
    );

    const followUpUpdates = [
      {
        key: "enableFollowUpAnalysis",
        value: parseOptionalBoolean(enableFollowUpAnalysis),
      },
      { key: "followUpShowInChat", value: parseOptionalBoolean(followUpShowInChat) },
      {
        key: "followUpShowInDashboard",
        value: parseOptionalBoolean(followUpShowInDashboard),
      },
    ];

    let followUpConfigTouched = false;
    for (const update of followUpUpdates) {
      if (typeof update.value !== "boolean") continue;
      followUpConfigTouched = true;
      await coll.updateOne(
        { key: update.key },
        { $set: { value: update.value } },
        { upsert: true },
      );
    }

    if (followUpConfigTouched) {
      resetFollowUpConfigCache();
    }

    res.json({ success: true, message: "บันทึกการตั้งค่าแชทเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error saving chat settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save AI settings
app.post("/api/settings/ai", async (req, res) => {
  try {
    const { textModel, visionModel, maxImagesPerMessage, defaultInstruction } =
      req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    // Validate input
    const validModels = [
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-chat-latest",
      "gpt-5-nano",
      "gpt-4.1",
      "gpt-4.1-mini",
      "o3",
    ];

    if (!validModels.includes(textModel)) {
      return res
        .status(400)
        .json({ success: false, error: "โมเดลข้อความไม่ถูกต้อง" });
    }

    if (!validModels.includes(visionModel)) {
      return res
        .status(400)
        .json({ success: false, error: "โมเดลรูปภาพไม่ถูกต้อง" });
    }

    if (maxImagesPerMessage < 1 || maxImagesPerMessage > 10) {
      return res
        .status(400)
        .json({ success: false, error: "จำนวนรูปภาพต้องอยู่ระหว่าง 1-10" });
    }

    // Save settings
    await coll.updateOne(
      { key: "textModel" },
      { $set: { value: textModel } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "visionModel" },
      { $set: { value: visionModel } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "maxImagesPerMessage" },
      { $set: { value: maxImagesPerMessage } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "defaultInstruction" },
      { $set: { value: defaultInstruction || "" } },
      { upsert: true },
    );

    res.json({ success: true, message: "บันทึกการตั้งค่า AI เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error saving AI settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save system settings
app.post("/api/settings/system", async (req, res) => {
  try {
    const {
      aiEnabled,
      enableChatHistory,
      enableAdminNotifications,
      showDebugInfo,
      systemMode,
      aiHistoryLimit,
      orderRequiredFields,
    } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    // Validate input
    const validSystemModes = ["production", "development", "maintenance"];

    if (!validSystemModes.includes(systemMode)) {
      return res
        .status(400)
        .json({ success: false, error: "โหมดระบบไม่ถูกต้อง" });
    }

    const parsedHistoryLimit =
      typeof aiHistoryLimit === "number"
        ? aiHistoryLimit
        : parseInt(aiHistoryLimit, 10);
    if (
      Number.isNaN(parsedHistoryLimit) ||
      parsedHistoryLimit < 1 ||
      parsedHistoryLimit > 100
    ) {
      return res.status(400).json({
        success: false,
        error: "จำนวนประวัติแชทต้องอยู่ระหว่าง 1-100 ข้อความ",
      });
    }

    const hasOrderRequiredFields = Object.prototype.hasOwnProperty.call(
      req.body,
      "orderRequiredFields",
    );
    let normalizedOrderRequiredFields = null;
    if (hasOrderRequiredFields) {
      if (!orderRequiredFields || typeof orderRequiredFields !== "object") {
        return res.status(400).json({
          success: false,
          error: "เงื่อนไขขั้นต่ำของออเดอร์ไม่ถูกต้อง",
        });
      }
      normalizedOrderRequiredFields = normalizeOrderRequiredFields(
        orderRequiredFields,
      );
    }

    // Save settings
    const aiEnabledValue = parseOptionalBoolean(aiEnabled);
    const enableChatHistoryValue = parseOptionalBoolean(enableChatHistory);
    const enableAdminNotificationsValue = parseOptionalBoolean(
      enableAdminNotifications,
    );
    const showDebugInfoValue = parseOptionalBoolean(showDebugInfo);

    if (
      typeof aiEnabledValue !== "boolean" ||
      typeof enableChatHistoryValue !== "boolean" ||
      typeof enableAdminNotificationsValue !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        error: "ค่าการตั้งค่าระบบบางรายการไม่ถูกต้อง",
      });
    }

    await coll.updateOne(
      { key: "aiEnabled" },
      { $set: { value: aiEnabledValue } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableChatHistory" },
      { $set: { value: enableChatHistoryValue } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableAdminNotifications" },
      { $set: { value: enableAdminNotificationsValue } },
      { upsert: true },
    );

    if (typeof showDebugInfoValue === "boolean") {
      await coll.updateOne(
        { key: "showDebugInfo" },
        { $set: { value: showDebugInfoValue } },
        { upsert: true },
      );
    }

    await coll.updateOne(
      { key: "systemMode" },
      { $set: { value: systemMode } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "aiHistoryLimit" },
      { $set: { value: parsedHistoryLimit } },
      { upsert: true },
    );

    if (normalizedOrderRequiredFields) {
      await coll.updateOne(
        { key: "orderRequiredFields" },
        { $set: { value: normalizedOrderRequiredFields } },
        { upsert: true },
      );
    }

    res.json({ success: true, message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error saving system settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API endpoint สำหรับบันทึกการตั้งค่าการกรอง
app.post("/api/settings/filter", async (req, res) => {
  try {
    const {
      enableMessageFiltering,
      hiddenWords,
      replacementText,
      enableStrictFiltering,
    } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    await coll.updateOne(
      { key: "enableMessageFiltering" },
      { $set: { value: enableMessageFiltering } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "hiddenWords" },
      { $set: { value: hiddenWords } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "replacementText" },
      { $set: { value: replacementText } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableStrictFiltering" },
      { $set: { value: enableStrictFiltering } },
      { upsert: true },
    );

    res.json({
      success: true,
      message: "บันทึกการตั้งค่าการกรองเรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("Error saving filter settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ OpenAI API Key Management ============================

// Model pricing (USD per 1M tokens) - OpenAI Standard tier prices (Dec 2024)
const OPENAI_MODEL_PRICING = {
  // GPT-5 series
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5.1": { input: 1.25, output: 10.0 },
  "gpt-5.2": { input: 1.75, output: 14.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5-pro": { input: 15.0, output: 120.0 },
  // GPT-4.1 series
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  // GPT-4o series
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // O-series reasoning models
  "o1": { input: 15.0, output: 60.0 },
  "o1-mini": { input: 1.1, output: 4.4 },
  "o1-pro": { input: 150.0, output: 600.0 },
  "o3": { input: 2.0, output: 8.0 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o3-pro": { input: 20.0, output: 80.0 },
  "o4-mini": { input: 1.1, output: 4.4 },
  // Legacy models
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Default fallback
  "default": { input: 1.0, output: 4.0 },
};

// Helper: Calculate estimated cost
function calculateOpenAICost(model, promptTokens, completionTokens) {
  const pricing = OPENAI_MODEL_PRICING[model] || OPENAI_MODEL_PRICING["default"];
  const inputCost = (promptTokens / 1000000) * pricing.input;
  const outputCost = (completionTokens / 1000000) * pricing.output;
  return inputCost + outputCost;
}

// Helper: Mask API key for display
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 10) return "sk-***";
  return apiKey.substring(0, 7) + "..." + apiKey.substring(apiKey.length - 4);
}

// Helper: Get API key for a bot (with fallback to default key or env var)
async function getOpenAIApiKeyForBot(botId, platform) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    // First, check if bot has a specific key assigned
    let bot = null;
    if (botId) {
      const collection = platform === "facebook" ? "facebook_bots" : "line_bots";
      bot = await db.collection(collection).findOne({
        _id: ObjectId.isValid(botId) ? new ObjectId(botId) : botId
      });
    }

    if (bot && bot.openaiApiKeyId) {
      const keyDoc = await db.collection("openai_api_keys").findOne({
        _id: new ObjectId(bot.openaiApiKeyId),
        isActive: true
      });
      if (keyDoc && keyDoc.apiKey) {
        return { apiKey: keyDoc.apiKey, keyId: keyDoc._id.toString(), keyName: keyDoc.name };
      }
    }

    // Fallback to default key
    const defaultKey = await db.collection("openai_api_keys").findOne({
      isDefault: true,
      isActive: true
    });
    if (defaultKey && defaultKey.apiKey) {
      return { apiKey: defaultKey.apiKey, keyId: defaultKey._id.toString(), keyName: defaultKey.name };
    }

    // Fallback to any active key
    const anyKey = await db.collection("openai_api_keys").findOne({ isActive: true });
    if (anyKey && anyKey.apiKey) {
      return { apiKey: anyKey.apiKey, keyId: anyKey._id.toString(), keyName: anyKey.name };
    }

    // Final fallback to environment variable
    if (OPENAI_API_KEY) {
      return { apiKey: OPENAI_API_KEY, keyId: null, keyName: "Environment Variable" };
    }

    return { apiKey: null, keyId: null, keyName: null };
  } catch (err) {
    console.error("[OpenAI Keys] Error getting API key for bot:", err);
    return { apiKey: OPENAI_API_KEY, keyId: null, keyName: "Environment Variable (fallback)" };
  }
}

// Helper: Log OpenAI API usage
async function logOpenAIUsage(data) {
  try {
    const {
      apiKeyId, botId, platform, model,
      promptTokens, completionTokens, totalTokens,
      functionName
    } = data;

    const client = await connectDB();
    const db = client.db("chatbot");

    const estimatedCost = calculateOpenAICost(model, promptTokens || 0, completionTokens || 0);

    await db.collection("openai_usage_logs").insertOne({
      apiKeyId: apiKeyId ? new ObjectId(apiKeyId) : null,
      botId: botId || null,
      platform: platform || null,
      model: model || "unknown",
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens: totalTokens || 0,
      estimatedCost,
      functionName: functionName || null,
      timestamp: new Date(),
    });

    // Update usage count on API key
    if (apiKeyId) {
      await db.collection("openai_api_keys").updateOne(
        { _id: new ObjectId(apiKeyId) },
        {
          $inc: { usageCount: 1 },
          $set: { lastUsedAt: new Date() }
        }
      );
    }
  } catch (err) {
    console.error("[OpenAI Usage] Error logging usage:", err);
  }
}

// GET: List all API keys (masked)
app.get("/api/openai-keys", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const keys = await db.collection("openai_api_keys")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const maskedKeys = keys.map(key => ({
      id: key._id.toString(),
      name: key.name,
      maskedKey: key.maskedKey || maskApiKey(key.apiKey),
      isActive: key.isActive !== false,
      isDefault: key.isDefault === true,
      usageCount: key.usageCount || 0,
      lastUsedAt: key.lastUsedAt || null,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));

    res.json({ success: true, keys: maskedKeys });
  } catch (err) {
    console.error("[OpenAI Keys] Error listing keys:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST: Create new API key
app.post("/api/openai-keys", async (req, res) => {
  try {
    const { name, apiKey, isDefault } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อ API Key" });
    }
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ success: false, error: "กรุณาระบุ API Key" });
    }
    if (!apiKey.startsWith("sk-")) {
      return res.status(400).json({ success: false, error: "API Key ต้องขึ้นต้นด้วย 'sk-'" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("openai_api_keys");

    // If setting as default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    const now = new Date();
    const keyDoc = {
      name: name.trim(),
      apiKey: apiKey.trim(),
      maskedKey: maskApiKey(apiKey.trim()),
      isActive: true,
      isDefault: isDefault === true,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await coll.insertOne(keyDoc);

    res.json({
      success: true,
      key: {
        id: result.insertedId.toString(),
        name: keyDoc.name,
        maskedKey: keyDoc.maskedKey,
        isActive: keyDoc.isActive,
        isDefault: keyDoc.isDefault,
        createdAt: keyDoc.createdAt,
      }
    });
  } catch (err) {
    console.error("[OpenAI Keys] Error creating key:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT: Update API key
app.put("/api/openai-keys/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, apiKey, isActive, isDefault } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "รหัส API Key ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("openai_api_keys");

    const existing = await coll.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, error: "ไม่พบ API Key" });
    }

    const updateData = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name.trim();
    if (isActive !== undefined) updateData.isActive = isActive;
    if (apiKey && apiKey.trim() && apiKey !== existing.maskedKey) {
      if (!apiKey.startsWith("sk-")) {
        return res.status(400).json({ success: false, error: "API Key ต้องขึ้นต้นด้วย 'sk-'" });
      }
      updateData.apiKey = apiKey.trim();
      updateData.maskedKey = maskApiKey(apiKey.trim());
    }

    if (isDefault === true) {
      await coll.updateMany({ _id: { $ne: new ObjectId(id) } }, { $set: { isDefault: false } });
      updateData.isDefault = true;
    } else if (isDefault === false) {
      updateData.isDefault = false;
    }

    await coll.updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    const updated = await coll.findOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      key: {
        id: updated._id.toString(),
        name: updated.name,
        maskedKey: updated.maskedKey,
        isActive: updated.isActive,
        isDefault: updated.isDefault,
        usageCount: updated.usageCount,
        lastUsedAt: updated.lastUsedAt,
        updatedAt: updated.updatedAt,
      }
    });
  } catch (err) {
    console.error("[OpenAI Keys] Error updating key:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE: Delete API key
app.delete("/api/openai-keys/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "รหัส API Key ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("openai_api_keys");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ API Key" });
    }

    // Remove references from bots
    await db.collection("line_bots").updateMany(
      { openaiApiKeyId: id },
      { $unset: { openaiApiKeyId: "" } }
    );
    await db.collection("facebook_bots").updateMany(
      { openaiApiKeyId: id },
      { $unset: { openaiApiKeyId: "" } }
    );

    res.json({ success: true, message: "ลบ API Key เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("[OpenAI Keys] Error deleting key:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST: Test API key
app.post("/api/openai-keys/test", async (req, res) => {
  try {
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey) {
      return res.status(400).json({ success: false, error: "กรุณาระบุ API Key" });
    }
    if (!apiKey.startsWith("sk-")) {
      return res.status(400).json({ success: false, error: "API Key ต้องขึ้นต้นด้วย 'sk-'" });
    }

    try {
      const testOpenai = new OpenAI({ apiKey });
      const response = await testOpenai.models.list();
      res.json({
        success: true,
        message: `API Key ใช้งานได้! พบ ${response.data?.length || 0} โมเดล`,
        modelsCount: response.data?.length || 0,
      });
    } catch (apiError) {
      res.status(400).json({
        success: false,
        error: `API Key ไม่ถูกต้องหรือหมดอายุ: ${apiError.message}`,
      });
    }
  } catch (err) {
    console.error("[OpenAI Keys] Error testing raw key:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/openai-keys/:id/test", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "รหัส API Key ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const keyDoc = await db.collection("openai_api_keys").findOne({ _id: new ObjectId(id) });

    if (!keyDoc) {
      return res.status(404).json({ success: false, error: "ไม่พบ API Key" });
    }

    try {
      const testOpenai = new OpenAI({ apiKey: keyDoc.apiKey });
      const response = await testOpenai.models.list();

      res.json({
        success: true,
        message: `API Key ใช้งานได้! พบ ${response.data?.length || 0} โมเดล`,
        modelsCount: response.data?.length || 0,
      });
    } catch (apiError) {
      res.status(400).json({
        success: false,
        error: `API Key ไม่ถูกต้องหรือหมดอายุ: ${apiError.message}`
      });
    }
  } catch (err) {
    console.error("[OpenAI Keys] Error testing key:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET: Usage statistics summary
function parseApiUsageDateRange(startDateStr, endDateStr) {
  const now = getBangkokMoment();
  let startMoment = startDateStr
    ? moment(startDateStr).tz(BANGKOK_TZ)
    : null;
  let endMoment = endDateStr ? moment(endDateStr).tz(BANGKOK_TZ) : null;

  if (!startMoment || !startMoment.isValid()) {
    startMoment = null;
  }
  if (!endMoment || !endMoment.isValid()) {
    endMoment = null;
  }

  if (!startMoment && endMoment) {
    startMoment = endMoment.clone();
  } else if (!endMoment && startMoment) {
    endMoment = startMoment.clone();
  }

  if (!startMoment && !endMoment) {
    startMoment = now.clone().subtract(7, "days");
    endMoment = now.clone();
  }

  startMoment = startMoment.startOf("day");
  endMoment = endMoment.endOf("day");
  if (endMoment.isBefore(startMoment)) {
    endMoment = startMoment.clone().endOf("day");
  }

  return { startMoment, endMoment };
}

app.get("/api/openai-usage/summary", async (req, res) => {
  try {
    const { startDate, endDate, keyId, botId, platform } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");

    const { startMoment, endMoment } = parseApiUsageDateRange(
      startDate,
      endDate,
    );
    const match = {
      timestamp: { $gte: startMoment.toDate(), $lte: endMoment.toDate() },
    };

    if (keyId && ObjectId.isValid(keyId)) {
      match.apiKeyId = new ObjectId(keyId);
    }
    if (botId) match.botId = botId;
    if (platform) match.platform = platform;

    const [totals, byModel, byBot, byKey, daily] = await Promise.all([
      // Overall totals
      db.collection("openai_usage_logs").aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalPromptTokens: { $sum: "$promptTokens" },
            totalCompletionTokens: { $sum: "$completionTokens" },
            totalTokens: { $sum: "$totalTokens" },
            totalCost: { $sum: "$estimatedCost" },
          }
        }
      ]).toArray(),

      // By model
      db.collection("openai_usage_logs").aggregate([
        { $match: match },
        {
          $group: {
            _id: "$model",
            calls: { $sum: 1 },
            tokens: { $sum: "$totalTokens" },
            cost: { $sum: "$estimatedCost" },
          }
        },
        { $sort: { cost: -1 } },
        { $limit: 10 }
      ]).toArray(),

      // By bot
      db.collection("openai_usage_logs").aggregate([
        {
          $match: {
            ...match,
            ...(match.botId ? {} : { botId: { $ne: null } }),
          },
        },
        {
          $group: {
            _id: { botId: "$botId", platform: "$platform" },
            calls: { $sum: 1 },
            tokens: { $sum: "$totalTokens" },
            cost: { $sum: "$estimatedCost" },
          }
        },
        { $sort: { cost: -1 } },
        { $limit: 20 }
      ]).toArray(),

      // By key
      db.collection("openai_usage_logs").aggregate([
        {
          $match: {
            ...match,
            ...(match.apiKeyId ? {} : { apiKeyId: { $ne: null } }),
          },
        },
        {
          $group: {
            _id: "$apiKeyId",
            calls: { $sum: 1 },
            tokens: { $sum: "$totalTokens" },
            cost: { $sum: "$estimatedCost" },
          }
        },
        { $sort: { cost: -1 } }
      ]).toArray(),

      // Daily usage (last 30 days)
      db.collection("openai_usage_logs").aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$timestamp",
                timezone: BANGKOK_TZ,
              },
            },
            calls: { $sum: 1 },
            tokens: { $sum: "$totalTokens" },
            cost: { $sum: "$estimatedCost" },
          }
        },
        { $sort: { _id: 1 } }
      ]).toArray(),
    ]);

    // Enrich bot data with names
    const botIds = byBot.map(b => b._id.botId).filter(Boolean);
    const validBotIds = botIds.filter(id => ObjectId.isValid(id));
    const [lineBots, facebookBots] = await Promise.all([
      validBotIds.length > 0
        ? db.collection("line_bots").find({ _id: { $in: validBotIds.map(id => new ObjectId(id)) } }).toArray()
        : [],
      validBotIds.length > 0
        ? db.collection("facebook_bots").find({ _id: { $in: validBotIds.map(id => new ObjectId(id)) } }).toArray()
        : [],
    ]);

    const botNameMap = {};
    [...lineBots, ...facebookBots].forEach(b => {
      botNameMap[b._id.toString()] = b.name || b.pageName || b._id.toString();
    });

    // Enrich key data with names
    const keyIds = byKey.map(k => k._id).filter(id => id && ObjectId.isValid(id));
    const keys = keyIds.length > 0
      ? await db.collection("openai_api_keys").find({ _id: { $in: keyIds } }).toArray()
      : [];

    const keyNameMap = {};
    keys.forEach(k => {
      keyNameMap[k._id.toString()] = k.name;
    });

    const summary = totals[0] || {
      totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCost: 0
    };

    res.json({
      success: true,
      summary: {
        totalCalls: summary.totalCalls,
        totalPromptTokens: summary.totalPromptTokens,
        totalCompletionTokens: summary.totalCompletionTokens,
        totalTokens: summary.totalTokens,
        totalCostUSD: summary.totalCost,
        totalCostTHB: summary.totalCost * 33, // Approximate USD to THB (33 THB/USD)
      },
      byModel: byModel.map(m => ({
        model: m._id || "unknown",
        calls: m.calls,
        tokens: m.tokens,
        costUSD: m.cost,
      })),
      byBot: byBot.map(b => ({
        botId: b._id.botId,
        platform: b._id.platform,
        name: botNameMap[b._id.botId] || b._id.botId,
        calls: b.calls,
        tokens: b.tokens,
        costUSD: b.cost,
      })),
      byKey: byKey.map(k => ({
        keyId: k._id?.toString(),
        name: keyNameMap[k._id?.toString()] || "Unknown Key",
        calls: k.calls,
        tokens: k.tokens,
        costUSD: k.cost,
      })),
      daily,
    });
  } catch (err) {
    console.error("[OpenAI Usage] Error getting summary:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET: Detailed usage logs
app.get("/api/openai-usage", async (req, res) => {
  try {
    const { startDate, endDate, keyId, botId, platform, page = 1, limit = 50 } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");

    const { startMoment, endMoment } = parseApiUsageDateRange(
      startDate,
      endDate,
    );
    const match = {
      timestamp: { $gte: startMoment.toDate(), $lte: endMoment.toDate() },
    };
    if (keyId && ObjectId.isValid(keyId)) {
      match.apiKeyId = new ObjectId(keyId);
    }
    if (botId) match.botId = botId;
    if (platform) match.platform = platform;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      db.collection("openai_usage_logs")
        .find(match)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("openai_usage_logs").countDocuments(match),
    ]);

    res.json({
      success: true,
      logs: logs.map(l => ({
        id: l._id.toString(),
        apiKeyId: l.apiKeyId?.toString(),
        botId: l.botId,
        platform: l.platform,
        model: l.model,
        promptTokens: l.promptTokens,
        completionTokens: l.completionTokens,
        totalTokens: l.totalTokens,
        estimatedCostUSD: l.estimatedCost,
        functionName: l.functionName,
        timestamp: l.timestamp,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[OpenAI Usage] Error getting logs:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET: Drill-down usage by specific Bot
app.get("/api/openai-usage/by-bot/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const { startDate, endDate } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");

    const { startMoment, endMoment } = parseApiUsageDateRange(
      startDate,
      endDate,
    );
    const match = {
      botId,
      timestamp: { $gte: startMoment.toDate(), $lte: endMoment.toDate() },
    };

    // Get usage breakdown by model
    const byModel = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: "$model",
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          promptTokens: { $sum: "$promptTokens" },
          completionTokens: { $sum: "$completionTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    // Get usage breakdown by API key
    const byKey = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: "$apiKeyId",
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    // Get daily trend
    const byDay = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$timestamp",
              timezone: BANGKOK_TZ,
            },
          },
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]).toArray();

    // Get recent logs
    const recentLogs = await db.collection("openai_usage_logs")
      .find(match)
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    // Get totals
    const totals = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCost: { $sum: "$estimatedCost" }
        }
      }
    ]).toArray();

    // Get API key names
    const keyIds = byKey.map(k => k._id).filter(id => id);
    const keyDocs = keyIds.length > 0 ? await db.collection("openai_api_keys")
      .find({ _id: { $in: keyIds.map(id => new ObjectId(id)) } })
      .toArray() : [];
    const keyMap = Object.fromEntries(keyDocs.map(k => [k._id.toString(), k.name]));

    res.json({
      success: true,
      botId,
      totals: totals[0] || { totalCalls: 0, totalTokens: 0, totalCost: 0 },
      byModel: byModel.map(m => ({ model: m._id || 'unknown', ...m })),
      byKey: byKey.map(k => ({ keyId: k._id?.toString(), keyName: keyMap[k._id?.toString()] || 'Env Variable', ...k })),
      byDay: byDay.map(d => ({ date: d._id, ...d })),
      recentLogs: recentLogs.map(l => ({
        id: l._id.toString(),
        model: l.model,
        totalTokens: l.totalTokens,
        estimatedCost: l.estimatedCost,
        timestamp: l.timestamp,
        functionName: l.functionName
      }))
    });
  } catch (err) {
    console.error("[OpenAI Usage] Error getting bot drill-down:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET: Drill-down usage by specific Model
app.get("/api/openai-usage/by-model/:model", async (req, res) => {
  try {
    const { model } = req.params;
    const { startDate, endDate } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");

    const { startMoment, endMoment } = parseApiUsageDateRange(
      startDate,
      endDate,
    );
    const match = {
      model,
      timestamp: { $gte: startMoment.toDate(), $lte: endMoment.toDate() },
    };

    // Get usage breakdown by bot
    const byBot = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: { botId: "$botId", platform: "$platform" },
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    // Get daily trend
    const byDay = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$timestamp",
              timezone: BANGKOK_TZ,
            },
          },
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]).toArray();

    // Get totals
    const totals = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCost: { $sum: "$estimatedCost" }
        }
      }
    ]).toArray();

    // Enrich bot names
    const botIds = byBot.map(b => b._id.botId).filter(id => id);
    const lineBots = await db.collection("line_bots").find({ _id: { $in: botIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id)) } }).toArray();
    const fbBots = await db.collection("facebook_bots").find({ _id: { $in: botIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id)) } }).toArray();
    const botMap = Object.fromEntries([...lineBots, ...fbBots].map(b => [b._id.toString(), b.name]));

    res.json({
      success: true,
      model,
      totals: totals[0] || { totalCalls: 0, totalTokens: 0, totalCost: 0 },
      byBot: byBot.map(b => ({
        botId: b._id.botId,
        botName: botMap[b._id.botId] || b._id.botId || 'Unknown',
        platform: b._id.platform,
        count: b.count,
        totalTokens: b.totalTokens,
        estimatedCost: b.estimatedCost
      })),
      byDay: byDay.map(d => ({ date: d._id, ...d }))
    });
  } catch (err) {
    console.error("[OpenAI Usage] Error getting model drill-down:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET: Drill-down usage by specific API Key
app.get("/api/openai-usage/by-key/:keyId", async (req, res) => {
  try {
    const { keyId } = req.params;
    const { startDate, endDate } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");

    const { startMoment, endMoment } = parseApiUsageDateRange(
      startDate,
      endDate,
    );
    const match = {
      timestamp: { $gte: startMoment.toDate(), $lte: endMoment.toDate() },
    };
    if (keyId === "env") {
      match.apiKeyId = null;
    } else if (ObjectId.isValid(keyId)) {
      match.apiKeyId = new ObjectId(keyId);
    }

    // Get usage breakdown by bot
    const byBot = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: { botId: "$botId", platform: "$platform" },
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    // Get usage breakdown by model
    const byModel = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: "$model",
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    // Get daily trend
    const byDay = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$timestamp",
              timezone: BANGKOK_TZ,
            },
          },
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCost: { $sum: "$estimatedCost" }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]).toArray();

    // Get totals
    const totals = await db.collection("openai_usage_logs").aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCost: { $sum: "$estimatedCost" }
        }
      }
    ]).toArray();

    // Get key info
    let keyInfo = { name: 'Environment Variable' };
    if (keyId !== 'env' && ObjectId.isValid(keyId)) {
      const keyDoc = await db.collection("openai_api_keys").findOne({ _id: new ObjectId(keyId) });
      if (keyDoc) keyInfo = { name: keyDoc.name, maskedKey: maskApiKey(keyDoc.apiKey) };
    }

    // Enrich bot names
    const botIds = byBot.map(b => b._id.botId).filter(id => id);
    const lineBots = await db.collection("line_bots").find({ _id: { $in: botIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id)) } }).toArray();
    const fbBots = await db.collection("facebook_bots").find({ _id: { $in: botIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id)) } }).toArray();
    const botMap = Object.fromEntries([...lineBots, ...fbBots].map(b => [b._id.toString(), b.name]));

    res.json({
      success: true,
      keyId,
      keyInfo,
      totals: totals[0] || { totalCalls: 0, totalTokens: 0, totalCost: 0 },
      byBot: byBot.map(b => ({
        botId: b._id.botId,
        botName: botMap[b._id.botId] || b._id.botId || 'Unknown',
        platform: b._id.platform,
        count: b.count,
        totalTokens: b.totalTokens,
        estimatedCost: b.estimatedCost
      })),
      byModel: byModel.map(m => ({ model: m._id || 'unknown', ...m })),
      byDay: byDay.map(d => ({ date: d._id, ...d }))
    });
  } catch (err) {
    console.error("[OpenAI Usage] Error getting key drill-down:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/orders/data", async (req, res) => {
  try {
    const { query } = buildOrderQuery(req.query || {});
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;
    const sortKey = typeof req.query.sortBy === "string" ? req.query.sortBy : "";
    const sortDirection = req.query.sortDir === "asc" ? 1 : -1;
    const sortFields = {
      extractedAt: "extractedAt",
      totalAmount: "orderData.totalAmount",
      status: "status",
    };
    const sortField = sortFields[sortKey] || "extractedAt";
    const sortConfig = { [sortField]: sortDirection };
    if (sortField !== "extractedAt") {
      sortConfig.extractedAt = -1;
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const ordersCursor = coll
      .find(query)
      .sort(sortConfig)
      .skip(skip)
      .limit(limit);

    const [orders, totalCount, statusAgg, totalsAgg] = await Promise.all([
      ordersCursor.toArray(),
      coll.countDocuments(query),
      coll
        .aggregate([
          { $match: query },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ])
        .toArray(),
      coll
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalAmount: {
                $sum: { $ifNull: ["$orderData.totalAmount", 0] },
              },
              totalShipping: {
                $sum: { $ifNull: ["$orderData.shippingCost", 0] },
              },
            },
          },
        ])
        .toArray(),
    ]);

    const userIds = Array.from(
      new Set(orders.map((order) => order.userId).filter(Boolean)),
    );
    let profiles = [];
    if (userIds.length) {
      profiles = await db
        .collection("user_profiles")
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, displayName: 1 })
        .toArray();
    }

    const profileMap = {};
    profiles.forEach((profile) => {
      profileMap[profile.userId] = profile.displayName;
    });

    const botIdSets = {
      line: new Set(),
      facebook: new Set(),
    };

    orders.forEach((order) => {
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botIdStr =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      if (botIdStr) {
        botIdSets[platform].add(botIdStr);
      }
    });

    let lineBotDocs = [];
    let facebookBotDocs = [];

    const lineBotIds = [...botIdSets.line].filter((id) => ObjectId.isValid(id));
    if (lineBotIds.length) {
      lineBotDocs = await db
        .collection("line_bots")
        .find({ _id: { $in: lineBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, displayName: 1, botName: 1 })
        .toArray();
    }

    const facebookBotIds = [...botIdSets.facebook].filter((id) =>
      ObjectId.isValid(id),
    );
    if (facebookBotIds.length) {
      facebookBotDocs = await db
        .collection("facebook_bots")
        .find({ _id: { $in: facebookBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, pageName: 1 })
        .toArray();
    }

    const pageNameMap = new Map();
    lineBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("line", bot._id.toString());
      const label =
        bot.displayName ||
        bot.name ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });
    facebookBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("facebook", bot._id.toString());
      const label =
        bot.pageName ||
        bot.name ||
        `Facebook Page (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });

    const formattedOrders = orders.map((order) => {
      const orderData = order.orderData || {};
      const customerName = normalizeCustomerName(orderData.customerName);
      const displayName =
        customerName || profileMap[order.userId] || order.userId || "";
      const addressInfo = normalizeOrderAddress(orderData);
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botId =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      const pageKey = buildOrderPageKey(platform, botId);
      const pageName =
        pageNameMap.get(pageKey) ||
        (botId
          ? `${platform === "facebook" ? "Facebook" : "LINE"} (${botId})`
          : null);
      const recipientName =
        normalizeCustomerName(orderData.recipientName) ||
        customerName ||
        displayName;
      const email = orderData.email || orderData.customerEmail || "";
      const noteText = order.notes || orderData.notes || "";
      const transferDate =
        orderData.transferDate || orderData.paymentDate || null;
      const transferTime =
        orderData.transferTime || orderData.paymentTime || null;
      const paymentReceiver =
        orderData.paymentReceiver || orderData.receivedBy || "";
      const paymentMethod =
        orderData.paymentMethod || orderData.paymentType || null;
      const phone =
        orderData.phone ||
        orderData.customerPhone ||
        orderData.shippingPhone ||
        null;
      return {
        id: order._id?.toString?.() || "",
        userId: order.userId || "",
        displayName,
        customerName: customerName || "",
        recipientName: recipientName || "",
        platform,
        botId,
        pageKey,
        pageName,
        status: order.status || "pending",
        totalAmount: orderData.totalAmount || 0,
        shippingCost: orderData.shippingCost || 0,
        paymentMethod,
        shippingAddress:
          addressInfo.fullAddress || orderData.shippingAddress || null,
        addressSubDistrict: addressInfo.subDistrict || "",
        addressDistrict: addressInfo.district || "",
        addressProvince: addressInfo.province || "",
        addressPostalCode: addressInfo.postalCode || "",
        phone,
        email,
        items: Array.isArray(orderData.items) ? orderData.items : [],
        extractedAt: order.extractedAt || null,
        notes: noteText,
        transferDate,
        transferTime,
        paymentReceiver,
        isManualExtraction: !!order.isManualExtraction,
        extractedFrom: order.extractedFrom || null,
      };
    });

    const statusCounts = {};
    statusAgg.forEach((entry) => {
      statusCounts[entry._id || "unknown"] = entry.count;
    });

    const totalsEntry = totalsAgg[0] || { totalAmount: 0, totalShipping: 0 };

    res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit) || 1,
      },
      summary: {
        totalOrders: totalCount,
        totalAmount: totalsEntry.totalAmount || 0,
        totalShipping: totalsEntry.totalShipping || 0,
      },
      statusCounts,
    });
  } catch (error) {
    console.error("[Orders] ไม่สามารถดึงข้อมูลออเดอร์ได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/admin/orders/export", async (req, res) => {
  try {
    const { query } = buildOrderQuery(req.query || {});
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const orders = await coll
      .find(query)
      .sort({ extractedAt: -1 })
      .limit(5000)
      .toArray();

    const userIds = Array.from(
      new Set(orders.map((order) => order.userId).filter(Boolean)),
    );
    let profiles = [];
    if (userIds.length) {
      profiles = await db
        .collection("user_profiles")
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, displayName: 1 })
        .toArray();
    }

    const profileMap = {};
    profiles.forEach((profile) => {
      profileMap[profile.userId] = profile.displayName;
    });

    const botIdSets = {
      line: new Set(),
      facebook: new Set(),
    };

    orders.forEach((order) => {
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botIdStr =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      if (botIdStr) {
        botIdSets[platform].add(botIdStr);
      }
    });

    let lineBotDocs = [];
    let facebookBotDocs = [];

    const lineBotIds = [...botIdSets.line].filter((id) => ObjectId.isValid(id));
    if (lineBotIds.length) {
      lineBotDocs = await db
        .collection("line_bots")
        .find({ _id: { $in: lineBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, displayName: 1, botName: 1 })
        .toArray();
    }

    const facebookBotIds = [...botIdSets.facebook].filter((id) =>
      ObjectId.isValid(id),
    );
    if (facebookBotIds.length) {
      facebookBotDocs = await db
        .collection("facebook_bots")
        .find({ _id: { $in: facebookBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, pageName: 1 })
        .toArray();
    }

    const pageNameMap = new Map();
    lineBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("line", bot._id.toString());
      const label =
        bot.displayName ||
        bot.name ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });
    facebookBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("facebook", bot._id.toString());
      const label =
        bot.pageName ||
        bot.name ||
        `Facebook Page (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });

    const timezone = "Asia/Bangkok";

    const formatItemsField = (items, getter) => {
      if (!Array.isArray(items) || !items.length) return "";
      return items
        .map((item, idx) => {
          const value = getter(item, idx);
          return value ? String(value).trim() : "";
        })
        .filter(Boolean)
        .join("\n");
    };

    const formatDimensionValue = (value) => {
      if (value === null || value === undefined || value === "") return "";
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return String(numeric);
      }
      return String(value);
    };

    const formatDateValue = (value) => {
      if (!value) return "";
      const parsed = moment(value);
      if (parsed.isValid()) {
        return parsed.format("YYYY-MM-DD");
      }
      return String(value);
    };

    const formatTimeValue = (value) => {
      if (!value) return "";
      const trimmed = String(value).trim();
      const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        const hour = match[1].padStart(2, "0");
        const minute = match[2];
        return `${hour}:${minute}`;
      }
      return trimmed;
    };

    const exportRows = orders.map((order, index) => {
      const orderData = order.orderData || {};
      const items = Array.isArray(orderData.items) ? orderData.items : [];
      const addressInfo = normalizeOrderAddress(orderData);
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botId =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      const pageKey = buildOrderPageKey(platform, botId);
      const pageName =
        pageNameMap.get(pageKey) ||
        (botId
          ? `${platform === "facebook" ? "Facebook" : "LINE"} (${botId})`
          : platform === "facebook"
            ? "Facebook (default)"
            : "LINE (default)");
      const recipientName =
        normalizeCustomerName(orderData.recipientName) ||
        normalizeCustomerName(orderData.customerName) ||
        profileMap[order.userId] ||
        order.userId ||
        "";
      const email = orderData.email || orderData.customerEmail || "";
      const noteText = order.notes || orderData.notes || "";
      const transferDate =
        orderData.transferDate || orderData.paymentDate || "";
      const transferTime =
        orderData.transferTime || orderData.paymentTime || "";
      const paymentReceiver =
        orderData.paymentReceiver || orderData.receivedBy || "";
      const paymentMethod =
        orderData.paymentMethod || orderData.paymentType || "";
      const phone =
        orderData.phone ||
        orderData.customerPhone ||
        orderData.shippingPhone ||
        "";
      const productNames = formatItemsField(items, (item) => {
        if (!item.product) return "";
        const qtyText =
          item.quantity && Number(item.quantity) !== 1
            ? ` x${item.quantity}`
            : "";
        return `${item.product}${qtyText}`;
      });
      const shippingProductNames = formatItemsField(items, (item) => {
        const name =
          item.shippingName ||
          item.shippingProductName ||
          item.product ||
          "";
        if (!name) return "";
        const qtyText =
          item.quantity && Number(item.quantity) !== 1
            ? ` x${item.quantity}`
            : "";
        return `${name}${qtyText}`;
      });
      const colors = formatItemsField(items, (item) => item.color || "");
      const widths = formatItemsField(items, (item) =>
        formatDimensionValue(
          item.width ?? item.widthCm ?? item.itemWidth ?? "",
        ),
      );
      const lengths = formatItemsField(items, (item) =>
        formatDimensionValue(
          item.length ?? item.lengthCm ?? item.itemLength ?? "",
        ),
      );
      const heights = formatItemsField(items, (item) =>
        formatDimensionValue(
          item.height ?? item.heightCm ?? item.itemHeight ?? "",
        ),
      );
      const weights = formatItemsField(items, (item) =>
        formatDimensionValue(item.weight ?? item.weightKg ?? ""),
      );

      return {
        ลำดับ: index + 1,
        ชื่อผู้รับ: recipientName,
        เบอร์โทร: phone,
        ที่อยู่: addressInfo.fullAddress || orderData.shippingAddress || "",
        ตำบล: addressInfo.subDistrict || "",
        อำเภอ: addressInfo.district || "",
        จังหวัด: addressInfo.province || "",
        รหัสไปรษณีย์: addressInfo.postalCode || "",
        อีเมล: email,
        หมายเหตุ: noteText,
        ชื่อสินค้า: productNames,
        "ชื่อสินค้า (สำหรับขนส่ง)": shippingProductNames,
        สีสินค้า: colors,
        "ความกว้างของสินค้า(เว้นว่าง)": widths,
        "ความยาวของสินค้า(เว้นว่าง)": lengths,
        "ความสูงของสินค้า(เว้นว่าง)": heights,
        "น้ำหนัก(กก.) (เว้นว่าง)": weights,
        ประเภทการชำระ: paymentMethod,
        จำนวนเงิน: Number(orderData.totalAmount) || 0,
        วันที่โอนเงิน: formatDateValue(transferDate),
        เวลาที่โอน: formatTimeValue(transferTime),
        ผู้รับเงิน: paymentReceiver,
        แพลตฟอร์ม: order.platform || "line",
        เพจ: pageName,
        วันที่ดึงออเดอร์: order.extractedAt
          ? moment(order.extractedAt)
            .tz(timezone)
            .format("YYYY-MM-DD HH:mm:ss")
          : "",
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const filename = `orders_${moment().tz("Asia/Bangkok").format("YYYYMMDD_HHmmss")}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (error) {
    console.error("[Orders] ไม่สามารถส่งออกออเดอร์ได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================ Facebook Conversions API ============================

/**
 * Send a conversion event to Facebook Conversions API for Business Messaging
 * @param {Object} options
 * @param {string} options.datasetId - Facebook Dataset ID (from Events Manager)
 * @param {string} options.accessToken - Page Access Token with page_events permission
 * @param {string} options.pageId - Facebook Page ID
 * @param {string} options.psid - Page-Scoped User ID (senderId)
 * @param {string} options.eventName - Event name (e.g., 'Purchase', 'InitiateCheckout')
 * @param {number} options.value - Order value
 * @param {string} options.currency - Currency code (default: 'THB')
 * @returns {Promise<Object>} - API response
 */
async function sendFacebookConversionEvent(options) {
  const {
    datasetId,
    accessToken,
    pageId,
    psid,
    eventName = "Purchase",
    value = 0,
    currency = "THB",
  } = options;

  if (!datasetId || !accessToken || !pageId || !psid) {
    console.log("[FB Conversions API] Missing required parameters:", {
      hasDatasetId: !!datasetId,
      hasAccessToken: !!accessToken,
      hasPageId: !!pageId,
      hasPsid: !!psid,
    });
    return { success: false, error: "Missing required parameters" };
  }

  const eventTime = Math.floor(Date.now() / 1000);

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        action_source: "business_messaging",
        messaging_channel: "messenger",
        user_data: {
          page_id: pageId,
          page_scoped_user_id: psid,
        },
        custom_data: {
          currency: currency,
          value: value,
        },
      },
    ],
    partner_agent: "ChatCenterAI",
  };

  try {
    const url = `https://graph.facebook.com/v18.0/${datasetId}/events`;
    const response = await axios.post(url, payload, {
      params: { access_token: accessToken },
      headers: { "Content-Type": "application/json" },
    });

    console.log(`[FB Conversions API] ส่ง ${eventName} event สำเร็จ:`, {
      datasetId,
      pageId,
      psid,
      value,
      currency,
      response: response.data,
    });

    return { success: true, data: response.data };
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code;
    console.error(`[FB Conversions API] ส่ง ${eventName} event ไม่สำเร็จ:`, {
      datasetId,
      pageId,
      psid,
      errorCode,
      errorMessage,
    });
    return { success: false, error: errorMessage, code: errorCode };
  }
}

async function fetchFacebookDatasetId({ pageId, accessToken } = {}) {
  if (!pageId || !accessToken) {
    return { success: false, reason: "Missing pageId or accessToken" };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${pageId}/dataset`;
    const response = await axios.post(url, null, {
      params: { access_token: accessToken },
      headers: { "Content-Type": "application/json" },
    });

    const datasetId =
      response?.data?.id ||
      response?.data?.dataset_id ||
      response?.data?.datasetId ||
      null;

    if (!datasetId) {
      return {
        success: false,
        error: "Dataset ID not returned",
      };
    }

    return { success: true, datasetId };
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code || null;
    const status = error.response?.status || null;
    return { success: false, error: errorMessage, code: errorCode, status };
  }
}

/**
 * Process Facebook Conversion for an order when status changes to confirmed
 * @param {Object} order - The order document from MongoDB
 * @returns {Promise<Object>} - Result of the conversion event
 */
async function processFacebookConversion(order) {
  if (!order || order.platform !== "facebook" || !order.botId) {
    return { success: false, reason: "Not a Facebook order or missing botId" };
  }

  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const fbBot = await db.collection("facebook_bots").findOne({
      _id: ObjectId.isValid(order.botId) ? new ObjectId(order.botId) : null,
    });

    if (!fbBot) {
      return { success: false, reason: "Facebook Bot not found" };
    }

    if (!fbBot.datasetId) {
      console.log("[FB Conversions API] Bot ไม่มี datasetId:", fbBot.name);
      return { success: false, reason: "Dataset ID not configured for this bot" };
    }

    // Calculate order value
    let orderValue = 0;
    const orderData = order.orderData || {};

    if (orderData.totalAmount) {
      orderValue = parseFloat(orderData.totalAmount) || 0;
    } else if (Array.isArray(orderData.items)) {
      orderData.items.forEach((item) => {
        orderValue += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
      });
    }

    // Add shipping cost if exists
    if (orderData.shippingCost) {
      orderValue += parseFloat(orderData.shippingCost) || 0;
    }

    const result = await sendFacebookConversionEvent({
      datasetId: fbBot.datasetId,
      accessToken: fbBot.accessToken,
      pageId: fbBot.pageId,
      psid: order.userId,
      eventName: "Purchase",
      value: orderValue,
      currency: "THB",
    });

    // Store conversion result in order
    await db.collection("orders").updateOne(
      { _id: order._id },
      {
        $set: {
          fbConversionSent: result.success,
          fbConversionResult: result,
          fbConversionSentAt: new Date(),
        },
      }
    );

    return result;
  } catch (error) {
    console.error("[FB Conversions API] processFacebookConversion error:", error);
    return { success: false, error: error.message };
  }
}

// ============================ Orders V2 APIs ============================

// API: เปลี่ยนสถานะหลายออเดอร์พร้อมกัน (Bulk)
// NOTE: This route MUST be defined BEFORE the parameterized route below
// to prevent Express from matching "bulk" as an :orderId parameter
app.patch("/admin/orders/bulk/status", async (req, res) => {
  try {
    const { orderIds, status } = req.body || {};

    const validStatuses = ["pending", "confirmed", "shipped", "completed", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "สถานะไม่ถูกต้อง กรุณาระบุ: pending, confirmed, shipped, completed, หรือ cancelled",
      });
    }

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, error: "กรุณาระบุรายการออเดอร์" });
    }

    if (orderIds.length > 100) {
      return res.status(400).json({ success: false, error: "สามารถอัปเดตได้สูงสุด 100 รายการต่อครั้ง" });
    }

    const validIds = orderIds.filter((id) => ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, error: "ไม่พบรหัสออเดอร์ที่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const result = await coll.updateMany(
      { _id: { $in: validIds.map((id) => new ObjectId(id)) } },
      { $set: { status, updatedAt: new Date() } }
    );

    console.log(`[Orders] อัปเดตสถานะ ${result.modifiedCount} ออเดอร์เป็น ${status}`);
    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      status,
    });
  } catch (error) {
    console.error("[Orders] ไม่สามารถอัปเดตสถานะแบบกลุ่มได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: เปลี่ยนสถานะออเดอร์เดี่ยว
app.patch("/admin/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body || {};

    const validStatuses = ["pending", "confirmed", "shipped", "completed", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "สถานะไม่ถูกต้อง กรุณาระบุ: pending, confirmed, shipped, completed, หรือ cancelled",
      });
    }

    if (!ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, error: "รหัสออเดอร์ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    // ดึงข้อมูลออเดอร์เดิมก่อนอัปเดต
    const existingOrder = await coll.findOne({ _id: new ObjectId(orderId) });
    if (!existingOrder) {
      return res.status(404).json({ success: false, error: "ไม่พบออเดอร์" });
    }

    const previousStatus = existingOrder.status;

    const result = await coll.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบออเดอร์" });
    }

    console.log(`[Orders] อัปเดตสถานะออเดอร์ ${orderId} เป็น ${status}`);

    // ส่ง Facebook Conversions API เมื่อสถานะเปลี่ยนเป็น "confirmed"
    let fbConversionResult = null;
    if (status === "confirmed" && previousStatus !== "confirmed") {
      // ดึงข้อมูลออเดอร์ที่อัปเดตแล้ว
      const updatedOrder = await coll.findOne({ _id: new ObjectId(orderId) });

      if (updatedOrder && updatedOrder.platform === "facebook" && !updatedOrder.fbConversionSent) {
        console.log(`[FB Conversions API] กำลังส่ง Purchase event สำหรับออเดอร์ ${orderId}...`);
        fbConversionResult = await processFacebookConversion(updatedOrder);

        if (fbConversionResult.success) {
          console.log(`[FB Conversions API] ส่ง Purchase event สำเร็จสำหรับออเดอร์ ${orderId}`);
        } else {
          console.log(`[FB Conversions API] ส่ง Purchase event ไม่สำเร็จ:`, fbConversionResult.reason || fbConversionResult.error);
        }
      }
    }

    res.json({
      success: true,
      orderId,
      status,
      fbConversionSent: fbConversionResult?.success || false,
      fbConversionError: fbConversionResult?.error || fbConversionResult?.reason || null,
    });
  } catch (error) {
    console.error("[Orders] ไม่สามารถอัปเดตสถานะได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: อัปเดต notes ของออเดอร์
app.patch("/admin/orders/:orderId/notes", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body || {};

    if (!ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, error: "รหัสออเดอร์ไม่ถูกต้อง" });
    }

    const sanitizedNotes = typeof notes === "string" ? notes.trim().slice(0, 2000) : "";

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const result = await coll.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { notes: sanitizedNotes, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบออเดอร์" });
    }

    console.log(`[Orders] อัปเดต notes ออเดอร์ ${orderId}`);
    res.json({ success: true, orderId, notes: sanitizedNotes });
  } catch (error) {
    console.error("[Orders] ไม่สามารถอัปเดต notes ได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// User Notes API
// ========================================

// API: ดึงโน้ตของผู้ใช้
app.get("/api/users/:userId/notes", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ success: false, error: "ไม่พบรหัสผู้ใช้" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_notes");

    const doc = await coll.findOne({ userId });
    const notes = doc?.notes || "";
    const updatedAt = doc?.updatedAt || null;

    res.json({ success: true, userId, notes, updatedAt });
  } catch (error) {
    console.error("[UserNotes] ไม่สามารถดึงโน้ตได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: บันทึกโน้ตของผู้ใช้
app.patch("/api/users/:userId/notes", async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ success: false, error: "ไม่พบรหัสผู้ใช้" });
    }

    const sanitizedNotes = typeof notes === "string" ? notes.trim().slice(0, 5000) : "";

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_notes");

    await coll.updateOne(
      { userId },
      {
        $set: {
          notes: sanitizedNotes,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log(`[UserNotes] บันทึกโน้ตสำหรับผู้ใช้ ${userId.substring(0, 8)}...`);
    res.json({ success: true, userId, notes: sanitizedNotes });
  } catch (error) {
    console.error("[UserNotes] ไม่สามารถบันทึกโน้ตได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Generate Print Label HTML
app.get("/admin/orders/:orderId/print-label", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, error: "รหัสออเดอร์ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const order = await coll.findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return res.status(404).json({ success: false, error: "ไม่พบออเดอร์" });
    }

    const orderData = order.orderData || {};
    const addressInfo = normalizeOrderAddress(orderData);

    // สร้าง items list
    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const itemsHtml = items
      .map((item) => {
        const name = item.shippingName || item.product || "สินค้า";
        const qty = item.quantity || 1;
        const color = item.color ? ` (${item.color})` : "";
        return `<li>${name}${color} x${qty}</li>`;
      })
      .join("");

    // Format Order ID
    const shortId = orderId.slice(-8).toUpperCase();
    const orderDate = order.extractedAt
      ? moment(order.extractedAt).tz("Asia/Bangkok").format("DD/MM/YYYY HH:mm")
      : "-";

    // สร้าง address string
    const addressParts = [
      addressInfo.fullAddress,
      addressInfo.subDistrict ? `ต.${addressInfo.subDistrict}` : "",
      addressInfo.district ? `อ.${addressInfo.district}` : "",
      addressInfo.province || "",
      addressInfo.postalCode || "",
    ].filter(Boolean);
    const fullAddress = addressParts.join(" ");

    // Payment info
    const paymentMethod = orderData.paymentMethod || "เก็บเงินปลายทาง";
    const totalAmount = orderData.totalAmount || 0;
    const shippingCost = orderData.shippingCost || 0;

    // Generate HTML
    const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>ใบปะหน้าพัสดุ - ${shortId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Sarabun', 'Arial', sans-serif; font-size: 14px; }
    .label { width: 100mm; padding: 8mm; border: 2px solid #000; }
    .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .section { margin-bottom: 10px; }
    .section-title { font-weight: bold; font-size: 12px; color: #666; margin-bottom: 4px; }
    .recipient { font-size: 16px; font-weight: bold; }
    .phone { font-size: 14px; margin-top: 4px; }
    .address { font-size: 13px; line-height: 1.4; margin-top: 8px; }
    .items { margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 8px; }
    .items ul { padding-left: 20px; }
    .items li { font-size: 12px; margin-bottom: 3px; }
    .total { font-size: 16px; font-weight: bold; margin-top: 10px; text-align: right; }
    .footer { margin-top: 10px; border-top: 1px solid #000; padding-top: 8px; font-size: 11px; color: #666; display: flex; justify-content: space-between; }
    @media print {
      body { margin: 0; }
      .label { border: none; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">📦 ใบปะหน้าพัสดุ</div>
    
    <div class="section">
      <div class="section-title">ผู้รับ:</div>
      <div class="recipient">${orderData.recipientName || orderData.customerName || "-"}</div>
      <div class="phone">📞 ${orderData.phone || "-"}</div>
    </div>
    
    <div class="section">
      <div class="section-title">ที่อยู่จัดส่ง:</div>
      <div class="address">${fullAddress || "-"}</div>
    </div>
    
    <div class="items">
      <div class="section-title">รายการสินค้า:</div>
      <ul>${itemsHtml || "<li>-</li>"}</ul>
    </div>
    
    <div class="total">
      รวม: ฿${totalAmount.toLocaleString()}${shippingCost > 0 ? ` (ค่าส่ง ฿${shippingCost.toLocaleString()})` : ""} (${paymentMethod})
    </div>
    
    <div class="footer">
      <span>Order #${shortId}</span>
      <span>${orderDate}</span>
    </div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("[Orders] ไม่สามารถสร้าง print label ได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint สำหรับทดสอบการกรองข้อความ
app.post("/api/filter/test", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาใส่ข้อความที่ต้องการทดสอบ" });
    }

    const result = await testMessageFiltering(message);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Error testing message filter:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ Socket.IO Events ============================
io.on("connection", (socket) => {
  console.log("[Socket.IO] Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("[Socket.IO] Admin disconnected:", socket.id);
  });

  // Join admin room for receiving updates
  socket.join("admin");
});

// Function to notify admins of new user messages
async function notifyAdminsNewMessage(userId, message) {
  // ตรวจสอบการตั้งค่าการแจ้งเตือน
  const enableAdminNotifications = await getSettingValue(
    "enableAdminNotifications",
    true,
  );

  if (enableAdminNotifications) {
    // แจ้งเตือนแอดมินผ่าน Socket.IO
    io.to("admin").emit("newMessage", {
      userId: userId,
      message: message,
      sender: "user",
      timestamp: new Date(),
    });
  }

  // อัปเดต unread count สำหรับผู้ใช้
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    await coll.updateOne(
      { userId: userId },
      { $inc: { unreadCount: 1 } },
      { upsert: true },
    );
  } catch (error) {
    console.error("ไม่สามารถอัปเดต unread count ได้:", error);
  }
}

// ฟังก์ชันสำหรับดึง unread count ของผู้ใช้
async function getUserUnreadCount(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    const doc = await coll.findOne({ userId: userId });
    return doc ? doc.unreadCount : 0;
  } catch (error) {
    console.error("ไม่สามารถดึง unread count ได้:", error);
    return 0;
  }
}

// ฟังก์ชันสำหรับรีเซ็ต unread count ของผู้ใช้
async function resetUserUnreadCount(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    await coll.updateOne(
      { userId: userId },
      { $set: { unreadCount: 0 } },
      { upsert: true },
    );
  } catch (error) {
    console.error("ไม่สามารถรีเซ็ต unread count ได้:", error);
  }
}

// ============================ Message Filtering Functions ============================

async function loadMessageFilterConfig() {
  try {
    const [
      enableFiltering,
      hiddenWords,
      replacementText,
      enableStrictFiltering,
    ] = await Promise.all([
      getSettingValue("enableMessageFiltering", true),
      getSettingValue("hiddenWords", ""),
      getSettingValue("replacementText", "[ข้อความถูกซ่อน]"),
      getSettingValue("enableStrictFiltering", true),
    ]);

    return {
      enableFiltering: enableFiltering !== false,
      hiddenWords,
      replacementText: replacementText || "[ข้อความถูกซ่อน]",
      enableStrictFiltering: enableStrictFiltering !== false,
    };
  } catch (error) {
    console.error("[Filter] ข้อผิดพลาดในการโหลดการตั้งค่าการกรอง:", error);
    return {
      enableFiltering: true,
      hiddenWords: "",
      replacementText: "[ข้อความถูกซ่อน]",
      enableStrictFiltering: true,
    };
  }
}

// ฟังก์ชันสำหรับกรองข้อความตามการตั้งค่า
async function filterMessage(message, options = {}) {
  try {
    if (typeof message !== "string" || message.length === 0) {
      return message;
    }

    const { config: providedConfig } = options || {};

    const config =
      providedConfig && typeof providedConfig === "object"
        ? providedConfig
        : await loadMessageFilterConfig();

    const enableFiltering =
      typeof config.enableFiltering === "boolean"
        ? config.enableFiltering
        : true;
    if (!enableFiltering) {
      return message; // ไม่กรอง ถ้าไม่ได้เปิดใช้งาน
    }

    const hiddenWordsSource =
      config.hiddenWords !== undefined ? config.hiddenWords : "";
    const replacementText =
      typeof config.replacementText === "string" &&
        config.replacementText.trim().length > 0
        ? config.replacementText
        : "[ข้อความถูกซ่อน]";
    const enableStrictFiltering =
      typeof config.enableStrictFiltering === "boolean"
        ? config.enableStrictFiltering
        : true;

    if (!hiddenWordsSource || String(hiddenWordsSource).trim() === "") {
      return message; // ไม่กรอง ถ้าไม่มีคำที่ซ่อน
    }

    // ตรวจสอบว่าการกรองเปิดใช้งานหรือไม่
    const wordsToHide = Array.isArray(hiddenWordsSource)
      ? hiddenWordsSource
        .map((word) => (typeof word === "string" ? word.trim() : ""))
        .filter((word) => word.length > 0)
      : String(hiddenWordsSource)
        .split("\n")
        .map((word) => word.trim())
        .filter((word) => word.length > 0);

    if (wordsToHide.length === 0) {
      return message; // ไม่กรอง ถ้าไม่มีคำที่ซ่อน
    }

    let filteredMessage = message;
    const foundHiddenWords = [];

    // กรองแต่ละคำที่ซ่อน
    wordsToHide.forEach((word) => {
      if (word.length > 0) {
        // สร้าง regex pattern สำหรับการค้นหา (ไม่คำนึงถึงตัวพิมพ์เล็ก-ใหญ่)
        const pattern = new RegExp(
          word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );

        if (pattern.test(filteredMessage)) {
          foundHiddenWords.push(word);

          if (enableStrictFiltering) {
            // การกรองแบบละเอียด: แทนที่ทั้งคำและวลีที่ประกอบด้วยคำนั้น
            filteredMessage = filteredMessage.replace(pattern, replacementText);
          } else {
            // การกรองแบบปกติ: แทนที่เฉพาะคำที่ตรงกันเท่านั้น
            const wordBoundaryPattern = new RegExp(
              `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "gi",
            );
            filteredMessage = filteredMessage.replace(
              wordBoundaryPattern,
              replacementText,
            );
          }
        }
      }
    });

    console.log(
      `[Filter] กรองข้อความ: พบคำที่ซ่อน ${foundHiddenWords.length} คำ`,
    );
    return filteredMessage;
  } catch (error) {
    console.error("[Filter] ข้อผิดพลาดในการกรองข้อความ:", error);
    return message; // ส่งคืนข้อความต้นฉบับในกรณีที่เกิดข้อผิดพลาด
  }
}

function normalizeOutgoingText(message) {
  if (typeof message !== "string") return message;
  let normalized = message;
  normalized = normalized
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");

  const urlMatches = [];
  normalized = normalized.replace(/https?:\/\/[^\s]+/gi, (match) => {
    const index = urlMatches.length;
    urlMatches.push(match);
    return `__URL_PLACEHOLDER_${index}__`;
  });

  normalized = normalized.replace(/(^|[\s])\/n(?=[\s]|$)/gi, "$1\n");
  normalized = normalized.replace(/\/n(?=[^\x00-\x7F])/g, "\n");
  normalized = normalized.replace(/([^\x00-\x7F])\/n$/g, "$1\n");

  normalized = normalized.replace(
    /__URL_PLACEHOLDER_(\d+)__/g,
    (_, idx) => urlMatches[Number(idx)] || "",
  );

  return normalized;
}

// ฟังก์ชันสำหรับทดสอบการกรองข้อความ
async function testMessageFiltering(message) {
  try {
    const filteredMessage = await filterMessage(message);
    const hiddenWords = await getSettingValue("hiddenWords", "");

    // หาคำที่ถูกซ่อน
    const wordsToHide = hiddenWords
      .split("\n")
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    const foundHiddenWords = [];
    wordsToHide.forEach((word) => {
      if (word.length > 0) {
        const pattern = new RegExp(
          word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );
        if (pattern.test(message)) {
          foundHiddenWords.push(word);
        }
      }
    });

    return {
      originalMessage: message,
      filteredMessage: filteredMessage,
      hiddenWords: foundHiddenWords,
    };
  } catch (error) {
    console.error("[Filter] ข้อผิดพลาดในการทดสอบการกรอง:", error);
    throw error;
  }
}

// ============================ Message Content Normalization Functions ============================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeContentToPlainText(content) {
  if (content === null) {
    return "null";
  }

  if (typeof content === "undefined") {
    return "undefined";
  }

  if (typeof content === "string") {
    return content;
  }

  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }

  if (content instanceof Date) {
    return content.toISOString();
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch (error) {
    console.warn("[ContentSerializer] ไม่สามารถแปลงข้อมูลเป็นข้อความได้:", error);
    return "";
  }
}

function buildFallbackDisplayFromContent(content) {
  const plainText = serializeContentToPlainText(content);
  if (!plainText) {
    return null;
  }

  const html = `<div class="message-text"><pre class="mb-0 text-break" style="white-space: pre-wrap;">${escapeHtml(plainText)}</pre></div>`;
  return {
    html,
    plainText,
    contentType: "text",
  };
}

/**
 * ฟังก์ชันสำหรับแปลงข้อมูลข้อความจากฐานข้อมูลให้อยู่ในรูปแบบที่ frontend สามารถแสดงผลได้
 * @param {Object} message - ข้อความจากฐานข้อมูล
 * @returns {Object} ข้อความที่แปลงแล้วพร้อมข้อมูลที่จำเป็น
 */
function normalizeMessageForFrontend(message) {
  try {
    // ตรวจสอบว่า message มีโครงสร้างที่ถูกต้องหรือไม่
    if (!message || typeof message !== "object") {
      return {
        content: "ข้อความไม่ถูกต้อง",
        role: "system",
        timestamp: new Date(),
        source: "system",
        displayContent: "ข้อความไม่ถูกต้อง",
        contentType: "text",
      };
    }

    // แปลง timestamp
    let timestamp = message.timestamp;
    if (timestamp && typeof timestamp === "string") {
      timestamp = new Date(timestamp);
    } else if (!timestamp) {
      timestamp = new Date();
    }

    // แปลง content
    const originalContent = message.content;
    let content = originalContent;
    let displayContent = "";
    let contentType = "text";
    let richDisplayContent = "";
    const messageId =
      message?._id && typeof message._id.toString === "function"
        ? message._id.toString()
        : message?._id || null;
    const orderExtractionRoundId = message?.orderExtractionRoundId
      ? String(message.orderExtractionRoundId)
      : null;

    // ตรวจสอบประเภทของ content และแปลงให้เหมาะสม
    if (typeof content === "string") {
      // ถ้าเป็น string ที่เป็น JSON
      if (content.trim().startsWith("{") || content.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(content);
          const processed = processQueueMessageForDisplayV2(parsed);
          displayContent = processed.displayContent;
          richDisplayContent = processed.displayContent;
          contentType = processed.contentType;
          if (typeof processed.plainText === "string") {
            content = processed.plainText;
          } else if (typeof displayContent === "string") {
            content = displayContent;
          }
        } catch (parseError) {
          // ถ้า parse JSON ไม่ได้ ให้ใช้เป็นข้อความธรรมดา
          displayContent = content;
          contentType = "text";
        }
      } else {
        // ข้อความธรรมดา
        displayContent = content;
        contentType = "text";
      }
    } else if (Array.isArray(content)) {
      // ถ้าเป็น array (เช่น ข้อความจากคิว)
      const processed = processQueueMessageForDisplayV2(content);
      displayContent = processed.displayContent;
      richDisplayContent = processed.displayContent;
      contentType = processed.contentType;
      if (typeof processed.plainText === "string") {
        content = processed.plainText;
      } else {
        content = displayContent;
      }
    } else if (content && typeof content === "object") {
      // ถ้าเป็น object
      const processed = processQueueMessageForDisplayV2(content);
      displayContent = processed.displayContent;
      richDisplayContent = processed.displayContent;
      contentType = processed.contentType;
      if (typeof processed.plainText === "string") {
        content = processed.plainText;
      } else {
        content = displayContent;
      }
    } else {
      // กรณีอื่น ๆ
      const fallbackDisplay = buildFallbackDisplayFromContent(
        content ?? originalContent,
      );
      if (fallbackDisplay) {
        displayContent = fallbackDisplay.html;
        richDisplayContent = fallbackDisplay.html;
        contentType = fallbackDisplay.contentType;
        content = fallbackDisplay.plainText;
      } else {
        displayContent = "ข้อความไม่สามารถแสดงผลได้";
        contentType = "error";
      }
    }

    if (!richDisplayContent) {
      richDisplayContent = displayContent;
    }

    return {
      content,
      role: message.role || "user",
      timestamp,
      source:
        typeof message.source === "string" && message.source.trim()
          ? message.source.trim()
          : null,
      metadata:
        typeof message.metadata === "string" && message.metadata.trim()
          ? message.metadata.trim()
          : typeof message.metadata === "undefined"
            ? null
            : message.metadata,
      displayContent,
      richDisplayContent,
      contentType,
      platform: message.platform || "line",
      botId: message.botId || null,
      rawContent: originalContent,
      messageId,
      orderExtractionRoundId,
    };
  } catch (error) {
    console.error("[Normalize] ข้อผิดพลาดในการแปลงข้อความ:", error);
    return {
      content: "ข้อความไม่ถูกต้อง",
      role: "system",
      timestamp: new Date(),
      source: "system",
      displayContent: "เกิดข้อผิดพลาดในการประมวลผลข้อความ",
      contentType: "error",
      richDisplayContent: "เกิดข้อผิดพลาดในการประมวลผลข้อความ",
      messageId: null,
      orderExtractionRoundId: null,
    };
  }
}

/**
 * ฟังก์ชันสำหรับประมวลผลข้อความจากคิวเพื่อแสดงผลในหน้าแชท
 * @param {Array|Object} content - เนื้อหาข้อความจากคิว
 * @returns {Object} ข้อมูลที่ประมวลผลแล้วพร้อม HTML สำหรับแสดงผล
 */
function processQueueMessageForDisplay(content) {
  try {
    let displayContent = "";
    let contentType = "text";
    let plainText = "";

    // ถ้าเป็น array (ข้อความจากคิว)
    if (Array.isArray(content)) {
      const textParts = [];
      const imageParts = [];
      const audioParts = [];

      content.forEach((item) => {
        const data = item?.data || item;
        if (!data) {
          return;
        }

        if (data.type === "text" && data.text) {
          textParts.push(data.text);
        } else if (data.type === "image" && data.base64) {
          imageParts.push(data);
        } else if (data.type === "audio") {
          audioParts.push(data);
        }
      });

      // สร้าง HTML สำหรับแสดงผล
      if (textParts.length > 0) {
        // รวมข้อความและรักษาการเว้นบรรทัด
        const combinedText = textParts.join("\n");
        displayContent += `<div class="message-text">${combinedText.replace(/\n/g, "<br>")}</div>`;
        plainText = combinedText;
      }

      if (imageParts.length > 0) {
        if (imageParts.length === 1) {
          displayContent += createImageHTML(imageParts[0]);
        } else {
          displayContent += '<div class="image-grid">';
          imageParts.forEach((image, index) => {
            displayContent += createImageHTML(image, index);
          });
          displayContent += "</div>";
        }
        contentType = "multimodal";
      }

      if (audioParts.length > 0) {
        const audioPlainTexts = [];
        audioParts.forEach((audio, index) => {
          const audioDisplay = buildAudioAttachmentDisplay(audio, index);
          displayContent += audioDisplay.html;
          if (audioDisplay.plainText) {
            audioPlainTexts.push(audioDisplay.plainText);
          }
        });
        if (audioPlainTexts.length > 0) {
          plainText = plainText
            ? `${plainText}\n${audioPlainTexts.join("\n")}`
            : audioPlainTexts.join("\n");
        }
        contentType =
          textParts.length > 0 || imageParts.length > 0
            ? "multimodal"
            : "audio";
      }

      if (
        textParts.length === 0 &&
        imageParts.length === 0 &&
        audioParts.length === 0
      ) {
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // ถ้าเป็น object เดี่ยว
    else if (content && typeof content === "object") {
      if (content.type === "text" && content.content) {
        // รองรับการเว้นบรรทัดในข้อความ
        const textWithBreaks = content.content.replace(/\n/g, "<br>");
        displayContent = `<div class="message-text">${textWithBreaks}</div>`;
        contentType = "text";
        plainText = content.content;
      } else if (content.type === "image" && content.content) {
        displayContent = createImageHTML({
          base64: content.content,
          description: content.description || "ผู้ใช้ส่งรูปภาพมา",
        });
        contentType = "image";
        plainText = "";
      } else if (content.type === "audio") {
        const audioDisplay = buildAudioAttachmentDisplay(content);
        displayContent = audioDisplay.html;
        contentType = "audio";
        plainText = audioDisplay.plainText || "";
      } else if (content.data) {
        const data = content.data;
        if (data.type === "text" && data.text) {
          // รองรับการเว้นบรรทัดในข้อความ
          const textWithBreaks = data.text.replace(/\n/g, "<br>");
          displayContent = `<div class="message-text">${textWithBreaks}</div>`;
          contentType = "text";
          plainText = data.text;
        } else if (data.type === "image" && data.base64) {
          displayContent = createImageHTML(data);
          contentType = "image";
          plainText = "";
        } else if (data.type === "audio") {
          const audioDisplay = buildAudioAttachmentDisplay(data);
          displayContent = audioDisplay.html;
          contentType = "audio";
          plainText = audioDisplay.plainText || "";
        } else {
          const fallbackDisplay = buildFallbackDisplayFromContent(data);
          if (fallbackDisplay) {
            displayContent = fallbackDisplay.html;
            contentType = fallbackDisplay.contentType;
            plainText = fallbackDisplay.plainText;
          } else {
            displayContent =
              '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
            contentType = "error";
            plainText = "";
          }
        }
      } else {
        // ถ้าไม่มี data field ให้ลองแปลงเป็น string
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // กรณีอื่น ๆ
    else {
      const fallbackDisplay = buildFallbackDisplayFromContent(content);
      if (fallbackDisplay) {
        displayContent = fallbackDisplay.html;
        contentType = fallbackDisplay.contentType;
        plainText = fallbackDisplay.plainText;
      } else {
        displayContent =
          '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
        contentType = "error";
        plainText = "";
      }
    }

    return {
      displayContent: displayContent,
      contentType: contentType,
      plainText,
    };
  } catch (error) {
    console.error(
      "[ProcessQueue] ข้อผิดพลาดในการประมวลผลข้อความจากคิว:",
      error,
    );
    return {
      displayContent:
        '<div class="message-text text-danger">เกิดข้อผิดพลาดในการประมวลผลข้อความ</div>',
      contentType: "error",
      plainText: "",
    };
  }
}

/**
 * ฟังก์ชันสำหรับประมวลผลข้อความจากคิวเพื่อแสดงผลในหน้าแชท (เวอร์ชันใหม่)
 * @param {Array|Object} content - เนื้อหาข้อความจากคิว
 * @returns {Object} ข้อมูลที่ประมวลผลแล้วพร้อม HTML สำหรับแสดงผล
 */
function processQueueMessageForDisplayV2(content) {
  try {
    let displayContent = "";
    let contentType = "text";
    let plainText = "";

    // ถ้าเป็น array (ข้อความจากคิว)
    if (Array.isArray(content)) {
      const textParts = [];
      const imageParts = [];
      const audioParts = [];

      content.forEach((item) => {
        // รองรับรูปแบบใหม่: item มี type และ content โดยตรง
        if (item && item.type === "text" && item.content) {
          textParts.push(item.content);
        } else if (item && item.type === "text" && item.text) {
          // รองรับรูปแบบ follow-up { type: "text", text: "..." }
          textParts.push(item.text);
        } else if (item && item.type === "image" && item.content) {
          // รูปภาพในรูปแบบใหม่ (base64 ใน content)
          imageParts.push({
            base64: item.content,
            description: item.description || "ผู้ใช้ส่งรูปภาพมา",
          });
        } else if (item && item.type === "image" && item.url) {
          // รูปภาพในรูปแบบ URL (เช่น follow-up images)
          imageParts.push({
            url: item.url,
            previewUrl: item.previewUrl || item.url,
            caption: item.caption || item.alt || "",
          });
        } else if (item && item.type === "audio") {
          audioParts.push(item);
        }
        // รองรับรูปแบบเก่า: item.data
        else if (item && item.data) {
          const data = item.data;
          if (data.type === "text" && data.text) {
            textParts.push(data.text);
          } else if (data.type === "image" && data.base64) {
            imageParts.push(data);
          } else if (data.type === "image" && data.url) {
            // รูปภาพ URL ในรูปแบบเก่า
            imageParts.push({
              url: data.url,
              previewUrl: data.previewUrl || data.url,
              caption: data.caption || data.alt || "",
            });
          } else if (data.type === "audio") {
            audioParts.push(data);
          }
        }
      });

      // สร้าง HTML สำหรับแสดงผล
      if (textParts.length > 0) {
        // รวมข้อความและรักษาการเว้นบรรทัด
        const combinedText = textParts.join("\n");
        displayContent += `<div class="message-text">${combinedText.replace(/\n/g, "<br>")}</div>`;
        plainText = combinedText;
      }

      if (imageParts.length > 0) {
        if (imageParts.length === 1) {
          displayContent += createImageHTML(imageParts[0]);
        } else {
          displayContent += '<div class="image-grid">';
          imageParts.forEach((image, index) => {
            displayContent += createImageHTML(image, index);
          });
          displayContent += "</div>";
        }
        contentType = "multimodal";
      }

      if (audioParts.length > 0) {
        const audioPlainTexts = [];
        audioParts.forEach((audio, index) => {
          const audioDisplay = buildAudioAttachmentDisplay(audio, index);
          displayContent += audioDisplay.html;
          if (audioDisplay.plainText) {
            audioPlainTexts.push(audioDisplay.plainText);
          }
        });
        if (audioPlainTexts.length > 0) {
          plainText = plainText
            ? `${plainText}\n${audioPlainTexts.join("\n")}`
            : audioPlainTexts.join("\n");
        }
        contentType =
          textParts.length > 0 || imageParts.length > 0
            ? "multimodal"
            : "audio";
      }

      if (
        textParts.length === 0 &&
        imageParts.length === 0 &&
        audioParts.length === 0
      ) {
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // ถ้าเป็น object เดี่ยว
    else if (content && typeof content === "object") {
      // รองรับรูปแบบใหม่
      if (content.type === "text" && content.content) {
        // รองรับการเว้นบรรทัดในข้อความ
        const textWithBreaks = content.content.replace(/\n/g, "<br>");
        displayContent = `<div class="message-text">${textWithBreaks}</div>`;
        contentType = "text";
        plainText = content.content;
      } else if (content.type === "image" && content.content) {
        displayContent = createImageHTML({
          base64: content.content,
          description: content.description || "ผู้ใช้ส่งรูปภาพมา",
        });
        contentType = "image";
        plainText = "";
      } else if (content.type === "audio") {
        const audioDisplay = buildAudioAttachmentDisplay(content);
        displayContent = audioDisplay.html;
        contentType = "audio";
        plainText = audioDisplay.plainText || "";
      }
      // รองรับรูปแบบเก่า
      else if (content.data) {
        const data = content.data;
        if (data.type === "text" && data.text) {
          // รองรับการเว้นบรรทัดในข้อความ
          const textWithBreaks = data.text.replace(/\n/g, "<br>");
          displayContent = `<div class="message-text">${textWithBreaks}</div>`;
          contentType = "text";
          plainText = data.text;
        } else if (data.type === "image" && data.base64) {
          displayContent = createImageHTML(data);
          contentType = "image";
          plainText = "";
        } else if (data.type === "audio") {
          const audioDisplay = buildAudioAttachmentDisplay(data);
          displayContent = audioDisplay.html;
          contentType = "audio";
          plainText = audioDisplay.plainText || "";
        } else {
          const fallbackDisplay = buildFallbackDisplayFromContent(data);
          if (fallbackDisplay) {
            displayContent = fallbackDisplay.html;
            contentType = fallbackDisplay.contentType;
            plainText = fallbackDisplay.plainText;
          } else {
            displayContent =
              '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
            contentType = "error";
            plainText = "";
          }
        }
      } else {
        // ถ้าไม่มี data field ให้ลองแปลงเป็น string
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // กรณีอื่น ๆ
    else {
      const fallbackDisplay = buildFallbackDisplayFromContent(content);
      if (fallbackDisplay) {
        displayContent = fallbackDisplay.html;
        contentType = fallbackDisplay.contentType;
        plainText = fallbackDisplay.plainText;
      } else {
        displayContent =
          '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
        contentType = "error";
        plainText = "";
      }
    }

    return {
      displayContent: displayContent,
      contentType: contentType,
      plainText,
    };
  } catch (error) {
    console.error(
      "[ProcessQueueV2] ข้อผิดพลาดในการประมวลผลข้อความจากคิว:",
      error,
    );
    return {
      displayContent:
        '<div class="message-text text-danger">เกิดข้อผิดพลาดในการประมวลผลข้อความ</div>',
      contentType: "error",
      plainText: "",
    };
  }
}

/**
 * ฟังก์ชันสำหรับสร้าง HTML สำหรับรูปภาพ
 * @param {Object} imageData - ข้อมูลรูปภาพ
 * @param {number} index - ดัชนีของรูปภาพ
 * @returns {string} HTML สำหรับแสดงรูปภาพ
 */
function buildAudioAttachmentDisplay(audioData = {}, index = 0) {
  try {
    const labelCandidates = [
      audioData.description,
      audioData.text,
      audioData.title,
      audioData.fileName,
      audioData.filename,
      audioData.name,
      audioData?.payload?.label,
      audioData?.payload?.title,
      audioData?.payload?.description,
    ];
    const label =
      labelCandidates.find(
        (value) => typeof value === "string" && value.trim().length > 0,
      ) || `ไฟล์เสียงที่ ${index + 1}`;

    const rawDuration =
      typeof audioData.duration === "number"
        ? audioData.duration
        : typeof audioData?.payload?.duration === "number"
          ? audioData.payload.duration
          : null;

    let durationLabel = "";
    if (Number.isFinite(rawDuration) && rawDuration > 0) {
      const durationSeconds =
        rawDuration > 1000
          ? Math.round(rawDuration / 1000)
          : Math.round(rawDuration);
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      durationLabel =
        minutes > 0
          ? `${minutes} นาที ${seconds.toString().padStart(2, "0")} วินาที`
          : `${seconds} วินาที`;
    }

    const audioUrlCandidate =
      typeof audioData.url === "string"
        ? audioData.url
        : typeof audioData?.payload?.url === "string"
          ? audioData.payload.url
          : null;
    const audioUrl =
      typeof audioUrlCandidate === "string" && audioUrlCandidate.trim()
        ? audioUrlCandidate.trim()
        : null;

    const escapeHtml = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const escapeAttribute = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    let html =
      '<div class="message-text text-muted d-inline-flex align-items-center gap-2">';
    html += '<i class="fas fa-microphone"></i>';
    html += `<span>${escapeHtml(label)}</span>`;
    if (durationLabel) {
      html += `<span class="small">(${escapeHtml(durationLabel)})</span>`;
    }
    if (audioUrl) {
      html += `<a href="${escapeAttribute(audioUrl)}" target="_blank" rel="noopener" class="ms-2">ดาวน์โหลด</a>`;
    }
    html += "</div>";

    const plainParts = [
      `[ไฟล์เสียง ${index + 1}]`,
      label,
      durationLabel ? `(${durationLabel})` : "",
      audioUrl ? `ดาวน์โหลด: ${audioUrl}` : "",
    ].filter(Boolean);
    const plainText = plainParts.join(" ").trim();

    return {
      html,
      plainText,
    };
  } catch (error) {
    console.error(
      "[AudioHTML] ข้อผิดพลาดในการสร้าง HTML สำหรับไฟล์เสียง:",
      error,
    );
    return {
      html: '<div class="message-text text-muted">ไม่สามารถแสดงไฟล์เสียงได้</div>',
      plainText: `[ไฟล์เสียง ${index + 1}]`,
    };
  }
}

function createImageHTML(imageData, index = 0) {
  try {
    if (!imageData) {
      return '<div class="message-text text-muted">รูปภาพไม่ถูกต้อง</div>';
    }

    let imageSrc = "";
    let sizeInfo = "";

    // ตรวจสอบว่าเป็น URL หรือ base64
    if (imageData.url) {
      // รูปภาพเป็น URL (เช่น follow-up images)
      imageSrc = imageData.previewUrl || imageData.url;
      sizeInfo = imageData.caption ? `${imageData.caption}` : "รูปภาพ";
    } else if (imageData.base64) {
      // รูปภาพเป็น base64
      let base64Data = imageData.base64;
      let mimeType = "image/jpeg";

      // ตรวจสอบว่า base64 มี Data URL prefix อยู่แล้วหรือไม่
      const dataUrlMatch = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
      if (dataUrlMatch) {
        // มี prefix อยู่แล้ว ใช้ตรงๆ
        mimeType = dataUrlMatch[1];
        base64Data = dataUrlMatch[2];
        imageSrc = imageData.base64;
      } else {
        // ไม่มี prefix ต้องตรวจจับ MIME type จาก signature
        const trimmed = base64Data.trim();
        if (trimmed.startsWith("/9j/")) {
          mimeType = "image/jpeg";
        } else if (trimmed.startsWith("iVBORw0KGgo")) {
          mimeType = "image/png";
        } else if (trimmed.startsWith("R0lGOD")) {
          mimeType = "image/gif";
        } else if (trimmed.startsWith("UklGR")) {
          mimeType = "image/webp";
        }
        imageSrc = `data:${mimeType};base64,${base64Data}`;
      }

      const base64Size = Math.ceil((base64Data.length * 3) / 4);
      const sizeKB = (base64Size / 1024).toFixed(1);
      const formatName = mimeType.split("/")[1].toUpperCase();
      sizeInfo = `รูปภาพ ${formatName} (${sizeKB} KB)`;
    } else {
      return '<div class="message-text text-muted">รูปภาพไม่ถูกต้อง</div>';
    }

    return `
      <div class="message-image">
        <img src="${imageSrc}"
             alt="รูปภาพจากผู้ใช้ ${index + 1}"
             class="img-fluid rounded"
             style="max-width: 200px; max-height: 200px; cursor: pointer;"
             onclick="openImageModal(this.src)"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <div class="image-error-fallback" style="display: none;">
          <i class="fas fa-image text-muted"></i>
          <div class="text-muted small">ไม่สามารถแสดงรูปภาพได้</div>
        </div>
        <div class="image-info">
          <small class="text-muted">
            <i class="fas fa-image me-1"></i>
            ${sizeInfo}
          </small>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("[ImageHTML] ข้อผิดพลาดในการสร้าง HTML สำหรับรูปภาพ:", error);
    return '<div class="message-text text-muted">ไม่สามารถแสดงรูปภาพได้</div>';
  }
}

// ============================ Enhanced Chat History Functions ============================

/**
 * ฟังก์ชันสำหรับดึงประวัติการสนทนาที่แปลงแล้วสำหรับ frontend
 * @param {string} userId - ID ของผู้ใช้
 * @returns {Array} รายการข้อความที่แปลงแล้ว
 */
async function getNormalizedChatHistory(userId, options = {}) {
  try {
    const { applyFilter = false } = options || {};
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    const messages = await coll
      .find(buildChatHistoryUserMatch(userId))
      .sort({ timestamp: 1 })
      .limit(200)
      .toArray();

    const messageIds = messages
      .map((message) => (message?._id ? message._id : null))
      .filter(Boolean);

    let feedbackMap = {};
    if (messageIds.length > 0) {
      const feedbackColl = db.collection("chat_feedback");
      const feedbackDocs = await feedbackColl
        .find({ messageId: { $in: messageIds } })
        .toArray();

      feedbackDocs.forEach((doc) => {
        const key =
          doc?.messageId && typeof doc.messageId.toString === "function"
            ? doc.messageId.toString()
            : doc?.messageIdString || null;
        if (!key) return;
        feedbackMap[key] = {
          feedback: doc.feedback || null,
          notes: doc.notes || "",
          updatedAt: doc.updatedAt || doc.createdAt || null,
        };
      });
    }

    let filterConfig = null;
    if (applyFilter) {
      filterConfig = await loadMessageFilterConfig();

      if (
        !filterConfig.enableFiltering ||
        !filterConfig.hiddenWords ||
        String(filterConfig.hiddenWords).trim() === ""
      ) {
        filterConfig = null;
      }
    }

    // แปลงข้อความแต่ละข้อความ
    const normalizedMessages = await Promise.all(
      messages.map(async (message) => {
        const normalized = normalizeMessageForFrontend(message);

        const messageIdStr =
          message?._id && typeof message._id.toString === "function"
            ? message._id.toString()
            : null;
        if (messageIdStr && feedbackMap[messageIdStr]) {
          const feedbackInfo = feedbackMap[messageIdStr];
          normalized.feedback = feedbackInfo.feedback;
          if (feedbackInfo.notes) {
            normalized.feedbackNotes = feedbackInfo.notes;
          }
          if (feedbackInfo.updatedAt) {
            normalized.feedbackUpdatedAt = feedbackInfo.updatedAt;
          }
        }

        if (
          filterConfig &&
          normalized.role === "user" &&
          normalized.contentType === "text" &&
          typeof normalized.content === "string" &&
          normalized.content.length > 0
        ) {
          const filtered = await filterMessage(normalized.content, {
            config: filterConfig,
          });

          if (filtered !== normalized.content) {
            normalized.originalContent = normalized.content;
          }
          normalized.content = filtered;
          if (normalized.contentType === "text") {
            normalized.displayContent = filtered;
          }
        }

        return normalized;
      }),
    );

    return normalizedMessages;
  } catch (error) {
    console.error(
      "[NormalizedHistory] ข้อผิดพลาดในการดึงประวัติการสนทนา:",
      error,
    );
    return [];
  }
}

/**
 * ฟังก์ชันสำหรับดึงรายชื่อผู้ใช้พร้อมข้อความล่าสุดที่แปลงแล้ว
 * @returns {Array} รายการผู้ใช้พร้อมข้อมูลที่แปลงแล้ว
 */
async function getNormalizedChatUsers(options = {}) {
  try {
    const { applyFilter = false, focusUserId = "" } = options || {};
    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");
    const profileColl = db.collection("user_profiles");
    const followColl = db.collection("follow_up_status");

    // ดึงข้อมูลผู้ใช้ด้วย aggregation
    const pipeline = [
      {
        $addFields: {
          senderKey: {
            $let: {
              vars: {
                raw: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$senderId", null] },
                        { $eq: ["$senderId", ""] },
                      ],
                    },
                    "$userId",
                    "$senderId",
                  ],
                },
              },
              in: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$$raw", null] },
                      { $eq: ["$$raw", ""] },
                    ],
                  },
                  null,
                  { $toString: "$$raw" },
                ],
              },
            },
          },
        },
      },
      { $match: { senderKey: { $nin: [null, ""] } } },
      {
        $group: {
          _id: "$senderKey",
          lastMessage: { $last: "$content" },
          lastTimestamp: { $last: "$timestamp" },
          messageCount: { $sum: 1 },
          platform: { $last: "$platform" },
          botId: { $last: "$botId" },
        },
      },
      {
        $sort: { lastTimestamp: -1 },
      },
      {
        $limit: 50,
      },
    ];

    const users = await chatColl.aggregate(pipeline).toArray();

    const normalizedFocusUserId =
      typeof focusUserId === "string" ? focusUserId.trim() : "";
    if (normalizedFocusUserId) {
      const exists = users.some(
        (user) =>
          (typeof user._id === "string"
            ? user._id
            : user._id?.toString?.() || "") === normalizedFocusUserId,
      );
      if (!exists) {
        const focusPipeline = [
          {
            $addFields: {
              senderKey: {
                $let: {
                  vars: {
                    raw: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ["$senderId", null] },
                            { $eq: ["$senderId", ""] },
                          ],
                        },
                        "$userId",
                        "$senderId",
                      ],
                    },
                  },
                  in: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ["$$raw", null] },
                          { $eq: ["$$raw", ""] },
                        ],
                      },
                      null,
                      { $toString: "$$raw" },
                    ],
                  },
                },
              },
            },
          },
          { $match: { senderKey: normalizedFocusUserId } },
          {
            $group: {
              _id: "$senderKey",
              lastMessage: { $last: "$content" },
              lastTimestamp: { $last: "$timestamp" },
              messageCount: { $sum: 1 },
              platform: { $last: "$platform" },
              botId: { $last: "$botId" },
            },
          },
          { $sort: { lastTimestamp: -1 } },
          { $limit: 1 },
        ];
        const focusUsers = await chatColl.aggregate(focusPipeline).toArray();
        if (focusUsers.length > 0) {
          users.unshift(focusUsers[0]);
        }
      }
    }

    // Map botId -> bot display name for showing channel in chat user list
    const botIdsByPlatform = { line: new Set(), facebook: new Set() };
    users.forEach((user) => {
      const platform =
        typeof user.platform === "string" ? user.platform.toLowerCase() : "line";
      const botId = normalizeFollowUpBotId(user.botId);
      if (!botId) return;
      if (platform === "facebook") {
        botIdsByPlatform.facebook.add(botId);
      } else if (platform === "line") {
        botIdsByPlatform.line.add(botId);
      }
    });

    const lineBotObjectIds = [...botIdsByPlatform.line]
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const facebookBotObjectIds = [...botIdsByPlatform.facebook]
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const [lineBotDocs, facebookBotDocs] = await Promise.all([
      lineBotObjectIds.length > 0
        ? db
          .collection("line_bots")
          .find({ _id: { $in: lineBotObjectIds } })
          .project({ _id: 1, name: 1, displayName: 1, botName: 1 })
          .toArray()
        : [],
      facebookBotObjectIds.length > 0
        ? db
          .collection("facebook_bots")
          .find({ _id: { $in: facebookBotObjectIds } })
          .project({ _id: 1, name: 1, pageName: 1, pageId: 1 })
          .toArray()
        : [],
    ]);

    const botNameMap = {
      line: new Map(),
      facebook: new Map(),
    };
    lineBotDocs.forEach((bot) => {
      const id = bot?._id?.toString?.() || "";
      if (!id) return;
      botNameMap.line.set(
        id,
        bot.name ||
        bot.displayName ||
        bot.botName ||
        `LINE Bot (${id.slice(-4)})`,
      );
    });
    facebookBotDocs.forEach((bot) => {
      const id = bot?._id?.toString?.() || "";
      if (!id) return;
      botNameMap.facebook.set(
        id,
        bot.pageName || bot.name || `Facebook Page (${id.slice(-4)})`,
      );
    });

    const buildChannelInfo = (platform, botId) => {
      const normalizedPlatform =
        typeof platform === "string" ? platform.toLowerCase() : "line";
      const normalizedBotId = normalizeFollowUpBotId(botId);
      const platformLabel =
        normalizedPlatform === "facebook"
          ? "Facebook"
          : normalizedPlatform === "line"
            ? "LINE"
            : String(platform || "");
      const resolvedName =
        normalizedPlatform === "facebook"
          ? botNameMap.facebook.get(normalizedBotId)
          : normalizedPlatform === "line"
            ? botNameMap.line.get(normalizedBotId)
            : null;
      return {
        platformLabel,
        botName: resolvedName || null,
        channelLabel: resolvedName
          ? `${platformLabel} · ${resolvedName}`
          : platformLabel,
      };
    };

    const userIds = users.map((user) => user._id).filter(Boolean);
    const followStatuses =
      userIds.length > 0
        ? await followColl.find({ senderId: { $in: userIds } }).toArray()
        : [];
    const followMap = {};
    followStatuses.forEach((status) => {
      followMap[status.senderId] = status;
    });

    // ดึงข้อมูลแท็ก
    const tagsColl = db.collection("user_tags");
    const userTags =
      userIds.length > 0
        ? await tagsColl.find({ userId: { $in: userIds } }).toArray()
        : [];
    const tagsMap = {};
    userTags.forEach((userTag) => {
      tagsMap[userTag.userId] = userTag.tags || [];
    });

    // ดึงข้อมูลสถานะการซื้อ
    const purchaseColl = db.collection("user_purchase_status");
    const purchaseStatuses =
      userIds.length > 0
        ? await purchaseColl.find({ userId: { $in: userIds } }).toArray()
        : [];
    const purchaseMap = {};
    purchaseStatuses.forEach((status) => {
      purchaseMap[status.userId] = status.hasPurchased;
    });

    const profileDocs =
      userIds.length > 0
        ? await profileColl
          .find({ userId: { $in: userIds } })
          .project({
            userId: 1,
            platform: 1,
            displayName: 1,
            pictureUrl: 1,
            statusMessage: 1,
          })
          .toArray()
        : [];
    const profileMap = new Map();
    profileDocs.forEach((doc) => {
      const key = `${doc.userId}:${doc.platform || "line"}`;
      profileMap.set(key, doc);
    });

    // ดึงข้อมูลออเดอร์
    const ordersColl = db.collection("orders");
    const userOrders =
      userIds.length > 0
        ? await ordersColl.find({ userId: { $in: userIds } }).toArray()
        : [];
    const ordersMap = {};
    userOrders.forEach((order) => {
      if (!ordersMap[order.userId]) {
        ordersMap[order.userId] = [];
      }
      ordersMap[order.userId].push(order);
    });

    // ดึงงานติดตาม (follow-up tasks) ที่ยัง active
    const followUpTaskColl = db.collection("follow_up_tasks");
    const followUpTasks =
      userIds.length > 0
        ? await followUpTaskColl
          .find({
            userId: { $in: userIds },
            canceled: { $ne: true },
            completed: { $ne: true },
            nextScheduledAt: { $ne: null },
          })
          .project({
            userId: 1,
            platform: 1,
            botId: 1,
            nextScheduledAt: 1,
            nextRoundIndex: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .toArray()
        : [];

    const followUpTaskMap = new Map();
    const followUpTaskByUserId = new Map();
    followUpTasks.forEach((task) => {
      const taskPlatform = task.platform || "line";
      const taskBotId = normalizeFollowUpBotId(task.botId);
      const key = `${task.userId}:${taskPlatform}:${taskBotId || "default"}`;
      const prev = followUpTaskMap.get(key);
      const taskUpdatedAt = task.updatedAt || task.createdAt || null;
      const prevUpdatedAt = prev ? prev.updatedAt || prev.createdAt || null : null;
      const taskTime = taskUpdatedAt ? new Date(taskUpdatedAt).getTime() : 0;
      const prevTime = prevUpdatedAt ? new Date(prevUpdatedAt).getTime() : 0;
      if (!prev || taskTime > prevTime) {
        followUpTaskMap.set(key, task);
      }

      const prevByUser = followUpTaskByUserId.get(task.userId);
      const taskNext = task.nextScheduledAt
        ? new Date(task.nextScheduledAt).getTime()
        : Infinity;
      const prevNext =
        prevByUser && prevByUser.nextScheduledAt
          ? new Date(prevByUser.nextScheduledAt).getTime()
          : Infinity;
      if (!prevByUser || taskNext < prevNext) {
        followUpTaskByUserId.set(task.userId, task);
      }
    });

    const contextCache = new Map();

    let filterConfig = null;
    if (applyFilter) {
      filterConfig = await loadMessageFilterConfig();
      if (
        !filterConfig.enableFiltering ||
        !filterConfig.hiddenWords ||
        String(filterConfig.hiddenWords).trim() === ""
      ) {
        filterConfig = null;
      }
    }

    // แปลงข้อมูลผู้ใช้แต่ละคน
    const normalizedUsers = (
      await Promise.all(
        users.map(async (user) => {
          const userId =
            typeof user._id === "string"
              ? user._id
              : user._id?.toString?.() || "";
          if (!userId) return null;

          const unreadCount = await getUserUnreadCount(userId);
          const platform = user.platform || "line";
          const botId = normalizeFollowUpBotId(user.botId);
          const channelInfo = buildChannelInfo(platform, botId);
          const contextKey = `${platform}:${botId || "default"}`;

          let config = contextCache.get(contextKey);
          if (!config) {
            config = await getFollowUpConfigForContext(platform, botId);
            contextCache.set(contextKey, config);
          }

          // ดึงข้อมูลโปรไฟล์
          const profileKey = `${userId}:${platform}`;
          let userProfile = profileMap.get(profileKey) || null;

          if (platform === "line" && !userProfile) {
            const freshProfile = await saveOrUpdateUserProfile(userId, botId);
            if (freshProfile) {
              userProfile = {
                ...freshProfile,
                platform: "line",
              };
              profileMap.set(profileKey, userProfile);
            }
          }

          // แปลงข้อความล่าสุด
          const normalizedLastMessage = normalizeMessageForFrontend({
            content: user.lastMessage,
            role: "user",
            timestamp: user.lastTimestamp,
          });

          if (
            filterConfig &&
            normalizedLastMessage &&
            typeof normalizedLastMessage.content === "string" &&
            normalizedLastMessage.content.length > 0
          ) {
            const filteredLastMessage = await filterMessage(
              normalizedLastMessage.content,
              { config: filterConfig },
            );
            if (filteredLastMessage !== normalizedLastMessage.content) {
              normalizedLastMessage.originalContent =
                normalizedLastMessage.content;
            }
            normalizedLastMessage.content = filteredLastMessage;
            if (normalizedLastMessage.contentType === "text") {
              normalizedLastMessage.displayContent = filteredLastMessage;
            }
          }

          // ดึงสถานะ AI ต่อผู้ใช้
          let aiEnabled = true;
          try {
            const status = await getUserStatus(userId);
            aiEnabled = !!status.aiEnabled;
          } catch (_) { }

          const followStatus = followMap[userId];
          const showFollowUp = config.showInChat !== false;
          const followUpTaskKey = `${userId}:${platform}:${botId || "default"}`;
          const activeFollowUpTask =
            followUpTaskMap.get(followUpTaskKey) ||
            followUpTaskByUserId.get(userId) ||
            null;
          const hasActiveFollowUpTask = !!activeFollowUpTask;
          const hasFollowUp =
            showFollowUp && followStatus ? !!followStatus.hasFollowUp : false;
          const followUpReason = hasFollowUp
            ? followStatus.followUpReason || ""
            : "";
          const followUpUpdatedAt = hasFollowUp
            ? followStatus.followUpUpdatedAt ||
            followStatus.lastAnalyzedAt ||
            null
            : null;

          // ดึงแท็กของผู้ใช้
          const tags = tagsMap[userId] || [];

          // ดึงสถานะการซื้อ (ถ้ามี manual override ให้ใช้ ถ้าไม่ ให้ใช้จาก follow-up)
          let hasPurchased = false;
          if (typeof purchaseMap[userId] === "boolean") {
            hasPurchased = purchaseMap[userId];
          } else {
            // ใช้ข้อมูลจาก follow-up status
            hasPurchased = hasFollowUp;
          }

          // ดึงข้อมูลออเดอร์
          const userOrders = ordersMap[userId] || [];
          const hasOrders = userOrders.length > 0;
          const orderCount = userOrders.length;

          const profileDisplayName =
            userProfile && typeof userProfile.displayName === "string"
              ? userProfile.displayName.trim()
              : "";
          const fallbackName = userId ? `${userId.substring(0, 8)}...` : "User";

          return {
            userId,
            displayName: profileDisplayName || fallbackName,
            pictureUrl: userProfile ? userProfile.pictureUrl || null : null,
            statusMessage:
              platform === "line" && userProfile
                ? userProfile.statusMessage || null
                : null,
            lastMessage: normalizedLastMessage.displayContent,
            lastMessageRaw: user.lastMessage,
            lastTimestamp: user.lastTimestamp,
            messageCount: user.messageCount,
            unreadCount,
            platform,
            botId,
            platformLabel: channelInfo.platformLabel,
            botName: channelInfo.botName,
            channelLabel: channelInfo.channelLabel,
            aiEnabled,
            hasFollowUp,
            followUpReason,
            followUpUpdatedAt,
            tags,
            hasPurchased,
            hasOrders,
            orderCount,
            followUp: {
              analysisEnabled: config.analysisEnabled !== false,
              showInChat: showFollowUp,
              showInDashboard: config.showInDashboard !== false,
              isFollowUp: showFollowUp && hasActiveFollowUpTask,
              nextScheduledAt: hasActiveFollowUpTask
                ? activeFollowUpTask.nextScheduledAt || null
                : null,
            },
          };
        }),
      )
    ).filter(Boolean);

    return normalizedUsers;
  } catch (error) {
    console.error("[NormalizedUsers] ข้อผิดพลาดในการดึงรายชื่อผู้ใช้:", error);
    return [];
  }
}
