const crypto = require("crypto");

const SHORT_LINK_COLLECTION = "short_links";
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_REGEX = /^[0-9A-Za-z]{5,20}$/;
const DEFAULT_CODE_LENGTH = 7;
const DEFAULT_MAX_ATTEMPTS = 6;

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value);
}

function isValidShortCode(code) {
  if (typeof code !== "string") return false;
  return CODE_REGEX.test(code.trim());
}

function generateShortCode(length = DEFAULT_CODE_LENGTH) {
  const safeLength =
    Number.isInteger(length) && length >= 5 ? length : DEFAULT_CODE_LENGTH;
  const bytes = crypto.randomBytes(safeLength);
  let out = "";
  for (let i = 0; i < safeLength; i += 1) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}

function buildShortLinkUrl(baseUrl, code) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !code) return "";
  return `${base}/s/${code}`;
}

async function createShortLink(db, targetUrl, options = {}) {
  if (!db || typeof db.collection !== "function") return null;
  const normalizedUrl = typeof targetUrl === "string" ? targetUrl.trim() : "";
  if (!normalizedUrl || !isHttpUrl(normalizedUrl)) return null;

  const codeLength = Number.isInteger(options.codeLength)
    ? options.codeLength
    : DEFAULT_CODE_LENGTH;
  const maxAttempts = Number.isInteger(options.maxAttempts)
    ? options.maxAttempts
    : DEFAULT_MAX_ATTEMPTS;
  const expiresAt = options.expiresAt instanceof Date ? options.expiresAt : null;

  const coll = db.collection(SHORT_LINK_COLLECTION);
  const existing = await coll.findOne(
    { targetUrl: normalizedUrl },
    { projection: { code: 1 } },
  );
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateShortCode(codeLength);
    try {
      const doc = {
        code,
        targetUrl: normalizedUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (expiresAt) doc.expiresAt = expiresAt;
      await coll.insertOne(doc);
      return code;
    } catch (err) {
      if (err?.code === 11000) {
        const duplicate = await coll.findOne(
          { targetUrl: normalizedUrl },
          { projection: { code: 1 } },
        );
        if (duplicate?.code) return duplicate.code;
        continue;
      }
      throw err;
    }
  }

  return null;
}

async function resolveShortLink(db, code) {
  if (!db || typeof db.collection !== "function") return null;
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!isValidShortCode(normalized)) return null;
  const coll = db.collection(SHORT_LINK_COLLECTION);
  const doc = await coll.findOne({ code: normalized });
  if (!doc) return null;
  if (doc.expiresAt instanceof Date && doc.expiresAt <= new Date()) return null;
  return doc;
}

module.exports = {
  SHORT_LINK_COLLECTION,
  buildShortLinkUrl,
  createShortLink,
  generateShortCode,
  isValidShortCode,
  normalizeBaseUrl,
  resolveShortLink,
};
