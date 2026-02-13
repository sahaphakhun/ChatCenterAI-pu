function parseJsonIfPossible(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return value;
  }
}

function normalizeBase64ImageValue(value) {
  if (typeof value !== "string") return null;
  let trimmed = value.trim();
  if (!trimmed) return null;

  let mime = "";
  const dataUrlMatch = trimmed.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/,
  );
  if (dataUrlMatch) {
    mime = dataUrlMatch[1];
    trimmed = dataUrlMatch[2] || "";
  }

  const compact = trimmed.replace(/\s+/g, "");
  if (!compact) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null;

  return { base64: compact, mime: mime || null };
}

function extractBase64ImagesFromContent(content) {
  const parsed = parseJsonIfPossible(content);
  const images = [];

  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;

    if (node.type === "image") {
      const payload = normalizeBase64ImageValue(node.base64 || node.content);
      if (payload) {
        images.push(payload);
      }
      return;
    }

    if (node.data && typeof node.data === "object") {
      if (node.data.type === "image") {
        const payload = normalizeBase64ImageValue(
          node.data.base64 || node.data.content,
        );
        if (payload) {
          images.push(payload);
        }
        return;
      }
      if (Array.isArray(node.data)) {
        visit(node.data);
      }
    }

    if (Array.isArray(node.content)) {
      visit(node.content);
    }
  };

  visit(parsed);
  return images;
}

function detectImageMimeType(base64, fallback = "image/jpeg") {
  if (typeof base64 !== "string") return fallback;
  const trimmed = base64.trim();
  if (trimmed.startsWith("/9j/")) return "image/jpeg";
  if (trimmed.startsWith("iVBORw0KGgo")) return "image/png";
  if (trimmed.startsWith("R0lGOD")) return "image/gif";
  if (trimmed.startsWith("UklGR")) return "image/webp";
  return fallback;
}

module.exports = {
  extractBase64ImagesFromContent,
  detectImageMimeType,
};
