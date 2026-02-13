const axios = require("axios");
const FormData = require("form-data");

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function checkSlipByImageBuffer({
  apiUrl,
  apiKey,
  buffer,
  filename = "slip.jpg",
  contentType = "image/jpeg",
  timeoutMs = 8000,
} = {}) {
  const url = normalizeString(apiUrl);
  const key = normalizeString(apiKey);
  const safeTimeout = normalizePositiveInt(timeoutMs, 8000);

  if (!url) {
    return {
      ok: false,
      status: null,
      code: null,
      message: "SLIPOK_API_URL_MISSING",
      slip: null,
      raw: null,
    };
  }

  if (!key) {
    return {
      ok: false,
      status: null,
      code: null,
      message: "SLIPOK_API_KEY_MISSING",
      slip: null,
      raw: null,
    };
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      ok: false,
      status: null,
      code: null,
      message: "SLIP_IMAGE_MISSING",
      slip: null,
      raw: null,
    };
  }

  const form = new FormData();
  form.append("files", buffer, { filename, contentType });

  try {
    const res = await axios.post(url, form, {
      headers: { ...form.getHeaders(), "x-authorization": key },
      timeout: safeTimeout,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });

    const body = res?.data || null;
    const status = typeof res?.status === "number" ? res.status : null;

    if (status && status >= 200 && status < 300) {
      const slip = body?.data || null;
      return {
        ok: true,
        status,
        code: null,
        message: null,
        slip,
        raw: body,
      };
    }

    return {
      ok: false,
      status,
      code: body?.code ?? null,
      message: body?.message || "SlipOK request failed",
      slip: body?.data || null,
      raw: body,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status || null;
      const body = err.response?.data || null;
      return {
        ok: false,
        status,
        code: body?.code ?? null,
        message: body?.message || err.message || "SlipOK request failed",
        slip: body?.data || null,
        raw: body,
      };
    }

    return {
      ok: false,
      status: null,
      code: null,
      message: err?.message || String(err),
      slip: null,
      raw: null,
    };
  }
}

module.exports = {
  checkSlipByImageBuffer,
};

