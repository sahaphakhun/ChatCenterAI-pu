const line = require("@line/bot-sdk");
const moment = require("moment-timezone");
const { ObjectId } = require("mongodb");
const { extractBase64ImagesFromContent } = require("../utils/chatImageUtils");
const { buildShortLinkUrl, createShortLink } = require("../utils/shortLinks");

function normalizePlatform(value) {
  const platform = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (platform === "facebook") return "facebook";
  return "line";
}

function normalizeIdString(value) {
  if (typeof value === "string") return value.trim();
  if (!value) return "";
  try {
    return value.toString();
  } catch {
    return String(value);
  }
}

function normalizePublicBaseUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value);
}

function buildChatImageUrl(baseUrl, messageId, imageIndex) {
  if (!baseUrl || !messageId) return "";
  return `${baseUrl}/assets/chat-images/${messageId}/${imageIndex}`;
}

function chunkLineMessages(messages, chunkSize = 5) {
  const chunks = [];
  if (!Array.isArray(messages) || messages.length === 0) return chunks;
  for (let index = 0; index < messages.length; index += chunkSize) {
    chunks.push(messages.slice(index, index + chunkSize));
  }
  return chunks;
}

function appendLineToTextMessage(message, line) {
  if (!message || message.type !== "text") return message;
  if (!line) return message;
  const text = typeof message.text === "string" ? message.text : "";
  const updated = text ? `${text}\n${line}` : line;
  const MAX_TEXT_LENGTH = 3900;
  message.text = updated.length > MAX_TEXT_LENGTH ? text : updated;
  return message;
}

async function fetchOrderImageRefs(db, order) {
  const orderId = normalizeIdString(order?._id);
  const senderId = normalizeIdString(order?.userId);
  const orderCreatedAt = order?.extractedAt || order?.createdAt;

  // ถ้าไม่มี senderId ไม่สามารถดึงรูปได้
  if (!senderId) return [];

  // สร้าง query สำหรับดึงรูปภาพ
  const query = {
    senderId,
    role: "user",
  };

  // กรณีที่ 1: มี orderId ที่ valid - ดึงรูปที่ผูกกับ orderId
  // กรณีที่ 2: ไม่มี orderId แต่มีวันที่สร้าง - ดึงรูปจากวันเดียวกัน
  if (ObjectId.isValid(orderId)) {
    // ดึงทั้งรูปที่มี orderId และรูปในวันเดียวกัน
    const dayStart = new Date(orderCreatedAt || new Date());
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    query.$or = [
      { orderId: new ObjectId(orderId) },
      {
        timestamp: { $gte: dayStart, $lt: dayEnd },
        orderId: { $exists: false } // รูปที่ยังไม่ผูกกับ order
      }
    ];
  } else if (orderCreatedAt) {
    // ดึงรูปจากวันที่สร้างออเดอร์
    const dayStart = new Date(orderCreatedAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    query.timestamp = { $gte: dayStart, $lt: dayEnd };
  } else {
    // ไม่มี orderId และไม่มีวันที่ - ไม่สามารถดึงรูปได้
    return [];
  }

  const cursor = db
    .collection("chat_history")
    .find(query)
    .sort({ timestamp: 1 })
    .project({ content: 1 });

  const imageRefs = [];
  const seen = new Set();

  for await (const msg of cursor) {
    const images = extractBase64ImagesFromContent(msg.content);
    if (!images.length) continue;
    const messageId = normalizeIdString(msg?._id);
    if (!messageId) continue;

    images.forEach((_, imageIndex) => {
      const key = `${messageId}:${imageIndex}`;
      if (seen.has(key)) return;
      seen.add(key);
      imageRefs.push({ messageId, imageIndex });
    });
  }

  return imageRefs;
}

function buildLineImageMessages(baseUrl, imageRefs) {
  if (!Array.isArray(imageRefs) || imageRefs.length === 0) return [];
  const normalizedBase = normalizePublicBaseUrl(baseUrl);
  if (!isHttpUrl(normalizedBase)) return [];

  return imageRefs
    .map((ref) => {
      const url = buildChatImageUrl(
        normalizedBase,
        ref.messageId,
        ref.imageIndex,
      );
      if (!url) return null;
      return {
        type: "image",
        originalContentUrl: url,
        previewImageUrl: url,
      };
    })
    .filter(Boolean);
}

async function buildOrderImageMessagesForSummary(
  db,
  orders,
  baseUrl,
  timezone,
) {
  const normalizedBase = normalizePublicBaseUrl(baseUrl);
  if (!isHttpUrl(normalizedBase)) return [];
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) return [];

  const tz = timezone || "Asia/Bangkok";
  const sentKeys = new Set();
  const payloads = [];

  for (const order of list) {
    const userId = normalizeIdString(order?.userId);
    if (!userId) continue;

    const platform = normalizePlatform(order?.platform);
    const dayStamp = (() => {
      const raw = order?.extractedAt || order?.createdAt || order?.updatedAt || null;
      const timeMoment = raw ? moment.tz(raw, tz) : moment.tz(tz);
      return timeMoment.isValid() ? timeMoment.format("YYYY-MM-DD") : "";
    })();
    const key = `${platform}:${userId}:${dayStamp}`;
    if (sentKeys.has(key)) continue;
    sentKeys.add(key);

    const imageRefs = await fetchOrderImageRefs(db, order);
    if (!imageRefs.length) continue;

    const orderId = normalizeIdString(order?._id);
    const shortId = orderId ? orderId.slice(-6) : "-";
    payloads.push({
      type: "text",
      text: `📷 รูปภาพจากลูกค้า (ออเดอร์ ${shortId}) จำนวน ${imageRefs.length.toLocaleString()} รูป`,
    });
    payloads.push(...buildLineImageMessages(normalizedBase, imageRefs));
  }

  return payloads;
}

function uniqueSources(sources) {
  if (!Array.isArray(sources)) return [];
  const seen = new Set();
  const out = [];
  sources.forEach((source) => {
    const platform = normalizePlatform(source?.platform);
    const botId = normalizeIdString(source?.botId);
    if (!botId) return;
    const key = `${platform}:${botId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ platform, botId });
  });
  return out;
}

function shouldNotifyChannelForOrder(channel, order) {
  if (!channel || channel.isActive !== true) return false;
  if (
    typeof channel.deliveryMode === "string" &&
    channel.deliveryMode.toLowerCase() === "scheduled"
  ) {
    return false;
  }
  const eventTypes = Array.isArray(channel.eventTypes) ? channel.eventTypes : [];
  if (!eventTypes.includes("new_order")) return false;

  if (channel.receiveFromAllBots === true) return true;

  const orderPlatform = normalizePlatform(order?.platform);
  const orderBotId = normalizeIdString(order?.botId);
  if (!orderBotId) return false;

  const sources = uniqueSources(channel.sources);
  return sources.some(
    (source) => source.platform === orderPlatform && source.botId === orderBotId,
  );
}

function shortenText(value, maxLength) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (!maxLength || maxLength <= 0) return text;
  return text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 1, 0))}…` : text;
}

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `฿${value.toLocaleString()}`;
}

function buildOrderAddress(orderData) {
  const raw = orderData && typeof orderData === "object" ? orderData : {};
  const parts = [
    normalizeIdString(raw.shippingAddress),
    normalizeIdString(raw.addressSubDistrict),
    normalizeIdString(raw.addressDistrict),
    normalizeIdString(raw.addressProvince),
    normalizeIdString(raw.addressPostalCode),
  ].filter(Boolean);
  return parts.join(" ").trim();
}

function extractOrderPhone(orderData) {
  const raw = orderData && typeof orderData === "object" ? orderData : {};
  return (
    normalizeIdString(raw.phone) ||
    normalizeIdString(raw.customerPhone) ||
    normalizeIdString(raw.shippingPhone) ||
    ""
  );
}

function extractPaymentMethod(orderData) {
  const raw = orderData && typeof orderData === "object" ? orderData : {};
  return (
    normalizeIdString(raw.paymentMethod) ||
    normalizeIdString(raw.paymentType) ||
    ""
  );
}

function formatSummaryRange(startAt, endAt, timezone) {
  if (!startAt || !endAt) return "";
  const tz = timezone || "Asia/Bangkok";
  const start = moment.tz(startAt, tz);
  const end = moment.tz(endAt, tz);
  if (!start.isValid() || !end.isValid()) return "";
  if (start.isSame(end, "day")) {
    return `${start.format("DD/MM HH:mm")}-${end.format("HH:mm")}`;
  }
  return `${start.format("DD/MM HH:mm")}-${end.format("DD/MM HH:mm")}`;
}

function estimateLinesLength(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return 0;
  let length = 0;
  lines.forEach((line, index) => {
    length += String(line).length;
    if (index > 0) length += 1;
  });
  return length;
}

function buildOrderSummaryTitle(rangeLabel, isContinued) {
  if (rangeLabel) {
    return isContinued
      ? `📊 สรุปออเดอร์ (${rangeLabel}) (ต่อ)`
      : `📊 สรุปออเดอร์ (${rangeLabel})`;
  }
  return isContinued ? "📊 สรุปออเดอร์ (ต่อ)" : "📊 สรุปออเดอร์";
}

function buildOrderSummaryHeaderLines({
  rangeLabel,
  includeTotals,
  includeTotalAmount,
  totalAmount,
  totalShipping,
  totalOrders,
  isContinued,
}) {
  const lines = [buildOrderSummaryTitle(rangeLabel, isContinued)];

  if (includeTotals) {
    const totalParts = [`รวม ${totalOrders} ออเดอร์`];
    if (includeTotalAmount) {
      const totalText = formatCurrency(totalAmount);
      if (totalText) totalParts.push(`ยอดรวม ${totalText}`);
    }
    lines.push(totalParts.join(" | "));

    if (includeTotalAmount && totalShipping > 0) {
      const shippingText = formatCurrency(totalShipping);
      if (shippingText) {
        lines.push(`ค่าส่งรวม ${shippingText}`);
      }
    }
  }

  lines.push("");
  lines.push("═══════════════════════════");
  return lines;
}

function buildOrderSummaryOrderLines(order, index, options = {}) {
  const cfg = options.settings || {};
  const includeCustomer = cfg.includeCustomer !== false;
  const includeItemsCount = cfg.includeItemsCount !== false;
  const includeItemsDetail = cfg.includeItemsDetail !== false;
  const includeTotalAmount = cfg.includeTotalAmount !== false;
  const includeAddress = cfg.includeAddress !== false;
  const includePhone = cfg.includePhone !== false;
  const includePaymentMethod = cfg.includePaymentMethod !== false;
  const includeChatLink = cfg.includeChatLink !== false;
  const includeFacebookName = cfg.includeFacebookName !== false;
  const shortChatLinks =
    options.shortChatLinks && typeof options.shortChatLinks === "object"
      ? options.shortChatLinks
      : null;
  const publicBaseUrl = options.publicBaseUrl || "";
  const base =
    typeof publicBaseUrl === "string" ? publicBaseUrl.replace(/\/$/, "") : "";

  const orderId = normalizeIdString(order?._id);
  const shortId = orderId ? orderId.slice(-6) : "-";
  const orderData = order?.orderData || {};
  const userId = normalizeIdString(order?.userId);
  const platform = normalizeIdString(order?.platform) || "line";

  const lines = [`🛒 ออเดอร์ #${index + 1} (ID: ${shortId})`];

  // 1. ชื่อ Facebook (ถ้ามี)
  const facebookName = normalizeIdString(
    order?.facebookName || orderData.facebookName || order?.senderName || "",
  );
  if (includeFacebookName && facebookName && platform === "facebook") {
    lines.push(`📘 Facebook: ${shortenText(facebookName, 60)}`);
  }

  // ชื่อลูกค้า
  if (includeCustomer) {
    const customerName =
      normalizeIdString(orderData.recipientName) ||
      normalizeIdString(orderData.customerName) ||
      "";
    if (customerName) {
      lines.push(`👤 ผู้รับ: ${shortenText(customerName, 60)}`);
    }
  }

  // 2. รายละเอียดสินค้า
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  if (includeItemsDetail && items.length) {
    const normalizedItems = items.map(normalizeOrderItem).filter(Boolean);
    if (normalizedItems.length) {
      const maxItems = 5; // จำกัดสินค้าต่อออเดอร์ในโหมดสรุป
      normalizedItems.slice(0, maxItems).forEach((item) => {
        const colorPart = item.color ? ` (${item.color})` : "";
        const pricePart = item.price !== null ? ` @${formatCurrency(item.price)}` : "";
        lines.push(`  🔸 ${item.name}${colorPart} x${item.quantity}${pricePart}`);
      });
      if (normalizedItems.length > maxItems) {
        lines.push(`  … +${normalizedItems.length - maxItems} รายการ`);
      }
    }
  } else if (includeItemsCount) {
    lines.push(`📝 สินค้า: ${items.length} รายการ`);
  }

  // เบอร์โทร
  const phone = extractOrderPhone(orderData);
  if (includePhone && phone) {
    lines.push(`📞 ${shortenText(phone, 40)}`);
  }

  // 3. ที่อยู่จัดส่ง
  const address = buildOrderAddress(orderData);
  if (includeAddress && address) {
    lines.push(`📍 ${shortenText(address, 200)}`);
  }

  // 4. วิธีการชำระเงิน
  const paymentMethod = extractPaymentMethod(orderData);
  if (includePaymentMethod && paymentMethod) {
    lines.push(`💳 ${shortenText(paymentMethod, 60)}`);
  }

  // ยอดรวม
  if (includeTotalAmount) {
    const amount = orderData.totalAmount;
    const shipping = orderData.shippingCost || 0;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      let amountText = `💰 ${formatCurrency(amount)}`;
      if (shipping > 0) {
        amountText += ` (ค่าส่ง ${formatCurrency(shipping)})`;
      }
      lines.push(amountText);
    }
  }

  // 5. ลิงก์ไปหน้าแชท
  if (includeChatLink && userId) {
    const shortChatLink = shortChatLinks && userId ? shortChatLinks[userId] : "";
    if (shortChatLink) {
      lines.push(`💬 ${shortChatLink}`);
    } else if (base) {
      lines.push(`💬 ${base}/admin/chat?userId=${encodeURIComponent(userId)}`);
    }
  }

  lines.push("───────────────────────────");
  return lines;
}

function formatOrderSummaryMessages(orders, options = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const cfg = options.settings || {};
  const includeTotalAmount = cfg.includeTotalAmount !== false;
  const timezone = options.timezone || "Asia/Bangkok";
  const rangeLabel = formatSummaryRange(options.startAt, options.endAt, timezone);

  let totalAmount = 0;
  let totalShipping = 0;
  list.forEach((order) => {
    const orderData = order?.orderData || {};
    const amount = orderData.totalAmount;
    const shipping = orderData.shippingCost;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      totalAmount += amount;
    }
    if (typeof shipping === "number" && Number.isFinite(shipping)) {
      totalShipping += shipping;
    }
  });

  const MAX_TEXT_LENGTH = 3900;
  const MAX_ORDERS_PER_MESSAGE = 5;

  if (!list.length) {
    const lines = [
      buildOrderSummaryTitle(rangeLabel, false),
    ];
    const totalParts = [`รวม ${list.length} ออเดอร์`];
    if (includeTotalAmount) {
      const totalText = formatCurrency(totalAmount);
      if (totalText) totalParts.push(`ยอดรวม ${totalText}`);
    }
    lines.push(totalParts.join(" | "));
    if (includeTotalAmount && totalShipping > 0) {
      const shippingText = formatCurrency(totalShipping);
      if (shippingText) {
        lines.push(`ค่าส่งรวม ${shippingText}`);
      }
    }
    lines.push("ไม่มีออเดอร์ในรอบนี้");
    const text = lines.join("\n");
    return [
      {
        type: "text",
        text:
          text.length > MAX_TEXT_LENGTH
            ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`
            : text,
      },
    ];
  }

  const orderBlocks = list.map((order, index) => {
    const lines = buildOrderSummaryOrderLines(order, index, options);
    return { lines, length: estimateLinesLength(lines) };
  });

  const messages = [];
  let currentLines = [];
  let currentLength = 0;
  let currentCount = 0;

  let headerLines = buildOrderSummaryHeaderLines({
    rangeLabel,
    includeTotals: true,
    includeTotalAmount,
    totalAmount,
    totalShipping,
    totalOrders: list.length,
    isContinued: false,
  });
  let headerLength = estimateLinesLength(headerLines);

  const flushCurrent = () => {
    if (!currentCount) return;
    const combined = headerLines.concat(currentLines);
    const text = combined.join("\n");
    messages.push({
      type: "text",
      text:
        text.length > MAX_TEXT_LENGTH
          ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`
          : text,
    });
    currentLines = [];
    currentLength = 0;
    currentCount = 0;
  };

  for (const block of orderBlocks) {
    const nextLength = currentLength
      ? currentLength + 1 + block.length
      : block.length;
    const candidateLength = headerLength + 1 + nextLength;
    const shouldStartNew =
      currentCount >= MAX_ORDERS_PER_MESSAGE ||
      (candidateLength > MAX_TEXT_LENGTH && currentCount > 0);

    if (shouldStartNew) {
      flushCurrent();
      headerLines = buildOrderSummaryHeaderLines({
        rangeLabel,
        includeTotals: false,
        includeTotalAmount,
        totalAmount,
        totalShipping,
        totalOrders: list.length,
        isContinued: true,
      });
      headerLength = estimateLinesLength(headerLines);
    }

    if (currentLength) {
      currentLines.push(...block.lines);
      currentLength += 1 + block.length;
    } else {
      currentLines = block.lines.slice();
      currentLength = block.length;
    }
    currentCount += 1;
  }

  flushCurrent();

  return messages;
}

function normalizeOrderItem(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const name = shortenText(item, 120);
    return name ? { name, quantity: 1, price: null } : null;
  }

  if (typeof item !== "object") return null;

  const nameRaw =
    item.product || item.shippingName || item.name || item.title || "สินค้า";
  const colorRaw = item.color || item.variant || "";
  const quantityRaw = item.quantity ?? item.qty ?? item.count ?? 1;
  const priceRaw = item.price ?? item.amount ?? item.unitPrice ?? null;

  const name = shortenText(nameRaw, 120);
  const color = shortenText(colorRaw, 60);
  const quantity =
    typeof quantityRaw === "number" && Number.isFinite(quantityRaw) && quantityRaw > 0
      ? Math.floor(quantityRaw)
      : 1;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw) && priceRaw >= 0
      ? priceRaw
      : null;

  return { name, color, quantity, price };
}

function parseNumberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getOrderTimestamp(order) {
  const raw = order?.extractedAt || order?.createdAt || order?.updatedAt || null;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getOrderTotalAmountForDedup(order) {
  const orderData = order?.orderData || {};
  const totalDirect = parseNumberValue(orderData.totalAmount);
  if (Number.isFinite(totalDirect)) return totalDirect;

  let total = 0;
  let hasNumeric = false;
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  items.forEach((item) => {
    const price = parseNumberValue(
      item?.price ?? item?.amount ?? item?.unitPrice ?? null,
    );
    if (!Number.isFinite(price)) return;
    const qtyRaw = item?.quantity ?? item?.qty ?? item?.count ?? 1;
    const qty = parseNumberValue(qtyRaw);
    const quantity =
      Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
    total += price * quantity;
    hasNumeric = true;
  });

  const shipping = parseNumberValue(orderData.shippingCost);
  if (Number.isFinite(shipping)) {
    total += shipping;
    hasNumeric = true;
  }

  return hasNumeric ? total : null;
}

function buildOrderDedupKey(order) {
  const userId = normalizeIdString(order?.userId);
  if (!userId) return null;
  const total = getOrderTotalAmountForDedup(order);
  if (!Number.isFinite(total)) return null;
  const platform = normalizePlatform(order?.platform);
  const normalizedTotal = Math.round(total * 100) / 100;
  return `${platform}:${userId}|${normalizedTotal.toFixed(2)}`;
}

function dedupeOrdersByUserAndTotal(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const bestByKey = new Map();

  list.forEach((order, index) => {
    const key = buildOrderDedupKey(order);
    if (!key) return;
    const timestamp = getOrderTimestamp(order);
    const existing = bestByKey.get(key);
    if (
      !existing ||
      timestamp > existing.timestamp ||
      (timestamp === existing.timestamp && index > existing.index)
    ) {
      bestByKey.set(key, { index, timestamp });
    }
  });

  return list.filter((order, index) => {
    const key = buildOrderDedupKey(order);
    if (!key) return true;
    const best = bestByKey.get(key);
    return best && best.index === index;
  });
}

function formatNewOrderMessage(order, settings, publicBaseUrl, options = {}) {
  const cfg = settings || {};
  // เปิดการแสดงข้อมูลทั้งหมดเป็นค่าเริ่มต้น
  const includeCustomer = cfg.includeCustomer !== false;
  const includeItemsCount = cfg.includeItemsCount !== false;
  const includeItemsDetail = cfg.includeItemsDetail !== false;
  const includeTotalAmount = cfg.includeTotalAmount !== false;
  const includeAddress = cfg.includeAddress !== false;
  const includePhone = cfg.includePhone !== false;
  const includePaymentMethod = cfg.includePaymentMethod !== false;
  // เปิด chat link และ order link เป็นค่าเริ่มต้น
  const includeOrderLink = cfg.includeOrderLink !== false;
  const includeChatLink = cfg.includeChatLink !== false;
  const includeFacebookName = cfg.includeFacebookName !== false;
  const chatLinkOverride =
    typeof options.chatLink === "string" ? options.chatLink.trim() : "";

  const orderId = normalizeIdString(order?._id);
  const orderData = order?.orderData || {};
  const userId = normalizeIdString(order?.userId);
  const platform = normalizeIdString(order?.platform) || "line";

  // ชื่อลูกค้า
  const recipientName = normalizeIdString(orderData.recipientName);
  const customerName = normalizeIdString(orderData.customerName);
  const displayName = recipientName || customerName || "";

  // ชื่อ Facebook (ถ้ามี)
  const facebookName = normalizeIdString(order?.facebookName || orderData.facebookName || order?.senderName || "");

  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const totalAmountRaw = orderData.totalAmount;
  const shippingCostRaw = orderData.shippingCost;
  const totalAmount =
    typeof totalAmountRaw === "number" && Number.isFinite(totalAmountRaw)
      ? totalAmountRaw
      : null;
  const shippingCost =
    typeof shippingCostRaw === "number" && Number.isFinite(shippingCostRaw)
      ? shippingCostRaw
      : 0;

  const lines = ["🛒 ออเดอร์ใหม่!", `📦 ID: ${orderId || "-"}`];

  // 1. ชื่อ Facebook (ถ้ามี)
  if (includeFacebookName && facebookName && platform === "facebook") {
    lines.push(`📘 Facebook: ${shortenText(facebookName, 80)}`);
  }

  // ชื่อลูกค้า/ผู้รับ
  if (includeCustomer && displayName) {
    lines.push(`👤 ชื่อผู้รับ: ${displayName}`);
  }

  // แสดงจำนวนสินค้า
  if (includeItemsCount) {
    lines.push(`📝 สินค้า: ${items.length.toLocaleString()} รายการ`);
  }

  // 2. รายละเอียดสินค้าทั้งหมด
  if (includeItemsDetail && items.length) {
    const normalizedItems = items
      .map(normalizeOrderItem)
      .filter(Boolean);
    if (normalizedItems.length) {
      lines.push("🧾 รายการสินค้า:");
      const maxItems = 30; // เพิ่มจาก 20
      normalizedItems.slice(0, maxItems).forEach((item) => {
        const colorPart = item.color ? ` (${item.color})` : "";
        const pricePart = item.price !== null ? ` • ${formatCurrency(item.price)}` : "";
        const subtotal = item.price !== null && item.quantity
          ? ` = ${formatCurrency(item.price * item.quantity)}`
          : "";
        lines.push(`🔸 ${item.name}${colorPart} x${item.quantity}${pricePart}${subtotal}`);
      });
      if (normalizedItems.length > maxItems) {
        lines.push(`… และอีก ${(normalizedItems.length - maxItems).toLocaleString()} รายการ`);
      }
    }
  }

  // เบอร์โทร
  const phone = extractOrderPhone(orderData);
  if (includePhone && phone) {
    lines.push(`📞 เบอร์โทร: ${shortenText(phone, 60)}`);
  }

  // 3. ชื่อและที่อยู่จัดส่ง
  const address = buildOrderAddress(orderData);
  if (includeAddress && address) {
    lines.push(`📍 ที่อยู่จัดส่ง: ${shortenText(address, 400)}`);
  }

  // 4. วิธีการชำระเงิน
  const paymentMethod = extractPaymentMethod(orderData);
  if (includePaymentMethod && paymentMethod) {
    lines.push(`💳 ชำระเงิน: ${shortenText(paymentMethod, 80)}`);
  }

  // ยอดรวม + ค่าส่ง
  if (includeTotalAmount && totalAmount !== null) {
    let amountText = `💰 ยอดรวม: ${formatCurrency(totalAmount)}`;
    if (shippingCost > 0) {
      amountText += ` (รวมค่าส่ง ${formatCurrency(shippingCost)})`;
    }
    lines.push(amountText);
  }

  // 5. ลิงก์ไปหน้า chat ของแอดมิน
  const base =
    typeof publicBaseUrl === "string" ? publicBaseUrl.replace(/\/$/, "") : "";
  if (base) {
    if (includeChatLink && userId) {
      if (chatLinkOverride) {
        lines.push(`💬 ดูแชท: ${chatLinkOverride}`);
      } else {
        lines.push(`💬 ดูแชท: ${base}/admin/chat?userId=${encodeURIComponent(userId)}`);
      }
    }
    if (includeOrderLink) {
      lines.push(`🔗 ดูออเดอร์: ${base}/admin/orders`);
    }
  }

  const text = lines.join("\n");
  const MAX_TEXT_LENGTH = 3900;
  return { type: "text", text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text };
}

async function insertNotificationLog(db, payload) {
  try {
    const logs = db.collection("notification_logs");
    await logs.insertOne({
      channelId: payload.channelId || null,
      orderId: payload.orderId || null,
      eventType: payload.eventType || null,
      status: payload.status || "failed",
      errorMessage: payload.errorMessage || null,
      response: payload.response || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn(
      "[Notifications] ไม่สามารถบันทึก notification log ได้:",
      err?.message || err,
    );
  }
}

function createNotificationService({ connectDB, publicBaseUrl = "" } = {}) {
  if (typeof connectDB !== "function") {
    throw new Error("createNotificationService requires connectDB()");
  }

  const baseUrl =
    typeof publicBaseUrl === "string" ? publicBaseUrl.trim() : "";

  const sendToLineTarget = async (senderBotId, targetId, message) => {
    if (!ObjectId.isValid(senderBotId)) {
      throw new Error("Invalid senderBotId");
    }
    const client = await connectDB();
    const db = client.db("chatbot");
    const bot = await db.collection("line_bots").findOne(
      { _id: new ObjectId(senderBotId) },
      {
        projection: {
          channelAccessToken: 1,
          channelSecret: 1,
          name: 1,
          notificationEnabled: 1,
        },
      },
    );
    if (!bot?.channelAccessToken || !bot?.channelSecret) {
      throw new Error("Sender bot credentials missing");
    }
    if (bot.notificationEnabled === false) {
      throw new Error("Sender bot notifications disabled");
    }
    const lineClient = new line.Client({
      channelAccessToken: bot.channelAccessToken,
      channelSecret: bot.channelSecret,
    });
    return lineClient.pushMessage(targetId, message);
  };

  const sendLineMessagesInChunks = async (senderBotId, targetId, messages) => {
    const normalized = Array.isArray(messages)
      ? messages.filter(Boolean)
      : messages
        ? [messages]
        : [];
    if (!normalized.length) return [];
    const chunks = chunkLineMessages(normalized, 5);
    const responses = [];
    for (const chunk of chunks) {
      const response = await sendToLineTarget(senderBotId, targetId, chunk);
      responses.push(response || null);
    }
    return responses;
  };

  const sendNewOrder = async (orderId) => {
    const orderIdString = normalizeIdString(orderId);
    if (!ObjectId.isValid(orderIdString)) {
      throw new Error("Invalid orderId");
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(orderIdString) });
    if (!order) {
      return { success: false, error: "ORDER_NOT_FOUND" };
    }

    const channels = await db
      .collection("notification_channels")
      .find({
        isActive: true,
        type: "line_group",
        eventTypes: "new_order",
      })
      .toArray();

    const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl);
    const canAttachImages = isHttpUrl(normalizedBaseUrl);
    const canBuildLinks = isHttpUrl(normalizedBaseUrl);
    const orderImageRefs = canAttachImages
      ? await fetchOrderImageRefs(db, order)
      : [];
    const orderImageMessages = canAttachImages
      ? buildLineImageMessages(normalizedBaseUrl, orderImageRefs)
      : [];
    const orderUserId = normalizeIdString(order?.userId);
    let shortChatLink = "";
    if (canBuildLinks && orderUserId) {
      const chatUrl = `${normalizedBaseUrl}/admin/chat?userId=${encodeURIComponent(orderUserId)}`;
      try {
        const code = await createShortLink(db, chatUrl);
        if (code) {
          shortChatLink = buildShortLinkUrl(normalizedBaseUrl, code);
        }
      } catch (err) {
        console.warn(
          "[Notifications] สร้าง short link สำหรับแชทไม่สำเร็จ:",
          err?.message || err,
        );
      }
    }

    let sentCount = 0;
    for (const channel of channels) {
      if (!shouldNotifyChannelForOrder(channel, order)) continue;

      const channelId = normalizeIdString(channel?._id);
      const senderBotId =
        normalizeIdString(channel.senderBotId) || normalizeIdString(channel.botId);
      const targetId = normalizeIdString(channel.groupId || channel.lineGroupId);
      if (!senderBotId || !targetId) continue;

      const message = formatNewOrderMessage(order, channel.settings, baseUrl, {
        chatLink: shortChatLink,
      });
      if (orderImageMessages.length > 0) {
        appendLineToTextMessage(
          message,
          `📷 รูปภาพจากลูกค้า: ${orderImageMessages.length.toLocaleString()} รูป`,
        );
      }

      const payloads =
        orderImageMessages.length > 0
          ? [message, ...orderImageMessages]
          : [message];

      try {
        const response = await sendLineMessagesInChunks(
          senderBotId,
          targetId,
          payloads,
        );
        sentCount += 1;
        await insertNotificationLog(db, {
          channelId,
          orderId: orderIdString,
          eventType: "new_order",
          status: "success",
          response: response || null,
        });
      } catch (err) {
        await insertNotificationLog(db, {
          channelId,
          orderId: orderIdString,
          eventType: "new_order",
          status: "failed",
          errorMessage: err?.message || String(err),
        });
      }
    }

    return { success: true, sentCount };
  };

  const sendOrderSummary = async (channel, options = {}) => {
    const channelDoc = channel && typeof channel === "object" ? channel : {};
    if (channelDoc.isActive !== true) {
      return { success: false, error: "CHANNEL_INACTIVE" };
    }

    const senderBotId =
      normalizeIdString(channelDoc.senderBotId) || normalizeIdString(channelDoc.botId);
    const targetId = normalizeIdString(channelDoc.groupId || channelDoc.lineGroupId);
    if (!senderBotId || !targetId) {
      return { success: false, error: "CHANNEL_MISCONFIGURED" };
    }

    const windowStart = options.windowStart;
    const windowEnd = options.windowEnd;
    if (!(windowStart instanceof Date) || !(windowEnd instanceof Date)) {
      return { success: false, error: "INVALID_WINDOW" };
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    const query = {
      extractedAt: {
        $gte: windowStart,
        $lt: windowEnd,
      },
    };

    if (channelDoc.receiveFromAllBots !== true) {
      const sources = uniqueSources(channelDoc.sources);
      if (!sources.length) {
        return { success: false, error: "NO_SOURCES" };
      }

      query.$or = sources
        .map((source) => {
          const platform = normalizePlatform(source?.platform);
          const botId = normalizeIdString(source?.botId);
          if (!botId) return null;
          const botIdQuery = ObjectId.isValid(botId)
            ? { $in: [botId, new ObjectId(botId)] }
            : botId;
          return { platform, botId: botIdQuery };
        })
        .filter(Boolean);
    }

    const orders = await db
      .collection("orders")
      .find(query)
      .sort({ extractedAt: 1 })
      .toArray();

    const dedupedOrders = dedupeOrdersByUserAndTotal(orders);

    const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl);
    const canBuildLinks = isHttpUrl(normalizedBaseUrl);
    const shortChatLinks = {};
    if (canBuildLinks && dedupedOrders.length) {
      for (const order of dedupedOrders) {
        const userId = normalizeIdString(order?.userId);
        if (!userId || shortChatLinks[userId]) continue;
        const chatUrl = `${normalizedBaseUrl}/admin/chat?userId=${encodeURIComponent(userId)}`;
        try {
          const code = await createShortLink(db, chatUrl);
          if (code) {
            shortChatLinks[userId] = buildShortLinkUrl(normalizedBaseUrl, code);
          }
        } catch (err) {
          console.warn(
            "[Notifications] สร้าง short link สำหรับสรุปออเดอร์ไม่สำเร็จ:",
            err?.message || err,
          );
        }
      }
    }

    const messages = formatOrderSummaryMessages(dedupedOrders, {
      startAt: windowStart,
      endAt: windowEnd,
      timezone: channelDoc.summaryTimezone || "Asia/Bangkok",
      settings: channelDoc.settings || {},
      publicBaseUrl: baseUrl,
      shortChatLinks,
    });

    const channelId = normalizeIdString(channelDoc?._id);

    try {
      const imageMessages = await buildOrderImageMessagesForSummary(
        db,
        dedupedOrders,
        baseUrl,
        channelDoc.summaryTimezone || "Asia/Bangkok",
      );
      const payloads =
        imageMessages.length > 0 ? [...messages, ...imageMessages] : messages;
      const response = await sendLineMessagesInChunks(
        senderBotId,
        targetId,
        payloads,
      );
      await insertNotificationLog(db, {
        channelId,
        orderId: null,
        eventType: "order_summary",
        status: "success",
        response: response || null,
      });
      return { success: true, sentCount: messages.length, orderCount: orders.length };
    } catch (err) {
      await insertNotificationLog(db, {
        channelId,
        orderId: null,
        eventType: "order_summary",
        status: "failed",
        errorMessage: err?.message || String(err),
      });
      return { success: false, error: err?.message || String(err) };
    }
  };

  const testChannel = async (channelId, options = {}) => {
    const channelIdString = normalizeIdString(channelId);
    if (!ObjectId.isValid(channelIdString)) {
      throw new Error("Invalid channelId");
    }

    const text =
      typeof options.text === "string" && options.text.trim()
        ? options.text.trim()
        : `✅ ทดสอบการแจ้งเตือนสำเร็จ (${new Date().toLocaleString("th-TH")})`;

    const client = await connectDB();
    const db = client.db("chatbot");

    const channel = await db
      .collection("notification_channels")
      .findOne({ _id: new ObjectId(channelIdString) });
    if (!channel) {
      return { success: false, error: "CHANNEL_NOT_FOUND" };
    }

    const senderBotId =
      normalizeIdString(channel.senderBotId) || normalizeIdString(channel.botId);
    const targetId = normalizeIdString(channel.groupId || channel.lineGroupId);
    if (!senderBotId || !targetId) {
      return { success: false, error: "CHANNEL_MISCONFIGURED" };
    }

    try {
      const response = await sendToLineTarget(senderBotId, targetId, {
        type: "text",
        text,
      });
      await insertNotificationLog(db, {
        channelId: channelIdString,
        orderId: null,
        eventType: "test",
        status: "success",
        response: response || null,
      });
      return { success: true };
    } catch (err) {
      await insertNotificationLog(db, {
        channelId: channelIdString,
        orderId: null,
        eventType: "test",
        status: "failed",
        errorMessage: err?.message || String(err),
      });
      return { success: false, error: err?.message || String(err) };
    }
  };

  return {
    sendNewOrder,
    sendOrderSummary,
    testChannel,
  };
}

module.exports = createNotificationService;
