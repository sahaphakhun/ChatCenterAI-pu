const crypto = require("crypto");
const moment = require("moment-timezone");
const { ObjectId } = require("mongodb");

const DEFAULT_TIMEZONE = "Asia/Bangkok";
const RUN_LOCK_TTL_MS = 4 * 60 * 60 * 1000;

const COLLECTIONS = {
  profiles: "agent_profiles",
  runs: "agent_runs",
  events: "agent_run_events",
  snapshots: "agent_openai_snapshots",
  cursors: "agent_processing_cursors",
  evalCases: "agent_eval_cases",
  evalResults: "agent_eval_results",
  decisionJournal: "agent_decision_journal",
  imageImportLog: "agent_image_import_log",
  accessAudit: "agent_log_access_audit",
};

const CUSTOMER_MODEL_OPTIONS = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-5.2-mini",
];

function generateInstructionId() {
  return `inst_${crypto.randomBytes(6).toString("hex")}`;
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

function normalizePageKey(pageKey) {
  if (typeof pageKey !== "string") return null;
  const trimmed = pageKey.trim().toLowerCase();
  if (!trimmed || !trimmed.includes(":")) return null;
  const [platformPart, ...rest] = trimmed.split(":");
  const platform = platformPart === "facebook" ? "facebook" : platformPart === "line" ? "line" : null;
  const botId = rest.join(":").trim();
  if (!platform || !botId) return null;
  return `${platform}:${botId}`;
}

function normalizePageKeys(pageKeys) {
  if (!Array.isArray(pageKeys)) return [];
  const result = [];
  const seen = new Set();
  for (const key of pageKeys) {
    const normalized = normalizePageKey(key);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parsePageKey(pageKey) {
  const normalized = normalizePageKey(pageKey);
  if (!normalized) return null;
  const [platform, ...rest] = normalized.split(":");
  return {
    pageKey: normalized,
    platform,
    botId: rest.join(":") || null,
  };
}

function extractInstructionCodesFromSelections(selections = []) {
  if (!Array.isArray(selections)) return [];
  const results = [];
  const seen = new Set();
  for (const entry of selections) {
    let code = null;
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry.instructionId === "string" &&
      entry.instructionId.trim()
    ) {
      code = entry.instructionId.trim();
    } else if (typeof entry === "string" && entry.trim()) {
      const value = entry.trim();
      if (/^inst_/i.test(value)) {
        code = value;
      }
    }

    if (!code || seen.has(code)) continue;
    seen.add(code);
    results.push(code);
  }
  return results;
}

function maskValue(value) {
  if (value == null) return value;
  const text = String(value);
  if (!text) return text;
  if (text.length <= 4) return "****";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function maskPayload(payload) {
  if (payload == null) return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => maskPayload(item));
  }
  if (typeof payload !== "object") {
    return payload;
  }

  const masked = {};
  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("authorization") ||
      lowerKey.includes("password") ||
      lowerKey.includes("apikey") ||
      lowerKey.includes("api_key")
    ) {
      masked[key] = maskValue(value);
      continue;
    }

    if (lowerKey.includes("phone") || lowerKey.includes("address") || lowerKey.includes("email")) {
      masked[key] = maskValue(value);
      continue;
    }

    masked[key] = maskPayload(value);
  }
  return masked;
}

class AgentForgeService {
  constructor(connectDB, options = {}) {
    this.connectDB = connectDB;
    this.timezone = options.timezone || DEFAULT_TIMEZONE;
    this._pageAgentCache = new Map();
    this._pageAgentCacheTtlMs = 60 * 1000;

    const encryptionKey =
      process.env.AGENT_LOG_ENCRYPTION_KEY ||
      process.env.ADMIN_SESSION_SECRET ||
      "agent-forge-dev-fallback-key";
    this._encryptionKey = crypto
      .createHash("sha256")
      .update(String(encryptionKey))
      .digest();
  }

  async _db() {
    const client = await this.connectDB();
    return client.db("chatbot");
  }

  async ensureIndexes() {
    const db = await this._db();

    await Promise.all([
      db.collection(COLLECTIONS.profiles).createIndexes([
        { key: { name: 1 } },
        { key: { status: 1 } },
        { key: { pageKeys: 1 } },
      ]),
      db.collection(COLLECTIONS.runs).createIndexes([
        { key: { agentId: 1, startedAt: -1 } },
        { key: { status: 1 } },
        { key: { scheduledFor: 1 } },
      ]),
      db.collection(COLLECTIONS.events).createIndexes([
        { key: { runId: 1, seq: 1 }, unique: true },
        { key: { runId: 1, ts: 1 } },
      ]),
      db.collection(COLLECTIONS.snapshots).createIndexes([
        { key: { runId: 1, turnId: 1, direction: 1 } },
      ]),
      db.collection(COLLECTIONS.cursors).createIndexes([
        { key: { agentId: 1, pageKey: 1 }, unique: true },
      ]),
      db.collection(COLLECTIONS.evalResults).createIndexes([
        { key: { runId: 1, iteration: 1 } },
        { key: { runId: 1, caseId: 1 } },
      ]),
      db.collection(COLLECTIONS.decisionJournal).createIndexes([
        { key: { runId: 1, iteration: 1 } },
      ]),
      db.collection(COLLECTIONS.imageImportLog).createIndexes([
        { key: { pageKey: 1, messageId: 1 }, unique: true },
      ]),
      db.collection(COLLECTIONS.accessAudit).createIndexes([
        { key: { runId: 1, ts: -1 } },
        { key: { viewer: 1, ts: -1 } },
      ]),
    ]);

    await this._ensureDefaultEvalCases();
  }

  async _ensureDefaultEvalCases() {
    const db = await this._db();
    const coll = db.collection(COLLECTIONS.evalCases);

    const defaults = [
      {
        caseId: "price_close",
        category: "sales_close",
        title: "ราคาและปิดการขาย",
        script: "ลูกค้าถามราคาและต้องการตัวเลือกที่ชัดเจน",
      },
      {
        caseId: "missing_size",
        category: "order_data",
        title: "จำนวนแต่ไม่ระบุขนาด",
        script: "ลูกค้าพิมพ์ 3 ขวด โดยไม่บอกขนาด",
      },
      {
        caseId: "payment_qr",
        category: "payment",
        title: "ขอโอน/QR",
        script: "ลูกค้าต้องการโอนเงินและถามบัญชีหรือ QR",
      },
      {
        caseId: "image_ocr",
        category: "ocr",
        title: "อ่านรูปข้อมูลจัดส่ง",
        script: "ลูกค้าส่งรูปที่อยู่/สลิปและข้อมูลไม่ครบ",
      },
      {
        caseId: "ghost_followup",
        category: "followup",
        title: "ลูกค้าหายเกิน 24 ชั่วโมง",
        script: "ลูกค้าคุยค้างและหายไป ต้องมีแนวทาง follow-up ที่เหมาะสม",
      },
    ];

    for (const preset of defaults) {
      await coll.updateOne(
        { agentId: null, caseId: preset.caseId },
        {
          $setOnInsert: {
            ...preset,
            agentId: null,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
  }

  _nowTz() {
    return moment().tz(this.timezone);
  }

  _normalizeProfileInput(input = {}, current = null) {
    const requestedCustomerModel =
      typeof input.customerDefaultModel === "string" && input.customerDefaultModel.trim()
        ? input.customerDefaultModel.trim()
        : current?.customerDefaultModel || "gpt-4.1";
    const customerDefaultModel = CUSTOMER_MODEL_OPTIONS.includes(requestedCustomerModel)
      ? requestedCustomerModel
      : "gpt-4.1";

    const optimizationMode =
      input.optimizationMode === "create-new"
        ? "create-new"
        : input.optimizationMode === "improve"
          ? "improve"
          : current?.optimizationMode || "improve";

    const normalized = {
      name:
        typeof input.name === "string" && input.name.trim()
          ? input.name.trim()
          : current?.name || "Agent Forge",
      mode: input.mode === "ai-live-reply" ? "ai-live-reply" : input.mode === "human-only" ? "human-only" : current?.mode || "human-only",
      pageKeys: normalizePageKeys(input.pageKeys || current?.pageKeys || []),
      instructionId:
        typeof input.instructionId === "string" && input.instructionId.trim()
          ? input.instructionId.trim()
          : current?.instructionId || null,
      runnerModel:
        typeof input.runnerModel === "string" && input.runnerModel.trim()
          ? input.runnerModel.trim()
          : current?.runnerModel || "gpt-5.2",
      runnerThinking:
        typeof input.runnerThinking === "string" && input.runnerThinking.trim()
          ? input.runnerThinking.trim()
          : current?.runnerThinking || "xhigh",
      customerDefaultModel,
      processingEveryDays: Math.max(1, Math.min(30, Number(input.processingEveryDays || current?.processingEveryDays || 1))),
      evaluationWindowDays: Math.max(1, Math.min(30, Number(input.evaluationWindowDays || current?.evaluationWindowDays || 3))),
      ghostThresholdHours: Math.max(1, Math.min(168, Number(input.ghostThresholdHours || current?.ghostThresholdHours || 24))),
      compactionTriggerTokens: Math.max(
        10000,
        Math.min(500000, Number(input.compactionTriggerTokens || current?.compactionTriggerTokens || 220000)),
      ),
      status:
        input.status === "inactive"
          ? "inactive"
          : input.status === "active"
            ? "active"
            : current?.status || "active",
      logPolicy: "forensic_mask",
      unmaskRole: "admin",
      timezone: this.timezone,
      optimizationMode,
      createNewBootstrapDone:
        typeof input.createNewBootstrapDone === "boolean"
          ? input.createNewBootstrapDone
          : typeof current?.createNewBootstrapDone === "boolean"
            ? current.createNewBootstrapDone
            : optimizationMode !== "create-new",
    };

    return normalized;
  }

  getCustomerModelOptions() {
    return [...CUSTOMER_MODEL_OPTIONS];
  }

  _buildCreateNewInstructionTemplate(agentName) {
    const safeName =
      typeof agentName === "string" && agentName.trim()
        ? agentName.trim()
        : "Agent Forge";
    const content = [
      "## บทบาท",
      "คุณคือแอดมินขายสินค้า ตอบสุภาพ สั้น กระชับ และช่วยให้ลูกค้าตัดสินใจง่าย",
      "",
      "## กติกา",
      "1) ตอบเป็นตัวเลือกชัดเจน ไม่เยิ่นเย้อ",
      "2) ถ้าข้อมูลไม่ครบ ให้ถามเฉพาะข้อมูลที่ขาด",
      "3) ถ้าข้อมูลครบ ให้สรุปยอดและข้อมูลจัดส่งในข้อความเดียว",
      "4) ห้ามเดาข้อมูลสินค้า ราคา โปรโมชั่น หรือข้อมูลโอนเงิน",
    ].join("\n");

    return {
      instructionId: generateInstructionId(),
      name: `${safeName} (Auto)`,
      description: "สร้างอัตโนมัติโดย Agent Forge (create-new)",
      dataItems: [
        {
          itemId: "role-and-rules",
          type: "text",
          title: "Role & Rules",
          content,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      conversationStarter: {
        enabled: false,
        messages: [],
        updatedAt: new Date(),
      },
      usageCount: 0,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "agent_forge",
      updatedBy: "agent_forge",
      source: "agent_forge_create_new",
    };
  }

  async _resolveInstructionDoc(instructionRef, db = null) {
    if (!instructionRef) return null;
    const localDb = db || (await this._db());
    const coll = localDb.collection("instructions_v2");
    const objectId = toObjectId(instructionRef);

    if (objectId) {
      const byObjectId = await coll.findOne({ _id: objectId });
      if (byObjectId) return byObjectId;
    }

    const value = String(instructionRef).trim();
    if (!value) return null;
    return coll.findOne({ instructionId: value });
  }

  async createInstructionForAgent(agentName) {
    const db = await this._db();
    const coll = db.collection("instructions_v2");
    const doc = this._buildCreateNewInstructionTemplate(agentName);
    const result = await coll.insertOne(doc);
    return {
      ...doc,
      _id: result.insertedId.toString(),
    };
  }

  async listInstructionOptions() {
    const db = await this._db();
    const coll = db.collection("instructions_v2");
    const rows = await coll
      .find(
        {},
        {
          projection: {
            _id: 1,
            instructionId: 1,
            name: 1,
            updatedAt: 1,
            version: 1,
          },
        },
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    return rows.map((row) => ({
      _id: row._id.toString(),
      instructionId: row.instructionId || null,
      name: row.name || "",
      version: Number.isInteger(row.version) ? row.version : null,
      updatedAt: row.updatedAt || null,
    }));
  }

  async getInstructionUsageMap() {
    const db = await this._db();
    const instructions = await this.listInstructionOptions();

    const [lineBots, facebookBots] = await Promise.all([
      db
        .collection("line_bots")
        .find({}, { projection: { _id: 1, selectedInstructions: 1 } })
        .toArray(),
      db
        .collection("facebook_bots")
        .find({}, { projection: { _id: 1, selectedInstructions: 1 } })
        .toArray(),
    ]);

    const usageByInstructionCode = new Map();
    const upsertUsage = (instructionCode, pageKey) => {
      if (!instructionCode || !pageKey) return;
      if (!usageByInstructionCode.has(instructionCode)) {
        usageByInstructionCode.set(instructionCode, new Set());
      }
      usageByInstructionCode.get(instructionCode).add(pageKey);
    };

    for (const bot of lineBots) {
      const pageKey = `line:${bot._id.toString()}`;
      const codes = extractInstructionCodesFromSelections(bot.selectedInstructions || []);
      for (const code of codes) {
        upsertUsage(code, pageKey);
      }
    }

    for (const bot of facebookBots) {
      const pageKey = `facebook:${bot._id.toString()}`;
      const codes = extractInstructionCodesFromSelections(bot.selectedInstructions || []);
      for (const code of codes) {
        upsertUsage(code, pageKey);
      }
    }

    const usageMap = {};
    for (const instruction of instructions) {
      const codes = new Set();
      if (instruction.instructionId) codes.add(instruction.instructionId);
      if (instruction._id) codes.add(instruction._id);
      const pageKeySet = new Set();
      for (const code of codes) {
        const pages = usageByInstructionCode.get(code);
        if (!pages) continue;
        for (const pageKey of pages) pageKeySet.add(pageKey);
      }
      usageMap[instruction._id] = Array.from(pageKeySet);
    }

    return usageMap;
  }

  async findPagesUsingInstruction(instructionRef) {
    const db = await this._db();
    const instructionDoc = await this._resolveInstructionDoc(instructionRef, db);
    if (!instructionDoc) return [];

    const codes = new Set();
    codes.add(instructionDoc._id.toString());
    if (instructionDoc.instructionId) {
      codes.add(instructionDoc.instructionId);
    }

    const [lineBots, facebookBots] = await Promise.all([
      db
        .collection("line_bots")
        .find({}, { projection: { _id: 1, selectedInstructions: 1 } })
        .toArray(),
      db
        .collection("facebook_bots")
        .find({}, { projection: { _id: 1, selectedInstructions: 1 } })
        .toArray(),
    ]);

    const pages = [];
    for (const bot of lineBots) {
      const selectedCodes = extractInstructionCodesFromSelections(bot.selectedInstructions || []);
      if (selectedCodes.some((code) => codes.has(code))) {
        pages.push(`line:${bot._id.toString()}`);
      }
    }

    for (const bot of facebookBots) {
      const selectedCodes = extractInstructionCodesFromSelections(bot.selectedInstructions || []);
      if (selectedCodes.some((code) => codes.has(code))) {
        pages.push(`facebook:${bot._id.toString()}`);
      }
    }

    return normalizePageKeys(pages);
  }

  async syncAgentConfigToPages(agentOrId, userContext = {}) {
    const db = await this._db();
    const profile =
      typeof agentOrId === "object" && agentOrId
        ? agentOrId
        : await this.getAgentById(agentOrId);
    if (!profile) return { updatedPages: 0 };

    const instructionDoc = profile.instructionId
      ? await this._resolveInstructionDoc(profile.instructionId, db)
      : null;
    const selectedInstructions =
      instructionDoc && instructionDoc.instructionId
        ? [{ instructionId: instructionDoc.instructionId, version: null }]
        : null;

    let updatedPages = 0;
    for (const pageKey of normalizePageKeys(profile.pageKeys || [])) {
      const parsed = parsePageKey(pageKey);
      if (!parsed || !parsed.botId) continue;

      const setDoc = {
        aiModel: profile.customerDefaultModel || "gpt-4.1",
        updatedAt: new Date(),
        agentForge: {
          agentId: profile._id || String(profile._id || ""),
          mode: profile.mode || "human-only",
          optimizationMode: profile.optimizationMode || "improve",
          instructionRef: profile.instructionId || null,
          syncedBy: userContext?.username || "agent_forge",
          syncedAt: new Date(),
        },
      };

      if (selectedInstructions) {
        setDoc.selectedInstructions = selectedInstructions;
      }

      if (parsed.platform === "line") {
        const result = await db.collection("line_bots").updateOne(
          { _id: toObjectId(parsed.botId) || parsed.botId },
          { $set: setDoc },
        );
        if (result.matchedCount > 0) updatedPages += 1;
      } else if (parsed.platform === "facebook") {
        const result = await db.collection("facebook_bots").updateOne(
          { _id: toObjectId(parsed.botId) || parsed.botId },
          { $set: setDoc },
        );
        if (result.matchedCount > 0) updatedPages += 1;
      }
    }

    return {
      updatedPages,
      instructionId: instructionDoc ? instructionDoc._id.toString() : null,
      instructionCode: instructionDoc?.instructionId || null,
      model: profile.customerDefaultModel || "gpt-4.1",
    };
  }

  async markCreateNewBootstrapCompleted(agentId, runId = null) {
    const db = await this._db();
    const objectId = toObjectId(agentId);
    if (!objectId) return null;
    const now = new Date();

    const updated = await db.collection(COLLECTIONS.profiles).findOneAndUpdate(
      {
        _id: objectId,
        optimizationMode: "create-new",
        createNewBootstrapDone: false,
      },
      {
        $set: {
          optimizationMode: "improve",
          createNewBootstrapDone: true,
          mode: "human-only",
          updatedAt: now,
          bootstrapCompletedAt: now,
          bootstrapCompletedRunId: runId ? String(runId) : null,
        },
      },
      { returnDocument: "after" },
    );

    if (!updated) return null;
    this._pageAgentCache.clear();
    return this._formatProfile(updated);
  }

  async createAgent(input = {}, userContext = {}) {
    const db = await this._db();
    const now = new Date();
    const profile = this._normalizeProfileInput(input);

    if (profile.optimizationMode === "create-new") {
      if (profile.mode !== "human-only") {
        throw new Error("create_new_requires_human_only");
      }
      if (!Array.isArray(profile.pageKeys) || profile.pageKeys.length === 0) {
        throw new Error("page_keys_required_for_create_new");
      }
      const createdInstruction = await this.createInstructionForAgent(profile.name);
      profile.instructionId = createdInstruction._id;
      profile.createNewBootstrapDone = false;
    } else {
      if (!profile.instructionId) {
        throw new Error("instruction_required_for_improve");
      }
      const instructionDoc = await this._resolveInstructionDoc(profile.instructionId, db);
      if (!instructionDoc) {
        throw new Error("instruction_not_found");
      }
      const autoPages = await this.findPagesUsingInstruction(profile.instructionId);
      if (autoPages.length === 0) {
        throw new Error("instruction_not_linked_to_pages");
      }
      profile.pageKeys = autoPages;
      profile.createNewBootstrapDone = true;
    }

    const payload = {
      ...profile,
      createdAt: now,
      updatedAt: now,
      createdBy: userContext?.username || "admin",
      updatedBy: userContext?.username || "admin",
      runLockedAt: null,
      runLockOwner: null,
      lastScheduledRunDate: null,
    };

    const result = await db.collection(COLLECTIONS.profiles).insertOne(payload);
    const created = await this.getAgentById(result.insertedId.toString());
    let syncResult = null;
    try {
      syncResult = await this.syncAgentConfigToPages(created, userContext);
    } catch (syncError) {
      syncResult = {
        updatedPages: 0,
        error: syncError?.message || "sync_failed",
      };
    }
    return {
      ...created,
      syncResult,
    };
  }

  async listAgents() {
    const db = await this._db();
    const rows = await db
      .collection(COLLECTIONS.profiles)
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();
    return rows.map((row) => this._formatProfile(row));
  }

  async getAgentById(agentId) {
    const db = await this._db();
    const objectId = toObjectId(agentId);
    if (!objectId) return null;
    const profile = await db.collection(COLLECTIONS.profiles).findOne({ _id: objectId });
    return profile ? this._formatProfile(profile) : null;
  }

  _formatProfile(profile) {
    if (!profile) return null;
    return {
      ...profile,
      _id: profile._id.toString(),
      pageKeys: normalizePageKeys(profile.pageKeys || []),
      optimizationMode:
        profile.optimizationMode === "create-new" ? "create-new" : "improve",
      createNewBootstrapDone:
        typeof profile.createNewBootstrapDone === "boolean"
          ? profile.createNewBootstrapDone
          : profile.optimizationMode === "create-new"
            ? false
            : true,
    };
  }

  async updateAgent(agentId, patch = {}, userContext = {}) {
    const db = await this._db();
    const objectId = toObjectId(agentId);
    if (!objectId) {
      throw new Error("invalid_agent_id");
    }

    const current = await db.collection(COLLECTIONS.profiles).findOne({ _id: objectId });
    if (!current) {
      throw new Error("agent_not_found");
    }

    const normalized = this._normalizeProfileInput({ ...current, ...patch }, current);

    if (normalized.optimizationMode === "create-new") {
      normalized.mode = "human-only";
      if (!Array.isArray(normalized.pageKeys) || normalized.pageKeys.length === 0) {
        throw new Error("page_keys_required_for_create_new");
      }

      // If switching from improve to create-new, create a fresh instruction baseline.
      if (current.optimizationMode !== "create-new") {
        const createdInstruction = await this.createInstructionForAgent(normalized.name);
        normalized.instructionId = createdInstruction._id;
        normalized.createNewBootstrapDone = false;
      }
    } else {
      const instructionExplicitlyPatched = Object.prototype.hasOwnProperty.call(
        patch,
        "instructionId",
      );
      if (!normalized.instructionId && instructionExplicitlyPatched) {
        throw new Error("instruction_required_for_improve");
      }
      if (normalized.instructionId) {
        const instructionDoc = await this._resolveInstructionDoc(normalized.instructionId, db);
        if (!instructionDoc) {
          throw new Error("instruction_not_found");
        }
        const autoPages = await this.findPagesUsingInstruction(normalized.instructionId);
        if (autoPages.length === 0 && instructionExplicitlyPatched) {
          throw new Error("instruction_not_linked_to_pages");
        }
        if (autoPages.length > 0) normalized.pageKeys = autoPages;
      }
      normalized.createNewBootstrapDone = true;
    }

    await db.collection(COLLECTIONS.profiles).updateOne(
      { _id: objectId },
      {
        $set: {
          ...normalized,
          updatedAt: new Date(),
          updatedBy: userContext?.username || "admin",
        },
      },
    );

    this._pageAgentCache.clear();
    const updated = await this.getAgentById(agentId);
    let syncResult = null;
    try {
      syncResult = await this.syncAgentConfigToPages(updated, userContext);
    } catch (syncError) {
      syncResult = {
        updatedPages: 0,
        error: syncError?.message || "sync_failed",
      };
    }
    return {
      ...updated,
      syncResult,
    };
  }

  async updateAgentMode(agentId, mode, userContext = {}) {
    const nextMode = mode === "ai-live-reply" ? "ai-live-reply" : "human-only";
    return this.updateAgent(agentId, { mode: nextMode }, userContext);
  }

  async _detachAgentFromPages(profile) {
    const db = await this._db();
    const pageKeys = normalizePageKeys(profile?.pageKeys || []);
    if (!pageKeys.length) {
      return { attemptedPages: 0, detachedPages: 0 };
    }

    const agentIdString = profile?._id ? String(profile._id) : null;
    const agentIdObject = toObjectId(agentIdString);
    const agentIdCandidates = [];
    if (agentIdString) agentIdCandidates.push(agentIdString);
    if (agentIdObject) agentIdCandidates.push(agentIdObject);

    let detachedPages = 0;

    for (const pageKey of pageKeys) {
      const parsed = parsePageKey(pageKey);
      if (!parsed || !parsed.botId) continue;

      const botObjectId = toObjectId(parsed.botId);
      const collectionName =
        parsed.platform === "line"
          ? "line_bots"
          : parsed.platform === "facebook"
            ? "facebook_bots"
            : null;
      if (!collectionName) continue;

      const filter = {
        _id: botObjectId || parsed.botId,
      };
      if (agentIdCandidates.length > 0) {
        filter["agentForge.agentId"] = { $in: agentIdCandidates };
      }

      const result = await db.collection(collectionName).updateOne(
        filter,
        {
          $unset: { agentForge: "" },
          $set: {
            updatedAt: new Date(),
          },
        },
      );

      if (result.modifiedCount > 0) {
        detachedPages += 1;
      }
    }

    return { attemptedPages: pageKeys.length, detachedPages };
  }

  async deleteAgent(agentId) {
    const db = await this._db();
    const objectId = toObjectId(agentId);
    if (!objectId) {
      throw new Error("invalid_agent_id");
    }

    const profile = await db.collection(COLLECTIONS.profiles).findOne({ _id: objectId });
    if (!profile) {
      throw new Error("agent_not_found");
    }

    let detachResult = {
      attemptedPages: normalizePageKeys(profile.pageKeys || []).length,
      detachedPages: 0,
      error: null,
    };

    try {
      detachResult = await this._detachAgentFromPages(profile);
    } catch (detachError) {
      detachResult.error = detachError?.message || "detach_failed";
    }

    const [deleteResult] = await Promise.all([
      db.collection(COLLECTIONS.profiles).deleteOne({ _id: objectId }),
      db.collection(COLLECTIONS.cursors).deleteMany({ agentId: objectId.toString() }),
    ]);

    this._pageAgentCache.clear();
    return {
      deletedCount: deleteResult.deletedCount || 0,
      detachedPages: detachResult.detachedPages || 0,
      attemptedPages: detachResult.attemptedPages || 0,
      detachError: detachResult.error || null,
    };
  }

  async listManagedPages() {
    const db = await this._db();

    const [lineBots, facebookBots] = await Promise.all([
      db
        .collection("line_bots")
        .find({}, { projection: { _id: 1, name: 1, status: 1, aiModel: 1, selectedInstructions: 1 } })
        .toArray(),
      db
        .collection("facebook_bots")
        .find({}, { projection: { _id: 1, name: 1, status: 1, aiModel: 1, pageId: 1, selectedInstructions: 1 } })
        .toArray(),
    ]);

    const pages = [];
    for (const bot of lineBots) {
      pages.push({
        pageKey: `line:${bot._id.toString()}`,
        platform: "line",
        botId: bot._id.toString(),
        name: bot.name || "LINE Bot",
        status: bot.status || "unknown",
        aiModel: bot.aiModel || null,
        selectedInstructions: bot.selectedInstructions || [],
      });
    }

    for (const bot of facebookBots) {
      pages.push({
        pageKey: `facebook:${bot._id.toString()}`,
        platform: "facebook",
        botId: bot._id.toString(),
        name: bot.name || bot.pageId || "Facebook Page",
        status: bot.status || "unknown",
        aiModel: bot.aiModel || null,
        selectedInstructions: bot.selectedInstructions || [],
      });
    }

    return pages;
  }

  async getPageAgentRuntime(pageKey) {
    const normalized = normalizePageKey(pageKey);
    if (!normalized) {
      return { managed: false, mode: null, agentId: null };
    }

    const cached = this._pageAgentCache.get(normalized);
    if (cached && Date.now() - cached.ts < this._pageAgentCacheTtlMs) {
      return cached.value;
    }

    const db = await this._db();
    const profile = await db.collection(COLLECTIONS.profiles).findOne(
      {
        status: { $in: ["active", "running"] },
        pageKeys: normalized,
      },
      {
        projection: {
          _id: 1,
          mode: 1,
          customerDefaultModel: 1,
          name: 1,
        },
      },
    );

    const value = profile
      ? {
        managed: true,
        agentId: profile._id.toString(),
        agentName: profile.name || null,
        mode: profile.mode || "human-only",
        customerDefaultModel: profile.customerDefaultModel || "gpt-4.1",
      }
      : {
        managed: false,
        agentId: null,
        agentName: null,
        mode: null,
        customerDefaultModel: null,
      };

    this._pageAgentCache.set(normalized, { ts: Date.now(), value });
    return value;
  }

  _buildRunDocument(agentId, options = {}, userContext = {}) {
    const now = new Date();
    const scheduledFor = options.scheduledFor || now;
    return {
      agentId,
      runType: options.runType || "manual",
      dryRun: !!options.dryRun,
      status: "queued",
      scheduledFor,
      startedAt: null,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userContext?.username || "system",
      requestedBy: userContext?.username || "system",
      stopRequestedAt: null,
      stopRequestedBy: null,
      cursorFrom: null,
      cursorTo: null,
      iterations: 0,
      selfTestCount: 0,
      publishedVersion: null,
      _seqCounter: 0,
      meta: {
        timezone: this.timezone,
      },
    };
  }

  async createRun(agentId, options = {}, userContext = {}) {
    const db = await this._db();
    const objectId = toObjectId(agentId);
    if (!objectId) {
      throw new Error("invalid_agent_id");
    }

    const runDoc = this._buildRunDocument(objectId.toString(), options, userContext);
    const result = await db.collection(COLLECTIONS.runs).insertOne(runDoc);
    const run = await this.getRunById(result.insertedId.toString());
    return run;
  }

  async getRunById(runId) {
    const db = await this._db();
    const objectId = toObjectId(runId);
    if (!objectId) return null;
    const run = await db.collection(COLLECTIONS.runs).findOne({ _id: objectId });
    if (!run) return null;
    return this._formatRun(run);
  }

  _formatRun(run) {
    if (!run) return null;
    return {
      ...run,
      _id: run._id.toString(),
    };
  }

  async listRuns(agentId, limit = 50) {
    const db = await this._db();
    const query = {};
    if (agentId) {
      query.agentId = toObjectId(agentId)?.toString() || agentId;
    }
    const rows = await db
      .collection(COLLECTIONS.runs)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
      .toArray();
    return rows.map((row) => this._formatRun(row));
  }

  async requestStopRun(runId, userContext = {}) {
    const db = await this._db();
    const objectId = toObjectId(runId);
    if (!objectId) throw new Error("invalid_run_id");

    await db.collection(COLLECTIONS.runs).updateOne(
      { _id: objectId },
      {
        $set: {
          stopRequestedAt: new Date(),
          stopRequestedBy: userContext?.username || "admin",
          updatedAt: new Date(),
        },
      },
    );

    return this.getRunById(runId);
  }

  async isStopRequested(runId) {
    const db = await this._db();
    const objectId = toObjectId(runId);
    if (!objectId) return false;
    const run = await db
      .collection(COLLECTIONS.runs)
      .findOne({ _id: objectId }, { projection: { stopRequestedAt: 1 } });
    return !!run?.stopRequestedAt;
  }

  async acquireRunLock(agentId, runId, lockOwner = "runner") {
    const db = await this._db();
    const profileId = toObjectId(agentId);
    const runObjectId = toObjectId(runId);
    if (!profileId || !runObjectId) {
      throw new Error("invalid_lock_params");
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - RUN_LOCK_TTL_MS);

    const result = await db.collection(COLLECTIONS.profiles).findOneAndUpdate(
      {
        _id: profileId,
        $or: [
          { status: { $ne: "running" } },
          { runLockedAt: null },
          { runLockedAt: { $exists: false } },
          { runLockedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          status: "running",
          runLockedAt: now,
          runLockOwner: lockOwner,
          runLockRunId: runObjectId.toString(),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );

    if (!result) {
      return { acquired: false, reason: "already_running" };
    }

    await db.collection(COLLECTIONS.runs).updateOne(
      { _id: runObjectId },
      {
        $set: {
          status: "running",
          startedAt: now,
          updatedAt: now,
        },
      },
    );

    return { acquired: true };
  }

  async refreshRunLock(agentId, runId) {
    const db = await this._db();
    const profileId = toObjectId(agentId);
    const runObjectId = toObjectId(runId);
    if (!profileId || !runObjectId) return;

    await db.collection(COLLECTIONS.profiles).updateOne(
      {
        _id: profileId,
        runLockRunId: runObjectId.toString(),
      },
      {
        $set: {
          runLockedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  async releaseRunLock(agentId, runId, nextStatus = "active") {
    const db = await this._db();
    const profileId = toObjectId(agentId);
    const runObjectId = toObjectId(runId);
    if (!profileId || !runObjectId) return;

    await db.collection(COLLECTIONS.profiles).updateOne(
      {
        _id: profileId,
        runLockRunId: runObjectId.toString(),
      },
      {
        $set: {
          status: nextStatus,
          runLockedAt: null,
          runLockOwner: null,
          runLockRunId: null,
          updatedAt: new Date(),
        },
      },
    );
  }

  async updateRun(runId, patch = {}) {
    const db = await this._db();
    const objectId = toObjectId(runId);
    if (!objectId) throw new Error("invalid_run_id");

    await db.collection(COLLECTIONS.runs).updateOne(
      { _id: objectId },
      {
        $set: {
          ...patch,
          updatedAt: new Date(),
        },
      },
    );

    return this.getRunById(runId);
  }

  async finalizeRun(runId, status, patch = {}) {
    const db = await this._db();
    const objectId = toObjectId(runId);
    if (!objectId) throw new Error("invalid_run_id");

    await db.collection(COLLECTIONS.runs).updateOne(
      { _id: objectId },
      {
        $set: {
          status,
          ...patch,
          endedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    return this.getRunById(runId);
  }

  async nextRunSeq(runId) {
    const db = await this._db();
    const objectId = toObjectId(runId);
    if (!objectId) throw new Error("invalid_run_id");

    const updated = await db.collection(COLLECTIONS.runs).findOneAndUpdate(
      { _id: objectId },
      {
        $inc: { _seqCounter: 1 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after", projection: { _seqCounter: 1 } },
    );

    if (!updated || typeof updated._seqCounter !== "number") {
      throw new Error("seq_counter_error");
    }

    return updated._seqCounter;
  }

  async appendRunEvent(runId, eventType, payload = {}, options = {}) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) {
      throw new Error("invalid_run_id");
    }

    const seq = await this.nextRunSeq(runId);
    const now = new Date();

    const eventDoc = {
      runId: runObjectId.toString(),
      seq,
      ts: now,
      phase: options.phase || "runtime",
      eventType,
      payloadMasked: maskPayload(payload),
      payloadRef: options.payloadRef || null,
      createdBy: options.createdBy || "system",
    };

    await db.collection(COLLECTIONS.events).insertOne(eventDoc);
    return eventDoc;
  }

  async listRunEvents(runId, afterSeq = 0, limit = 200) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) {
      return [];
    }

    const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 200));
    const rows = await db
      .collection(COLLECTIONS.events)
      .find({
        runId: runObjectId.toString(),
        seq: { $gt: Number(afterSeq) || 0 },
      })
      .sort({ seq: 1 })
      .limit(safeLimit)
      .toArray();

    return rows.map((row) => ({
      ...row,
      _id: row._id.toString(),
    }));
  }

  _encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this._encryptionKey, iv);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
      v: 1,
    };
  }

  _decrypt(blob) {
    if (!blob || typeof blob !== "object") {
      return null;
    }
    const iv = Buffer.from(blob.iv, "base64");
    const tag = Buffer.from(blob.tag, "base64");
    const ciphertext = Buffer.from(blob.ciphertext, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this._encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  }

  async storeOpenAISnapshot(runId, turnId, direction, payload = {}, usage = null) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) throw new Error("invalid_run_id");

    const masked = maskPayload(payload);
    const encrypted = this._encrypt(payload);

    const doc = {
      runId: runObjectId.toString(),
      turnId: String(turnId || "turn_0"),
      direction: direction === "response" ? "response" : "request",
      payloadMasked: masked,
      payloadEncrypted: encrypted,
      usage: usage || null,
      createdAt: new Date(),
    };

    const result = await db.collection(COLLECTIONS.snapshots).insertOne(doc);
    return {
      ...doc,
      _id: result.insertedId.toString(),
    };
  }

  async listSnapshots(runId, limit = 200, options = {}) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) return [];
    const includePayloadMasked = options.includePayloadMasked === true;
    const projection = includePayloadMasked
      ? { payloadEncrypted: 0 }
      : { payloadMasked: 0, payloadEncrypted: 0 };

    const rows = await db
      .collection(COLLECTIONS.snapshots)
      .find({ runId: runObjectId.toString() }, { projection })
      .sort({ createdAt: 1 })
      .limit(Math.min(500, Math.max(1, Number(limit) || 200)))
      .toArray();

    return rows.map((row) => {
      const formatted = {
        _id: row._id.toString(),
        runId: row.runId,
        turnId: row.turnId,
        direction: row.direction,
        usage: row.usage || null,
        createdAt: row.createdAt,
      };
      if (includePayloadMasked && Object.prototype.hasOwnProperty.call(row, "payloadMasked")) {
        formatted.payloadMasked = row.payloadMasked;
      }
      return formatted;
    });
  }

  async getSnapshot(snapshotId) {
    const db = await this._db();
    const objectId = toObjectId(snapshotId);
    if (!objectId) return null;

    const row = await db.collection(COLLECTIONS.snapshots).findOne({ _id: objectId });
    if (!row) return null;

    return {
      _id: row._id.toString(),
      runId: row.runId,
      turnId: row.turnId,
      direction: row.direction,
      payloadMasked: row.payloadMasked,
      usage: row.usage || null,
      createdAt: row.createdAt,
    };
  }

  async unmaskSnapshot(runId, snapshotId, userContext = {}) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    const snapshotObjectId = toObjectId(snapshotId);
    if (!runObjectId || !snapshotObjectId) {
      throw new Error("invalid_snapshot_id");
    }

    const row = await db.collection(COLLECTIONS.snapshots).findOne({
      _id: snapshotObjectId,
      runId: runObjectId.toString(),
    });

    if (!row) {
      throw new Error("snapshot_not_found");
    }

    const payload = this._decrypt(row.payloadEncrypted);

    await db.collection(COLLECTIONS.accessAudit).insertOne({
      runId: runObjectId.toString(),
      viewer: userContext?.username || "admin",
      action: "unmask_snapshot",
      field: "payloadEncrypted",
      snapshotId: snapshotObjectId.toString(),
      ts: new Date(),
      meta: {
        role: userContext?.role || null,
      },
    });

    return {
      _id: row._id.toString(),
      runId: row.runId,
      turnId: row.turnId,
      direction: row.direction,
      payload,
      usage: row.usage || null,
      createdAt: row.createdAt,
    };
  }

  async logDecisionJournal(runId, iteration, decision, reasoningSummary, actionPlan = null) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) throw new Error("invalid_run_id");

    const doc = {
      runId: runObjectId.toString(),
      iteration,
      decision,
      reasoningSummary: reasoningSummary || null,
      actionPlan: actionPlan || null,
      createdAt: new Date(),
    };

    await db.collection(COLLECTIONS.decisionJournal).insertOne(doc);
    return doc;
  }

  async listDecisionJournal(runId) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) return [];

    const rows = await db
      .collection(COLLECTIONS.decisionJournal)
      .find({ runId: runObjectId.toString() })
      .sort({ iteration: 1, createdAt: 1 })
      .toArray();

    return rows.map((row) => ({
      ...row,
      _id: row._id.toString(),
    }));
  }

  async listEvalCases(agentId = null) {
    const db = await this._db();
    const rows = await db
      .collection(COLLECTIONS.evalCases)
      .find({
        $or: [{ agentId: null }, { agentId: agentId || null }],
        active: true,
      })
      .sort({ category: 1, caseId: 1 })
      .toArray();

    const dedup = new Map();
    for (const row of rows) {
      dedup.set(row.caseId, row);
    }

    return Array.from(dedup.values()).map((row) => ({
      ...row,
      _id: row._id.toString(),
    }));
  }

  async saveEvalResult(runId, iteration, caseResult) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) throw new Error("invalid_run_id");

    const doc = {
      runId: runObjectId.toString(),
      iteration,
      caseId: caseResult.caseId,
      category: caseResult.category || null,
      scores: caseResult.scores || {},
      weightedScore: caseResult.weightedScore || 0,
      passed: !!caseResult.passed,
      violations: caseResult.violations || [],
      transcript: caseResult.transcript || [],
      createdAt: new Date(),
    };

    await db.collection(COLLECTIONS.evalResults).insertOne(doc);
    return doc;
  }

  async listEvalResults(runId, options = {}) {
    const db = await this._db();
    const runObjectId = toObjectId(runId);
    if (!runObjectId) return [];
    const includeTranscript = options.includeTranscript !== false;
    const latestIterationOnly = options.latestIterationOnly === true;
    const query = { runId: runObjectId.toString() };
    const collection = db.collection(COLLECTIONS.evalResults);

    if (latestIterationOnly) {
      const latestRow = await collection
        .find(query, { projection: { iteration: 1 } })
        .sort({ iteration: -1, createdAt: -1 })
        .limit(1)
        .next();

      if (!latestRow) {
        return [];
      }

      query.iteration = latestRow.iteration || 0;
    }

    const rows = await collection
      .find(
        query,
        includeTranscript
          ? {}
          : { projection: { transcript: 0 } },
      )
      .sort({ iteration: 1, createdAt: 1 })
      .toArray();

    return rows.map((row) => ({
      ...row,
      _id: row._id.toString(),
    }));
  }

  async getRunCursors(agentId) {
    const db = await this._db();
    const objectId = toObjectId(agentId);
    if (!objectId) return [];

    const rows = await db
      .collection(COLLECTIONS.cursors)
      .find({ agentId: objectId.toString() })
      .toArray();

    return rows.map((row) => ({
      ...row,
      _id: row._id.toString(),
    }));
  }

  async commitRunAndCursorsAtomic({
    runId,
    agentId,
    cursorUpdates = [],
    instructionPublish = null,
    runPatch = {},
  }) {
    const client = await this.connectDB();
    const db = client.db("chatbot");
    const session = client.startSession();
    const runObjectId = toObjectId(runId);
    const profileObjectId = toObjectId(agentId);

    if (!runObjectId || !profileObjectId) {
      session.endSession();
      throw new Error("invalid_transaction_params");
    }

    try {
      await session.withTransaction(async () => {
        if (instructionPublish) {
          await this._publishInstructionAtomic(db, instructionPublish, session);
        }

        const cursorColl = db.collection(COLLECTIONS.cursors);
        for (const update of cursorUpdates) {
          const normalizedPageKey = normalizePageKey(update.pageKey);
          if (!normalizedPageKey) continue;
          await cursorColl.updateOne(
            {
              agentId: profileObjectId.toString(),
              pageKey: normalizedPageKey,
            },
            {
              $set: {
                agentId: profileObjectId.toString(),
                pageKey: normalizedPageKey,
                lastProcessedAt: update.lastProcessedAt || new Date(),
                lastMessageId: update.lastMessageId || null,
                lastRunId: runObjectId.toString(),
                updatedAt: new Date(),
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            { upsert: true, session },
          );
        }

        await db.collection(COLLECTIONS.runs).updateOne(
          { _id: runObjectId },
          {
            $set: {
              status: runPatch.status || "completed",
              endedAt: runPatch.endedAt || new Date(),
              updatedAt: new Date(),
              ...runPatch,
            },
          },
          { session },
        );

        const profileUpdate = {
          $set: {
            status: "active",
            runLockedAt: null,
            runLockOwner: null,
            runLockRunId: null,
            updatedAt: new Date(),
          },
        };

        if (runPatch.runType === "scheduled") {
          profileUpdate.$set.lastScheduledRunDate = moment()
            .tz(this.timezone)
            .format("YYYY-MM-DD");
        }

        await db.collection(COLLECTIONS.profiles).updateOne(
          { _id: profileObjectId },
          profileUpdate,
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async _publishInstructionAtomic(db, publish, session) {
    const instructionId = toObjectId(publish.instructionId);
    if (!instructionId) {
      throw new Error("invalid_instruction_id");
    }

    const instructionsColl = db.collection("instructions_v2");
    const versionsColl = db.collection("instruction_versions");
    const now = new Date();

    const current = await instructionsColl.findOne({ _id: instructionId }, { session });
    if (!current) {
      throw new Error("instruction_not_found");
    }

    const currentVersion = Number.isInteger(current.version) ? current.version : 0;
    if (publish.expectedVersion != null && Number(publish.expectedVersion) !== currentVersion) {
      throw new Error("instruction_version_conflict");
    }

    const nextVersion = currentVersion + 1;

    const patchText =
      typeof publish.patchText === "string" && publish.patchText.trim()
        ? publish.patchText.trim()
        : "Agent Forge auto-optimized instruction";

    const dataItems = Array.isArray(current.dataItems) ? [...current.dataItems] : [];
    const existingIndex = dataItems.findIndex((item) => item && item.itemId === "agent-forge-auto-summary");
    const summaryItem = {
      itemId: "agent-forge-auto-summary",
      type: "text",
      title: "Agent Forge Auto Summary",
      content: patchText,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      dataItems[existingIndex] = {
        ...dataItems[existingIndex],
        ...summaryItem,
      };
    } else {
      dataItems.push(summaryItem);
    }

    const updateResult = await instructionsColl.findOneAndUpdate(
      {
        _id: instructionId,
        version: currentVersion,
      },
      {
        $set: {
          dataItems,
          version: nextVersion,
          updatedAt: now,
          "agentForge.lastSummary": patchText,
          "agentForge.lastRunId": publish.runId || null,
          "agentForge.lastPublishedAt": now,
        },
      },
      {
        returnDocument: "after",
        session,
      },
    );

    if (!updateResult) {
      throw new Error("instruction_version_conflict");
    }

    await versionsColl.updateOne(
      {
        instructionId: current.instructionId || instructionId.toString(),
        version: nextVersion,
      },
      {
        $set: {
          instructionId: current.instructionId || instructionId.toString(),
          version: nextVersion,
          name: current.name || "",
          description: current.description || "",
          dataItems,
          note: publish.note || "Published by Agent Forge",
          snapshotAt: now,
          savedBy: "agent_forge",
        },
      },
      {
        upsert: true,
        session,
      },
    );

    return {
      instructionId: instructionId.toString(),
      version: nextVersion,
    };
  }

  async markScheduledRunDate(agentId, dateStr) {
    const db = await this._db();
    const profileId = toObjectId(agentId);
    if (!profileId) return;

    await db.collection(COLLECTIONS.profiles).updateOne(
      { _id: profileId },
      {
        $set: {
          lastScheduledRunDate: dateStr,
          updatedAt: new Date(),
        },
      },
    );
  }

  async listAgentsDueForSchedule(dateStr) {
    const db = await this._db();
    const rows = await db
      .collection(COLLECTIONS.profiles)
      .find({ status: "active" })
      .toArray();

    const today = moment.tz(dateStr, "YYYY-MM-DD", this.timezone);
    return rows
      .map((row) => this._formatProfile(row))
      .filter((profile) => {
        const everyDays = Math.max(1, Number(profile.processingEveryDays) || 1);
        const lastDate =
          typeof profile.lastScheduledRunDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(profile.lastScheduledRunDate)
            ? moment.tz(profile.lastScheduledRunDate, "YYYY-MM-DD", this.timezone)
            : null;

        if (!lastDate) return true;

        const diff = today.diff(lastDate, "days");
        return diff >= everyDays;
      });
  }

  async getSalesMetricsForAgent(agentId, options = {}) {
    const db = await this._db();
    const profileId = toObjectId(agentId);
    if (!profileId) return null;

    const profile = await db.collection(COLLECTIONS.profiles).findOne({ _id: profileId });
    if (!profile) return null;

    const pageKeys = normalizePageKeys(profile.pageKeys || []);
    if (!pageKeys.length) {
      return {
        totalConversations: 0,
        purchasedCount: 0,
        conversionRate: 0,
      };
    }

    const parsedPages = pageKeys.map((key) => {
      const [platform, botId] = key.split(":");
      return { platform, botId };
    });

    const threadColl = db.collection("conversation_threads");
    const orFilters = parsedPages.map((p) => ({
      platform: p.platform,
      ...(p.botId ? { botId: p.botId } : {}),
    }));

    const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    const dateTo = options.dateTo ? new Date(options.dateTo) : null;

    const query = {
      $or: orFilters,
    };

    if (dateFrom || dateTo) {
      query["stats.lastMessageAt"] = {};
      if (dateFrom) query["stats.lastMessageAt"].$gte = dateFrom;
      if (dateTo) query["stats.lastMessageAt"].$lte = dateTo;
    }

    const [totalConversations, purchasedCount] = await Promise.all([
      threadColl.countDocuments(query),
      threadColl.countDocuments({
        ...query,
        outcome: "purchased",
      }),
    ]);

    const conversionRate =
      totalConversations > 0
        ? Number(((purchasedCount / totalConversations) * 100).toFixed(2))
        : 0;

    return {
      totalConversations,
      purchasedCount,
      conversionRate,
    };
  }

  async logAccessAudit({
    runId,
    viewer,
    action,
    field,
    meta = null,
  }) {
    const db = await this._db();
    await db.collection(COLLECTIONS.accessAudit).insertOne({
      runId: runId ? String(runId) : null,
      viewer: viewer || "admin",
      action,
      field,
      meta,
      ts: new Date(),
    });
  }
}

module.exports = {
  AgentForgeService,
  COLLECTIONS,
  normalizePageKey,
  normalizePageKeys,
  maskPayload,
};
