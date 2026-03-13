/**
 * Instruction Chat Service
 * Tool executor for AI Agent — granular read/write operations on instructions
 */

const { ObjectId } = require("mongodb");
const crypto = require("crypto");
const InstructionRAGService = require("./instructionRAGService");
const ConversationThreadService = require("./conversationThreadService");

class InstructionChatService {
    constructor(db, openaiClient, options = {}) {
        this.db = db;
        this.openai = openaiClient || null;
        this.collection = db.collection("instructions_v2");
        this.changelogCollection = db.collection("instruction_chat_changelog");
        this.rag = new InstructionRAGService(this.openai);
        this._cachedInstruction = null;
        this._cachedId = null;
        // Callback to reset follow-up config cache after writes
        this._resetFollowUpConfigCache = options.resetFollowUpConfigCache || null;
        this._invalidateInstructionPromptCaches =
            typeof options.invalidateInstructionPromptCaches === "function"
                ? options.invalidateInstructionPromptCaches
                : null;
        this._invalidateAllRuntimeCaches =
            typeof options.invalidateAllRuntimeCaches === "function"
                ? options.invalidateAllRuntimeCaches
                : null;
    }

    async _getInstruction(instructionId) {
        if (this._cachedId === instructionId && this._cachedInstruction) {
            return this._cachedInstruction;
        }
        const inst = await this.collection.findOne({ _id: new ObjectId(instructionId) });
        if (inst) {
            this._cachedInstruction = inst;
            this._cachedId = instructionId;
        }
        return inst;
    }

    _invalidateCache() {
        this._cachedInstruction = null;
        this._cachedId = null;
    }

    _runOptionalCallback(callback, label) {
        if (typeof callback !== "function") return;
        try {
            callback();
        } catch (error) {
            console.warn(`[InstructionChatService] ${label} callback failed:`, error?.message || error);
        }
    }

    _notifyInstructionRuntimeChanged() {
        this._runOptionalCallback(
            this._invalidateInstructionPromptCaches,
            "invalidateInstructionPromptCaches"
        );
    }

    _notifyAllRuntimeChanged() {
        this._runOptionalCallback(
            this._invalidateAllRuntimeCaches,
            "invalidateAllRuntimeCaches"
        );
    }

    _getDataItem(instruction, itemId) {
        if (!instruction || !Array.isArray(instruction.dataItems)) return null;
        return instruction.dataItems.find(i => i.itemId === itemId) || null;
    }

    /**
     * Build the data items summary for system prompt injection
     */
    buildDataItemsSummary(instruction) {
        if (!instruction || !Array.isArray(instruction.dataItems)) return "ไม่มีชุดข้อมูล";
        return instruction.dataItems.map(item => {
            if (item.type === "table" && item.data) {
                const cols = Array.isArray(item.data.columns) ? item.data.columns : [];
                const rowCount = Array.isArray(item.data.rows) ? item.data.rows.length : 0;
                return `- **${item.title || "ไม่มีชื่อ"}** (ID: ${item.itemId}, ประเภท: table)\n  ตาราง ${rowCount} แถว | คอลัมน์: ${cols.join(", ")}`;
            } else if (item.type === "text") {
                const charCount = (item.content || "").length;
                return `- **${item.title || "ไม่มีชื่อ"}** (ID: ${item.itemId}, ประเภท: text)\n  ข้อความ ${charCount} ตัวอักษร`;
            }
            return `- **${item.title || "ไม่มีชื่อ"}** (ID: ${item.itemId}, ประเภท: ${item.type || "unknown"})`;
        }).join("\n");
    }

    _generateStarterMessageId() {
        return `starter_${crypto.randomBytes(8).toString("hex")}`;
    }

    _normalizeStarterMessage(message, index = 0) {
        if (!message || typeof message !== "object") return null;
        const type = typeof message.type === "string" ? message.type.trim().toLowerCase() : "";
        const rawOrder = Number(message.order);
        const order = Number.isFinite(rawOrder) && rawOrder >= 0 ? Math.floor(rawOrder) : Math.max(0, Number(index) || 0);
        const idSource = message.id || message.messageId || message.itemId;
        const id = typeof idSource === "string" && idSource.trim()
            ? idSource.trim()
            : this._generateStarterMessageId();
        const normalizeUrl = (value) =>
            typeof value === "string" && value.trim() ? value.trim() : "";
        const applyCommonMediaMeta = (target) => {
            const alt = typeof message.alt === "string"
                ? message.alt.trim()
                : typeof message.caption === "string"
                    ? message.caption.trim()
                    : "";
            if (alt) target.alt = alt;

            const fileName = typeof message.fileName === "string" ? message.fileName.trim() : "";
            if (fileName) target.fileName = fileName;

            const assetId = message.assetId ?? message.id ?? message._id;
            if (assetId !== null && assetId !== undefined) {
                try {
                    const text = typeof assetId === "string" ? assetId.trim() : assetId.toString();
                    if (text) target.assetId = text;
                } catch {
                    const fallback = String(assetId || "").trim();
                    if (fallback) target.assetId = fallback;
                }
            }
        };

        if (type === "text") {
            const rawText =
                typeof message.content === "string"
                    ? message.content
                    : typeof message.text === "string"
                        ? message.text
                        : "";
            const content = rawText.trim();
            if (!content) return null;
            return { id, type: "text", content, order };
        }

        if (type === "image") {
            const url = normalizeUrl(message.url);
            if (!url) return null;
            const previewUrl = normalizeUrl(message.previewUrl) || normalizeUrl(message.thumbUrl) || url;

            const normalized = {
                id,
                type: "image",
                url,
                previewUrl,
                order,
            };
            applyCommonMediaMeta(normalized);
            return normalized;
        }

        if (type === "video") {
            const url = normalizeUrl(message.url) || normalizeUrl(message.videoUrl);
            if (!url) return null;
            const previewUrl =
                normalizeUrl(message.previewUrl) ||
                normalizeUrl(message.thumbUrl) ||
                normalizeUrl(message.previewImageUrl) ||
                normalizeUrl(message.thumbnailUrl);
            const normalized = {
                id,
                type: "video",
                url,
                order,
            };
            if (previewUrl) normalized.previewUrl = previewUrl;
            applyCommonMediaMeta(normalized);
            return normalized;
        }

        return null;
    }

    _normalizeStarterConfig(config) {
        const enabled = !!config?.enabled;
        const rawMessages = Array.isArray(config?.messages) ? config.messages : [];
        const messages = rawMessages
            .map((message, index) => this._normalizeStarterMessage(message, index))
            .filter(Boolean)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((message, index) => ({
                ...message,
                order: index,
                id: message.id || this._generateStarterMessageId(),
            }));
        return {
            enabled,
            messages,
            updatedAt: config?.updatedAt ? new Date(config.updatedAt) : null,
        };
    }

    // ──────────────────────────── READ TOOLS ────────────────────────────

    async get_instruction_overview(instructionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const starter = this._normalizeStarterConfig(inst.conversationStarter);

        return {
            name: inst.name,
            description: inst.description || "",
            totalDataItems: (inst.dataItems || []).length,
            conversationStarter: {
                enabled: starter.enabled,
                messageCount: starter.messages.length,
            },
            dataItems: (inst.dataItems || []).map(item => {
                const base = { itemId: item.itemId, title: item.title || "Untitled", type: item.type };
                if (item.type === "table" && item.data) {
                    base.rowCount = Array.isArray(item.data.rows) ? item.data.rows.length : 0;
                    base.columns = Array.isArray(item.data.columns) ? item.data.columns : [];
                } else if (item.type === "text") {
                    base.charCount = (item.content || "").length;
                    const preview = (item.content || "").substring(0, 100);
                    base.preview = preview + (preview.length < (item.content || "").length ? "..." : "");
                }
                return base;
            }),
        };
    }

    async get_data_item_detail(instructionId, { itemId }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item) return { error: "ไม่พบชุดข้อมูล" };

        const result = { itemId: item.itemId, title: item.title, type: item.type };

        if (item.type === "table" && item.data) {
            const cols = Array.isArray(item.data.columns) ? item.data.columns : [];
            const rows = Array.isArray(item.data.rows) ? item.data.rows : [];
            result.rowCount = rows.length;
            result.columns = cols;
            result.previewRows = rows.slice(0, 5).map((row, i) => {
                const obj = { rowIndex: i };
                cols.forEach((c, ci) => { obj[c || `Column ${ci + 1}`] = row[ci] !== undefined ? String(row[ci]) : ""; });
                return obj;
            });
            result.hasMore = rows.length > 5;
            result.note = `แสดง ${Math.min(5, rows.length)} แถวแรกจาก ${rows.length} แถว — ใช้ get_rows เพื่อดูเพิ่มเติม`;
        } else if (item.type === "text") {
            const content = item.content || "";
            result.charCount = content.length;
            result.preview = content.substring(0, 500);
            result.hasMore = content.length > 500;
            result.note = content.length > 500 ? `แสดง 500 ตัวอักษรแรกจาก ${content.length} — ใช้ get_text_content เพื่อดูเพิ่มเติม` : undefined;
        }

        return result;
    }

    async get_rows(instructionId, { itemId, startRow = 0, limit = 20, columns }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "table") return { error: "ไม่พบชุดข้อมูลตาราง" };

        const cols = Array.isArray(item.data?.columns) ? item.data.columns : [];
        const allRows = Array.isArray(item.data?.rows) ? item.data.rows : [];
        const selectedCols = columns && Array.isArray(columns) ? columns : cols;
        const end = Math.min(startRow + Math.min(limit, 50), allRows.length);
        const rows = [];

        for (let i = startRow; i < end; i++) {
            const row = allRows[i];
            if (!Array.isArray(row)) continue;
            const obj = { rowIndex: i };
            selectedCols.forEach(c => {
                const ci = cols.indexOf(c);
                obj[c] = ci !== -1 && row[ci] !== undefined ? String(row[ci]) : "";
            });
            rows.push(obj);
        }

        return {
            itemId, totalRows: allRows.length, startRow, endRow: end - 1,
            columns: selectedCols, rows, hasMore: end < allRows.length,
        };
    }

    async get_text_content(instructionId, { itemId, startChar = 0, length = Number.MAX_SAFE_INTEGER }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "text") return { error: "ไม่พบชุดข้อมูลข้อความ" };

        const content = item.content || "";
        const len = length;
        const endChar = Math.min(startChar + len, content.length);

        return {
            itemId, totalChars: content.length, startChar, endChar,
            content: content.substring(startChar, endChar),
            hasMore: endChar < content.length,
        };
    }

    async search_in_table(instructionId, { itemId, keyword, column, matchMode = "contains", limit = 10 }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "table") return { error: "ไม่พบชุดข้อมูลตาราง" };

        const cols = Array.isArray(item.data?.columns) ? item.data.columns : [];
        const allRows = Array.isArray(item.data?.rows) ? item.data.rows : [];
        const kw = (keyword || "").toLowerCase().trim();
        const results = [];

        for (let i = 0; i < allRows.length && results.length < Math.min(limit, 30); i++) {
            const row = allRows[i];
            if (!Array.isArray(row)) continue;

            const matchFn = (val) => {
                const v = String(val || "").toLowerCase();
                if (matchMode === "exact") return v === kw;
                if (matchMode === "startsWith") return v.startsWith(kw);
                return v.includes(kw);
            };

            let matched = false;
            if (column) {
                const ci = cols.indexOf(column);
                if (ci !== -1) matched = matchFn(row[ci]);
            } else {
                matched = row.some(cell => matchFn(cell));
            }

            if (matched) {
                const obj = { rowIndex: i };
                cols.forEach((c, ci) => { obj[c] = row[ci] !== undefined ? String(row[ci]) : ""; });
                results.push(obj);
            }
        }

        return { itemId, keyword, matchMode, totalMatches: results.length, results };
    }

    // ──────────────────────────── WRITE TOOLS ────────────────────────────

    async _logChange(instructionId, sessionId, tool, params, before, after) {
        const changeId = `chg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
        await this.changelogCollection.insertOne({
            changeId, sessionId, instructionId, timestamp: new Date(),
            tool, params, before, after, undone: false,
        });
        return changeId;
    }

    async update_cell(instructionId, { itemId, rowIndex, column, newValue }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ชุดข้อมูลไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const colIndex = cols.indexOf(column);
        if (colIndex === -1) return { error: `ไม่พบคอลัมน์ "${column}"` };

        const rows = item.data.rows || [];
        if (rowIndex < 0 || rowIndex >= rows.length) return { error: `แถว ${rowIndex} ไม่มีอยู่ (มี ${rows.length} แถว)` };

        const before = String(rows[rowIndex][colIndex] ?? "");
        rows[rowIndex][colIndex] = newValue;

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows.${rowIndex}`]: rows[rowIndex], [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "update_cell", { itemId, rowIndex, column, newValue }, { value: before }, { value: newValue });
        return { success: true, itemId, rowIndex, column, before, after: newValue, changeId };
    }

    async update_rows_bulk(instructionId, { itemId, updates }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const changes = [];

        for (const u of (updates || [])) {
            const ci = cols.indexOf(u.column);
            if (ci === -1 || u.rowIndex < 0 || u.rowIndex >= rows.length) continue;
            const before = String(rows[u.rowIndex][ci] ?? "");
            rows[u.rowIndex][ci] = u.newValue;
            changes.push({ rowIndex: u.rowIndex, column: u.column, before, after: u.newValue });
        }

        if (!changes.length) return { error: "ไม่มีการเปลี่ยนแปลง" };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "update_rows_bulk", { itemId, updates }, { changes: changes.map(c => ({ ...c, value: c.before })) }, { changes: changes.map(c => ({ ...c, value: c.after })) });
        return { success: true, itemId, updatedCount: changes.length, changes, changeId };
    }

    async add_row(instructionId, { itemId, rowData, position = "end", afterRowIndex }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const newRow = cols.map(c => rowData && rowData[c] !== undefined ? String(rowData[c]) : "");

        let insertIndex;
        if (position === "start") { rows.unshift(newRow); insertIndex = 0; }
        else if (position === "after" && typeof afterRowIndex === "number" && afterRowIndex < rows.length) {
            rows.splice(afterRowIndex + 1, 0, newRow); insertIndex = afterRowIndex + 1;
        } else { rows.push(newRow); insertIndex = rows.length - 1; }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "add_row", { itemId, rowData, position }, null, { rowIndex: insertIndex });
        return { success: true, itemId, newRowIndex: insertIndex, rowData, newTotalRows: rows.length, changeId };
    }

    async delete_row(instructionId, { itemId, rowIndex }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        if (rowIndex < 0 || rowIndex >= rows.length) return { error: `แถว ${rowIndex} ไม่มีอยู่` };

        const deletedRow = rows[rowIndex];
        const deletedData = {};
        cols.forEach((c, ci) => { deletedData[c] = deletedRow[ci] !== undefined ? String(deletedRow[ci]) : ""; });
        rows.splice(rowIndex, 1);

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "delete_row", { itemId, rowIndex }, { rowData: deletedData }, null);
        return { success: true, itemId, deletedRowIndex: rowIndex, deletedData, newTotalRows: rows.length, changeId };
    }

    async update_text_content(instructionId, { itemId, mode, content, find, replaceWith }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "text") return { error: "ไม่ใช่ข้อความ" };

        const original = item.content || "";
        let newContent = original;
        let matchesReplaced = 0;

        if (mode === "replace_all") {
            newContent = content || "";
        } else if (mode === "append") {
            newContent = original + (content || "");
        } else if (mode === "prepend") {
            newContent = (content || "") + original;
        } else if (mode === "find_replace") {
            if (!find) return { error: "ต้องระบุ find" };
            const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
            newContent = original.replace(regex, replaceWith || "");
            matchesReplaced = (original.match(regex) || []).length;
        }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.content`]: newContent, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "update_text_content", { itemId, mode, content, find, replaceWith }, { content: original }, { content: newContent });

        const result = { success: true, itemId, mode, changeId };
        if (mode === "find_replace") { result.find = find; result.replaceWith = replaceWith; result.matchesReplaced = matchesReplaced; }
        return result;
    }

    async add_column(instructionId, { itemId, columnName, defaultValue = "", position = "end", afterColumn }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];

        if (cols.includes(columnName)) return { error: `คอลัมน์ "${columnName}" มีอยู่แล้ว` };

        let insertIndex;
        if (position === "start") { insertIndex = 0; }
        else if (position === "after" && afterColumn) {
            const ai = cols.indexOf(afterColumn);
            insertIndex = ai !== -1 ? ai + 1 : cols.length;
        } else { insertIndex = cols.length; }

        cols.splice(insertIndex, 0, columnName);
        rows.forEach(row => { if (Array.isArray(row)) row.splice(insertIndex, 0, defaultValue); });

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data`]: { columns: cols, rows }, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "add_column", { itemId, columnName, position }, null, { columnIndex: insertIndex });
        return { success: true, itemId, columnName, columnIndex: insertIndex, newColumnCount: cols.length, changeId };
    }

    async delete_column(instructionId, { itemId, columnName }, sessionId) {
        if (!columnName || typeof columnName !== "string") return { error: "ต้องระบุ columnName" };

        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const colIndex = cols.indexOf(columnName);
        if (colIndex === -1) return { error: `ไม่พบคอลัมน์ "${columnName}"` };

        // Save before state for undo
        const beforeData = rows.slice(0, 5).map(row => (Array.isArray(row) && row[colIndex] !== undefined) ? row[colIndex] : "");

        cols.splice(colIndex, 1);
        rows.forEach(row => { if (Array.isArray(row)) row.splice(colIndex, 1); });

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data`]: { columns: cols, rows }, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "delete_column",
            { itemId, columnName, columnIndex: colIndex },
            { columnName, columnIndex: colIndex, sampleValues: beforeData },
            null
        );
        return { success: true, itemId, deletedColumn: columnName, remainingColumns: cols, newColumnCount: cols.length, changeId };
    }

    async delete_data_item(instructionId, { itemId, confirmTitle }, sessionId) {
        if (!itemId) return { error: "ต้องระบุ itemId" };

        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];

        // Safety: require confirmTitle to match
        if (!confirmTitle || confirmTitle.trim() !== (item.title || "").trim()) {
            return {
                error: "ต้องยืนยันการลบ",
                requireConfirm: true,
                itemId,
                title: item.title,
                type: item.type,
                summary: item.type === "table"
                    ? `ตาราง ${(item.data?.columns || []).length} คอลัมน์, ${(item.data?.rows || []).length} แถว`
                    : `ข้อความ ${(item.content || "").length} ตัวอักษร`,
                message: `⚠️ กรุณายืนยันการลบโดยส่ง confirmTitle = "${item.title}"`,
            };
        }

        // Save before state for changelog
        const beforeSnapshot = {
            itemId: item.itemId,
            title: item.title,
            type: item.type,
        };
        if (item.type === "table" && item.data) {
            beforeSnapshot.columns = item.data.columns || [];
            beforeSnapshot.rowCount = (item.data.rows || []).length;
        } else if (item.type === "text") {
            beforeSnapshot.contentLength = (item.content || "").length;
        }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $pull: { dataItems: { itemId } }, $set: { updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "delete_data_item",
            { itemId, title: item.title },
            beforeSnapshot,
            null
        );

        return {
            success: true,
            deletedItemId: itemId,
            deletedTitle: item.title,
            deletedType: item.type,
            changeId,
            message: `🗑️ ลบชุดข้อมูล "${item.title}" เรียบร้อย`,
        };
    }

    // ──────────────────────────── BULK DELETE SAFETY ────────────────────────────

    /**
     * Step 1: Confirm bulk delete — returns a confirmation token + preview of affected rows
     */
    async delete_rows_bulk_confirm(instructionId, { itemId, rowIndices }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "table") return { error: "ไม่พบชุดข้อมูลตาราง" };

        const cols = item.data?.columns || [];
        const rows = item.data?.rows || [];
        if (!Array.isArray(rowIndices) || !rowIndices.length) return { error: "ต้องระบุ rowIndices" };
        if (rowIndices.length > 50) return { error: "ลบได้สูงสุด 50 แถวต่อครั้ง" };

        // Validate all indices
        const invalidRows = rowIndices.filter(i => i < 0 || i >= rows.length);
        if (invalidRows.length) return { error: `แถวไม่ถูกต้อง: ${invalidRows.join(", ")}` };

        // Build preview of rows to delete
        const preview = rowIndices.map(i => {
            const obj = { rowIndex: i };
            cols.forEach((c, ci) => { obj[c] = rows[i]?.[ci] !== undefined ? String(rows[i][ci]) : ""; });
            return obj;
        });

        // Generate confirmation token (valid for 60 seconds)
        const confirmToken = `cfm_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        this._pendingBulkDeletes = this._pendingBulkDeletes || {};
        this._pendingBulkDeletes[confirmToken] = {
            itemId,
            rowIndices: [...rowIndices].sort((a, b) => b - a), // Sort descending for safe deletion
            expiresAt: Date.now() + 60000,
            preview,
        };

        return {
            requiresConfirmation: true,
            confirmToken,
            itemId,
            rowCount: rowIndices.length,
            totalRowsBefore: rows.length,
            totalRowsAfter: rows.length - rowIndices.length,
            preview,
            message: `⚠️ จะลบ ${rowIndices.length} แถว — กรุณายืนยันโดยเรียก delete_rows_bulk ด้วย confirmToken นี้`,
        };
    }

    /**
     * Step 2: Execute bulk delete — requires valid confirmation token
     */
    async delete_rows_bulk(instructionId, { itemId, confirmToken }, sessionId) {
        if (!confirmToken) return { error: "ต้องมี confirmToken — เรียก delete_rows_bulk_confirm ก่อน" };

        this._pendingBulkDeletes = this._pendingBulkDeletes || {};
        const pending = this._pendingBulkDeletes[confirmToken];
        if (!pending) return { error: "confirmToken ไม่ถูกต้องหรือหมดอายุ" };
        if (Date.now() > pending.expiresAt) {
            delete this._pendingBulkDeletes[confirmToken];
            return { error: "confirmToken หมดอายุ (60 วินาที) — ต้อง confirm ใหม่" };
        }
        if (pending.itemId !== itemId) return { error: "itemId ไม่ตรงกับ confirmToken" };

        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const deletedData = [];

        // Delete rows in descending order to preserve indices
        for (const rowIndex of pending.rowIndices) {
            if (rowIndex >= 0 && rowIndex < rows.length) {
                const deletedRow = rows[rowIndex];
                const obj = { rowIndex };
                cols.forEach((c, ci) => { obj[c] = deletedRow[ci] !== undefined ? String(deletedRow[ci]) : ""; });
                deletedData.push(obj);
                rows.splice(rowIndex, 1);
            }
        }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();
        delete this._pendingBulkDeletes[confirmToken];

        const changeId = await this._logChange(instructionId, sessionId, "delete_rows_bulk",
            { itemId, rowIndices: pending.rowIndices },
            { deletedRows: deletedData },
            null
        );

        return {
            success: true, itemId,
            deletedCount: deletedData.length,
            deletedRows: deletedData,
            newTotalRows: rows.length,
            changeId,
        };
    }

    // ──────────────────────────── CREATE DATA ITEM TOOLS ────────────────────────────

    async create_table_item(instructionId, { title, columns, rows }, sessionId) {
        if (!title || typeof title !== "string" || !title.trim()) return { error: "ต้องระบุ title (ชื่อชุดข้อมูล)" };
        if (!Array.isArray(columns) || columns.length === 0) return { error: "ต้องระบุ columns (array ของชื่อคอลัมน์) อย่างน้อย 1 คอลัมน์" };
        if (columns.length > 50) return { error: "คอลัมน์สูงสุด 50" };

        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const itemId = `item_${crypto.randomBytes(8).toString("hex")}`;
        const cleanCols = columns.map(c => String(c).trim()).filter(c => c.length > 0);
        if (cleanCols.length === 0) return { error: "ชื่อคอลัมน์ไม่ถูกต้อง" };

        // Build rows data
        let tableRows = [];
        if (Array.isArray(rows) && rows.length > 0) {
            tableRows = rows.slice(0, 500).map(row => {
                if (Array.isArray(row)) {
                    // Array format: ["val1", "val2", ...]
                    return cleanCols.map((_, i) => row[i] !== undefined ? String(row[i]) : "");
                } else if (row && typeof row === "object") {
                    // Object format: { colName: "val" }
                    return cleanCols.map(c => row[c] !== undefined ? String(row[c]) : "");
                }
                return cleanCols.map(() => "");
            });
        }

        const newItem = {
            itemId,
            title: title.trim(),
            type: "table",
            data: { columns: cleanCols, rows: tableRows },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $push: { dataItems: newItem }, $set: { updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "create_table_item",
            { title: newItem.title, columns: cleanCols, rowCount: tableRows.length },
            null,
            { itemId, title: newItem.title }
        );

        return {
            success: true,
            itemId,
            title: newItem.title,
            type: "table",
            columns: cleanCols,
            totalRows: tableRows.length,
            changeId,
            message: `✅ สร้างตาราง "${newItem.title}" เรียบร้อย (${cleanCols.length} คอลัมน์, ${tableRows.length} แถว)`,
        };
    }

    async create_text_item(instructionId, { title, content }, sessionId) {
        if (!title || typeof title !== "string" || !title.trim()) return { error: "ต้องระบุ title (ชื่อชุดข้อมูล)" };

        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const itemId = `item_${crypto.randomBytes(8).toString("hex")}`;
        const textContent = typeof content === "string" ? content : "";

        const newItem = {
            itemId,
            title: title.trim(),
            type: "text",
            content: textContent,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $push: { dataItems: newItem }, $set: { updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "create_text_item",
            { title: newItem.title, contentLength: textContent.length },
            null,
            { itemId, title: newItem.title }
        );

        return {
            success: true,
            itemId,
            title: newItem.title,
            type: "text",
            contentLength: textContent.length,
            changeId,
            message: `✅ สร้างข้อความ "${newItem.title}" เรียบร้อย (${textContent.length} ตัวอักษร)`,
        };
    }

    // ──────────────────────────── RAG TOOL ────────────────────────────

    async search_content(instructionId, { query, limit = 5 }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        // Build keyword index (synchronous)
        this.rag.buildIndex(inst);

        // Start embedding build in background (if not already done)
        if (!this.rag._embeddingsReady && this.openai) {
            this.rag.startEmbeddingBuild();
            // Wait briefly for embeddings (non-blocking if timeout)
            await this.rag.waitForEmbeddings(5000);
        }

        // Hybrid search: keyword + semantic (if embeddings ready)
        const results = await this.rag.search(query, Math.min(limit, 10));
        return {
            query,
            totalResults: results.length,
            results,
            searchMethod: this.rag._embeddingsReady ? "hybrid" : "keyword",
        };
    }

    // ──────────────────────────── FOLLOW-UP HELPERS ────────────────────────────

    _parsePageKey(pageKey) {
        if (!pageKey || typeof pageKey !== "string") return null;
        const idx = pageKey.indexOf(":");
        if (idx === -1) return null;
        const platform = pageKey.substring(0, idx).toLowerCase();
        const botId = pageKey.substring(idx + 1);
        if (!platform || !botId) return null;
        return { platform, botId };
    }

    async _getPageRounds(pageKey) {
        const parsed = this._parsePageKey(pageKey);
        if (!parsed) return null;
        const doc = await this.db.collection("follow_up_page_settings").findOne({ platform: parsed.platform, botId: parsed.botId });
        return doc?.settings?.rounds || null;
    }

    async _getGlobalRounds() {
        const doc = await this.db.collection("settings").findOne({ key: "followUpRounds" });
        return Array.isArray(doc?.value) ? doc.value : [];
    }

    async _getMergedRoundsForPage(pageKey) {
        const pageRounds = await this._getPageRounds(pageKey);
        if (pageRounds && Array.isArray(pageRounds) && pageRounds.length > 0) return pageRounds;
        return await this._getGlobalRounds();
    }

    // ──────────────────────────── FOLLOW-UP TOOLS ────────────────────────────

    async list_followup_pages() {
        const lineBots = await this.db.collection("line_bots").find({}).sort({ createdAt: -1 }).toArray();
        const facebookBots = await this.db.collection("facebook_bots").find({}).sort({ createdAt: -1 }).toArray();
        const overrides = await this.db.collection("follow_up_page_settings").find({}).toArray();
        const overrideMap = {};
        overrides.forEach(d => { if (d.platform && d.botId) overrideMap[`${d.platform}:${d.botId}`] = d; });

        // Global base config
        const settingsColl = this.db.collection("settings");
        const keys = ["followUpAutoEnabled", "followUpRounds"];
        const docs = await settingsColl.find({ key: { $in: keys } }).toArray();
        const map = {};
        docs.forEach(d => { map[d.key] = d.value; });
        const globalEnabled = typeof map.followUpAutoEnabled === "boolean" ? map.followUpAutoEnabled : false;
        const globalRounds = Array.isArray(map.followUpRounds) ? map.followUpRounds : [];

        const pages = [];

        lineBots.forEach(bot => {
            const pageKey = `line:${bot._id.toString()}`;
            const override = overrideMap[pageKey];
            const effectiveRounds = override?.settings?.rounds || globalRounds;
            const effectiveEnabled = override?.settings?.autoFollowUpEnabled !== undefined
                ? override.settings.autoFollowUpEnabled : globalEnabled;
            pages.push({
                pageKey,
                platform: "line",
                botId: bot._id.toString(),
                name: bot.name || bot.displayName || bot.botName || `LINE Bot (${bot._id.toString().slice(-4)})`,
                aiModel: bot.aiModel || "gpt-5",
                autoFollowUpEnabled: effectiveEnabled,
                totalRounds: effectiveRounds.length,
                hasOverride: !!override,
            });
        });

        facebookBots.forEach(bot => {
            const pageKey = `facebook:${bot._id.toString()}`;
            const override = overrideMap[pageKey];
            const effectiveRounds = override?.settings?.rounds || globalRounds;
            const effectiveEnabled = override?.settings?.autoFollowUpEnabled !== undefined
                ? override.settings.autoFollowUpEnabled : globalEnabled;
            pages.push({
                pageKey,
                platform: "facebook",
                botId: bot._id.toString(),
                name: bot.pageName || bot.name || `Facebook Page (${bot._id.toString().slice(-4)})`,
                aiModel: bot.aiModel || "gpt-5",
                autoFollowUpEnabled: effectiveEnabled,
                totalRounds: effectiveRounds.length,
                hasOverride: !!override,
            });
        });

        return {
            totalPages: pages.length,
            globalConfig: { autoFollowUpEnabled: globalEnabled, totalRounds: globalRounds.length },
            pages,
            note: "ใช้ pageKeys ใน get_followup_config, update_followup_settings, update_followup_round, manage_followup_images เพื่อแก้ไขเฉพาะเพจ",
        };
    }

    async get_followup_config({ pageKeys } = {}) {
        const settingsColl = this.db.collection("settings");
        const keys = ["followUpAutoEnabled", "followUpRounds", "followUpOrderPromptInstructions"];
        const docs = await settingsColl.find({ key: { $in: keys } }).toArray();
        const map = {};
        docs.forEach(d => { map[d.key] = d.value; });

        const globalRounds = Array.isArray(map.followUpRounds) ? map.followUpRounds : [];
        const globalConfig = {
            scope: "global",
            autoFollowUpEnabled: typeof map.followUpAutoEnabled === "boolean" ? map.followUpAutoEnabled : false,
            orderPromptInstructions: typeof map.followUpOrderPromptInstructions === "string" ? map.followUpOrderPromptInstructions : "",
            totalRounds: globalRounds.length,
            rounds: globalRounds.map((r, i) => {
                const { message, images } = this._getRoundContent(r);
                return {
                    roundIndex: i,
                    delayMinutes: r.delayMinutes || 0,
                    messagePreview: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
                    imageCount: images.length,
                };
            }),
        };

        // If no pageKeys, return global config only (backward compatible)
        if (!Array.isArray(pageKeys) || pageKeys.length === 0) {
            return globalConfig;
        }

        // Fetch per-page configs
        const pageConfigs = [];
        for (const pk of pageKeys.slice(0, 20)) {
            const parsed = this._parsePageKey(pk);
            if (!parsed) { pageConfigs.push({ pageKey: pk, error: "รูปแบบ pageKey ไม่ถูกต้อง (ใช้ platform:botId)" }); continue; }
            const doc = await this.db.collection("follow_up_page_settings").findOne({ platform: parsed.platform, botId: parsed.botId });
            const settings = doc?.settings || {};
            const effectiveRounds = Array.isArray(settings.rounds) && settings.rounds.length > 0 ? settings.rounds : globalRounds;
            pageConfigs.push({
                pageKey: pk,
                platform: parsed.platform,
                botId: parsed.botId,
                hasOverride: !!doc,
                autoFollowUpEnabled: typeof settings.autoFollowUpEnabled === "boolean" ? settings.autoFollowUpEnabled : globalConfig.autoFollowUpEnabled,
                orderPromptInstructions: typeof settings.orderPromptInstructions === "string" ? settings.orderPromptInstructions : globalConfig.orderPromptInstructions,
                totalRounds: effectiveRounds.length,
                rounds: effectiveRounds.map((r, i) => {
                    const { message, images } = this._getRoundContent(r);
                    return {
                        roundIndex: i,
                        delayMinutes: r.delayMinutes || 0,
                        messagePreview: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
                        imageCount: images.length,
                    };
                }),
                source: doc ? "page-specific" : "inherited from global",
            });
        }

        return { globalConfig, pageConfigs };
    }

    // Helper: extract message and images from round (supports new items format and legacy format)
    _getRoundContent(round) {
        if (Array.isArray(round.items)) {
            const textItems = round.items.filter(i => i.type === 'text');
            const imageItems = round.items.filter(i => i.type === 'image');
            return { message: textItems[0]?.content || '', images: imageItems };
        }
        return {
            message: typeof round.message === 'string' ? round.message : '',
            images: Array.isArray(round.images) ? round.images : []
        };
    }

    _setRoundMessage(round, message) {
        if (Array.isArray(round.items)) {
            const idx = round.items.findIndex(i => i.type === 'text');
            if (idx >= 0) { round.items[idx].content = message; }
            else { round.items.unshift({ type: 'text', content: message }); }
        } else {
            round.message = message;
        }
    }

    _addRoundImage(round, imgObj) {
        if (Array.isArray(round.items)) {
            round.items.push({ type: 'image', ...imgObj });
        } else {
            if (!Array.isArray(round.images)) round.images = [];
            round.images.push(imgObj);
        }
    }

    _removeRoundImage(round, assetId, imageUrl) {
        if (Array.isArray(round.items)) {
            const before = round.items.length;
            round.items = round.items.filter(item => {
                if (item.type !== 'image') return true;
                if (assetId && (item.assetId === assetId || item.id === assetId)) return false;
                if (imageUrl && item.url === imageUrl) return false;
                return true;
            });
            return round.items.length !== before;
        }
        if (!Array.isArray(round.images)) round.images = [];
        const before = round.images.length;
        round.images = round.images.filter(img => {
            if (assetId && (img.assetId === assetId || img.id === assetId)) return false;
            if (imageUrl && img.url === imageUrl) return false;
            return true;
        });
        return round.images.length !== before;
    }

    _countRoundImages(round) {
        if (Array.isArray(round.items)) return round.items.filter(i => i.type === 'image').length;
        return Array.isArray(round.images) ? round.images.length : 0;
    }

    async get_followup_round_detail({ roundIndex, pageKey }) {
        let rounds;
        let source = "global";
        if (pageKey) {
            const pageRounds = await this._getPageRounds(pageKey);
            if (pageRounds && Array.isArray(pageRounds) && pageRounds.length > 0) {
                rounds = pageRounds;
                source = `page-specific (${pageKey})`;
            } else {
                rounds = await this._getGlobalRounds();
                source = `inherited from global (${pageKey} has no override)`;
            }
        } else {
            rounds = await this._getGlobalRounds();
        }

        if (roundIndex < 0 || roundIndex >= rounds.length) return { error: `Round ${roundIndex} ไม่มีอยู่ (มี ${rounds.length} rounds)` };

        const round = rounds[roundIndex];
        const { message, images: rawImages } = this._getRoundContent(round);
        const result = {
            roundIndex,
            source,
            delayMinutes: round.delayMinutes || 0,
            message,
            images: [],
        };

        // Resolve image details
        if (rawImages.length > 0) {
            const assetsColl = this.db.collection("follow_up_assets");
            for (const img of rawImages) {
                const assetId = img.assetId || img.id;
                if (assetId) {
                    try {
                        const asset = await assetsColl.findOne({ _id: new ObjectId(assetId) });
                        result.images.push({
                            assetId,
                            url: asset?.url || img.url || "",
                            previewUrl: asset?.thumbUrl || img.previewUrl || img.url || "",
                        });
                    } catch {
                        result.images.push({ assetId, url: img.url || "", previewUrl: img.previewUrl || img.url || "" });
                    }
                } else if (img.url) {
                    result.images.push({ url: img.url, previewUrl: img.previewUrl || img.url });
                }
            }
        }

        return result;
    }

    async update_followup_settings({ autoFollowUpEnabled, orderPromptInstructions, pageKeys }) {
        // If pageKeys provided, write to per-page settings
        if (Array.isArray(pageKeys) && pageKeys.length > 0) {
            const results = [];
            const pageColl = this.db.collection("follow_up_page_settings");
            for (const pk of pageKeys.slice(0, 20)) {
                const parsed = this._parsePageKey(pk);
                if (!parsed) { results.push({ pageKey: pk, error: "รูปแบบ pageKey ไม่ถูกต้อง" }); continue; }

                const setFields = {};
                const updates = [];
                if (typeof autoFollowUpEnabled === "boolean") {
                    setFields["settings.autoFollowUpEnabled"] = autoFollowUpEnabled;
                    updates.push({ field: "autoFollowUpEnabled", value: autoFollowUpEnabled });
                }
                if (typeof orderPromptInstructions === "string" && orderPromptInstructions.trim().length > 0) {
                    const trimmed = orderPromptInstructions.trim().slice(0, 4000);
                    setFields["settings.orderPromptInstructions"] = trimmed;
                    updates.push({ field: "orderPromptInstructions", value: trimmed.substring(0, 100) + (trimmed.length > 100 ? "..." : "") });
                }

                if (!Object.keys(setFields).length) { results.push({ pageKey: pk, error: "ไม่มีการเปลี่ยนแปลง" }); continue; }

                await pageColl.updateOne(
                    { platform: parsed.platform, botId: parsed.botId },
                    { $set: { platform: parsed.platform, botId: parsed.botId, ...setFields, updatedAt: new Date() } },
                    { upsert: true }
                );
                results.push({ pageKey: pk, success: true, updated: updates });
            }
            if (this._resetFollowUpConfigCache) this._resetFollowUpConfigCache();
            return { success: true, scope: "per-page", results };
        }

        // Global update (backward compatible)
        const settingsColl = this.db.collection("settings");
        const updates = [];

        if (typeof autoFollowUpEnabled === "boolean") {
            await settingsColl.updateOne({ key: "followUpAutoEnabled" }, { $set: { key: "followUpAutoEnabled", value: autoFollowUpEnabled } }, { upsert: true });
            updates.push({ field: "autoFollowUpEnabled", value: autoFollowUpEnabled });
        }
        if (typeof orderPromptInstructions === "string" && orderPromptInstructions.trim().length > 0) {
            const trimmed = orderPromptInstructions.trim().slice(0, 4000);
            await settingsColl.updateOne({ key: "followUpOrderPromptInstructions" }, { $set: { key: "followUpOrderPromptInstructions", value: trimmed } }, { upsert: true });
            updates.push({ field: "orderPromptInstructions", value: trimmed.substring(0, 100) + (trimmed.length > 100 ? "..." : "") });
        }

        if (!updates.length) return { error: "ไม่มีการเปลี่ยนแปลง — ระบุ autoFollowUpEnabled หรือ orderPromptInstructions" };

        if (this._resetFollowUpConfigCache) this._resetFollowUpConfigCache();
        return { success: true, scope: "global", updated: updates };
    }

    async update_followup_round({ roundIndex, message, delayMinutes, pageKeys }) {
        // If pageKeys provided, update per-page rounds
        if (Array.isArray(pageKeys) && pageKeys.length > 0) {
            const results = [];
            const pageColl = this.db.collection("follow_up_page_settings");
            for (const pk of pageKeys.slice(0, 20)) {
                const parsed = this._parsePageKey(pk);
                if (!parsed) { results.push({ pageKey: pk, error: "รูปแบบ pageKey ไม่ถูกต้อง" }); continue; }

                // Get current page rounds (or copy from global if none)
                const doc = await pageColl.findOne({ platform: parsed.platform, botId: parsed.botId });
                let rounds = doc?.settings?.rounds;
                if (!Array.isArray(rounds) || rounds.length === 0) {
                    // Copy global rounds to this page first
                    rounds = JSON.parse(JSON.stringify(await this._getGlobalRounds()));
                }
                if (roundIndex < 0 || roundIndex >= rounds.length) {
                    results.push({ pageKey: pk, error: `Round ${roundIndex} ไม่มีอยู่ (มี ${rounds.length} rounds)` }); continue;
                }

                const { message: beforeMsg } = this._getRoundContent(rounds[roundIndex]);
                const before = { message: beforeMsg, delayMinutes: rounds[roundIndex].delayMinutes };
                if (typeof message === "string") this._setRoundMessage(rounds[roundIndex], message);
                if (typeof delayMinutes === "number" && delayMinutes >= 1) rounds[roundIndex].delayMinutes = Math.round(delayMinutes);

                await pageColl.updateOne(
                    { platform: parsed.platform, botId: parsed.botId },
                    { $set: { platform: parsed.platform, botId: parsed.botId, "settings.rounds": rounds, updatedAt: new Date() } },
                    { upsert: true }
                );
                const { message: afterMsg } = this._getRoundContent(rounds[roundIndex]);
                results.push({
                    pageKey: pk, success: true, roundIndex,
                    before, after: { message: afterMsg, delayMinutes: rounds[roundIndex].delayMinutes },
                });
            }
            if (this._resetFollowUpConfigCache) this._resetFollowUpConfigCache();
            return { success: true, scope: "per-page", results };
        }

        // Global update (backward compatible)
        const settingsColl = this.db.collection("settings");
        const doc = await settingsColl.findOne({ key: "followUpRounds" });
        const rounds = Array.isArray(doc?.value) ? [...doc.value] : [];

        if (roundIndex < 0 || roundIndex >= rounds.length) return { error: `Round ${roundIndex} ไม่มีอยู่ (มี ${rounds.length} rounds)` };

        const { message: beforeMsg } = this._getRoundContent(rounds[roundIndex]);
        const before = { message: beforeMsg, delayMinutes: rounds[roundIndex].delayMinutes };

        if (typeof message === "string") this._setRoundMessage(rounds[roundIndex], message);
        if (typeof delayMinutes === "number" && delayMinutes >= 1) rounds[roundIndex].delayMinutes = Math.round(delayMinutes);

        await settingsColl.updateOne({ key: "followUpRounds" }, { $set: { value: rounds } });

        if (this._resetFollowUpConfigCache) this._resetFollowUpConfigCache();
        const { message: afterMsg } = this._getRoundContent(rounds[roundIndex]);
        return {
            success: true, scope: "global", roundIndex,
            before, after: { message: afterMsg, delayMinutes: rounds[roundIndex].delayMinutes },
        };
    }

    async manage_followup_images({ roundIndex, action, assetId, imageUrl, pageKeys }) {
        // Resolve asset once (shared across pages)
        let resolvedImgObj = null;
        if (action === "add") {
            if (!assetId && !imageUrl) return { error: "ต้องระบุ assetId หรือ imageUrl" };
            resolvedImgObj = { url: imageUrl || "" };
            if (assetId) {
                try {
                    const asset = await this.db.collection("follow_up_assets").findOne({ _id: new ObjectId(assetId) });
                    if (asset) {
                        resolvedImgObj = { assetId, url: asset.url, previewUrl: asset.thumbUrl || asset.url };
                    } else {
                        return { error: `ไม่พบ asset ID: ${assetId}` };
                    }
                } catch {
                    return { error: `assetId ไม่ถูกต้อง: ${assetId}` };
                }
            }
        }

        // Per-page update
        if (Array.isArray(pageKeys) && pageKeys.length > 0) {
            const results = [];
            const pageColl = this.db.collection("follow_up_page_settings");
            for (const pk of pageKeys.slice(0, 20)) {
                const parsed = this._parsePageKey(pk);
                if (!parsed) { results.push({ pageKey: pk, error: "รูปแบบ pageKey ไม่ถูกต้อง" }); continue; }

                const doc = await pageColl.findOne({ platform: parsed.platform, botId: parsed.botId });
                let rounds = doc?.settings?.rounds;
                if (!Array.isArray(rounds) || rounds.length === 0) {
                    rounds = JSON.parse(JSON.stringify(await this._getGlobalRounds()));
                }
                if (roundIndex < 0 || roundIndex >= rounds.length) {
                    results.push({ pageKey: pk, error: `Round ${roundIndex} ไม่มีอยู่` }); continue;
                }

                if (action === "add") {
                    this._addRoundImage(rounds[roundIndex], { ...resolvedImgObj });
                } else if (action === "remove") {
                    if (!assetId && !imageUrl) { results.push({ pageKey: pk, error: "ต้องระบุ assetId หรือ imageUrl เพื่อลบ" }); continue; }
                    if (!this._removeRoundImage(rounds[roundIndex], assetId, imageUrl)) { results.push({ pageKey: pk, error: "ไม่พบรูปที่ต้องการลบ" }); continue; }
                } else {
                    results.push({ pageKey: pk, error: "action ต้องเป็น 'add' หรือ 'remove'" }); continue;
                }

                await pageColl.updateOne(
                    { platform: parsed.platform, botId: parsed.botId },
                    { $set: { platform: parsed.platform, botId: parsed.botId, "settings.rounds": rounds, updatedAt: new Date() } },
                    { upsert: true }
                );
                results.push({ pageKey: pk, success: true, roundIndex, action, currentImageCount: this._countRoundImages(rounds[roundIndex]) });
            }
            if (this._resetFollowUpConfigCache) this._resetFollowUpConfigCache();
            return { success: true, scope: "per-page", results };
        }

        // Global update (backward compatible)
        const settingsColl = this.db.collection("settings");
        const doc = await settingsColl.findOne({ key: "followUpRounds" });
        const rounds = Array.isArray(doc?.value) ? [...doc.value] : [];

        if (roundIndex < 0 || roundIndex >= rounds.length) return { error: `Round ${roundIndex} ไม่มีอยู่` };

        if (action === "add") {
            this._addRoundImage(rounds[roundIndex], { ...resolvedImgObj });
        } else if (action === "remove") {
            if (!assetId && !imageUrl) return { error: "ต้องระบุ assetId หรือ imageUrl เพื่อลบ" };
            if (!this._removeRoundImage(rounds[roundIndex], assetId, imageUrl)) return { error: "ไม่พบรูปที่ต้องการลบ" };
        } else {
            return { error: "action ต้องเป็น 'add' หรือ 'remove'" };
        }

        await settingsColl.updateOne({ key: "followUpRounds" }, { $set: { value: rounds } });
        if (this._resetFollowUpConfigCache) this._resetFollowUpConfigCache();

        return {
            success: true, scope: "global", roundIndex, action,
            currentImageCount: this._countRoundImages(rounds[roundIndex]),
        };
    }

    async list_followup_assets() {
        const assetsColl = this.db.collection("follow_up_assets");
        const assets = await assetsColl.find({}).sort({ createdAt: -1 }).limit(50).toArray();
        return {
            totalAssets: assets.length,
            assets: assets.map(a => ({
                assetId: a._id?.toString(),
                url: a.url || "",
                previewUrl: a.thumbUrl || a.url || "",
                fileName: a.fileName || "",
                width: a.width || null,
                height: a.height || null,
            })),
        };
    }

    // ──────────────────────────── CONVERSATION STARTER TOOLS ────────────────────────────

    async _resolveStarterImageInput({ assetId, imageUrl, previewUrl, alt }) {
        if (assetId) {
            try {
                const asset = await this.db.collection("follow_up_assets").findOne({ _id: new ObjectId(assetId) });
                if (!asset) {
                    return { error: `ไม่พบ asset ID: ${assetId}` };
                }
                return {
                    message: {
                        type: "image",
                        url: asset.url || "",
                        previewUrl: asset.thumbUrl || asset.url || "",
                        alt: typeof alt === "string" ? alt.trim() : "",
                        assetId: String(assetId),
                        fileName: asset.fileName || "",
                    },
                };
            } catch {
                return { error: `assetId ไม่ถูกต้อง: ${assetId}` };
            }
        }

        const normalizedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";
        if (!normalizedImageUrl) {
            return { error: "ต้องระบุ imageUrl หรือ assetId" };
        }

        const normalizedPreview = typeof previewUrl === "string" && previewUrl.trim()
            ? previewUrl.trim()
            : normalizedImageUrl;

        return {
            message: {
                type: "image",
                url: normalizedImageUrl,
                previewUrl: normalizedPreview,
                alt: typeof alt === "string" ? alt.trim() : "",
            },
        };
    }

    async get_conversation_starter(instructionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const starter = this._normalizeStarterConfig(inst.conversationStarter);
        return {
            enabled: starter.enabled,
            messageCount: starter.messages.length,
            messages: starter.messages,
        };
    }

    async set_conversation_starter_enabled(instructionId, { enabled }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        if (typeof enabled !== "boolean") return { error: "ต้องระบุ enabled เป็น true/false" };

        const beforeStarter = this._normalizeStarterConfig(inst.conversationStarter);
        const now = new Date();
        const nextStarter = {
            enabled,
            messages: beforeStarter.messages,
            updatedAt: now,
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { conversationStarter: nextStarter, updatedAt: now } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(
            instructionId,
            sessionId,
            "set_conversation_starter_enabled",
            { enabled },
            { enabled: beforeStarter.enabled },
            { enabled }
        );

        return {
            success: true,
            enabled,
            messageCount: nextStarter.messages.length,
            changeId,
        };
    }

    async add_conversation_starter_message(
        instructionId,
        { type, content, imageUrl, videoUrl, previewUrl, alt, assetId, position = "end" },
        sessionId
    ) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const starter = this._normalizeStarterConfig(inst.conversationStarter);
        const beforeMessages = starter.messages.map(m => ({ ...m }));
        let nextMessage = null;

        if (type === "text") {
            const normalizedText = typeof content === "string" ? content.trim() : "";
            if (!normalizedText) return { error: "ข้อความต้องไม่ว่าง" };
            nextMessage = {
                id: this._generateStarterMessageId(),
                type: "text",
                content: normalizedText,
            };
        } else if (type === "image") {
            const resolved = await this._resolveStarterImageInput({
                assetId,
                imageUrl,
                previewUrl,
                alt,
            });
            if (resolved.error) return { error: resolved.error };
            nextMessage = {
                id: this._generateStarterMessageId(),
                ...resolved.message,
            };
        } else if (type === "video") {
            const normalizedVideoUrl = typeof videoUrl === "string" && videoUrl.trim()
                ? videoUrl.trim()
                : typeof imageUrl === "string" && imageUrl.trim()
                    ? imageUrl.trim()
                    : "";
            if (!normalizedVideoUrl) return { error: "ต้องระบุ videoUrl" };
            nextMessage = {
                id: this._generateStarterMessageId(),
                type: "video",
                url: normalizedVideoUrl,
                previewUrl: typeof previewUrl === "string" ? previewUrl.trim() : "",
                alt: typeof alt === "string" ? alt.trim() : "",
            };
        } else {
            return { error: "type ต้องเป็น 'text', 'image' หรือ 'video'" };
        }

        const messages = [...starter.messages];
        if (position === "start") {
            messages.unshift(nextMessage);
        } else {
            messages.push(nextMessage);
        }

        const normalizedMessages = this._normalizeStarterConfig({
            enabled: starter.enabled,
            messages,
        }).messages;
        const now = new Date();
        const nextStarter = {
            enabled: starter.enabled,
            messages: normalizedMessages,
            updatedAt: now,
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { conversationStarter: nextStarter, updatedAt: now } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(
            instructionId,
            sessionId,
            "add_conversation_starter_message",
            { type, position, assetId: assetId || null },
            { messages: beforeMessages },
            { messageId: nextMessage.id, messages: normalizedMessages }
        );

        return {
            success: true,
            messageId: nextMessage.id,
            messageCount: normalizedMessages.length,
            messages: normalizedMessages,
            changeId,
        };
    }

    async update_conversation_starter_message(
        instructionId,
        { messageId, content, imageUrl, videoUrl, previewUrl, alt, assetId },
        sessionId
    ) {
        if (!messageId) return { error: "ต้องระบุ messageId" };
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const starter = this._normalizeStarterConfig(inst.conversationStarter);
        const idx = starter.messages.findIndex(m => m.id === messageId);
        if (idx === -1) return { error: `ไม่พบ messageId: ${messageId}` };

        const beforeMessage = { ...starter.messages[idx] };
        const messages = [...starter.messages];
        const target = { ...messages[idx] };

        if (target.type === "text") {
            if (typeof content !== "string") return { error: "ต้องระบุ content สำหรับข้อความ" };
            const normalizedText = content.trim();
            if (!normalizedText) return { error: "ข้อความต้องไม่ว่าง" };
            target.content = normalizedText;
        } else if (target.type === "image") {
            if (assetId || imageUrl) {
                const resolved = await this._resolveStarterImageInput({
                    assetId,
                    imageUrl,
                    previewUrl,
                    alt,
                });
                if (resolved.error) return { error: resolved.error };
                target.url = resolved.message.url;
                target.previewUrl = resolved.message.previewUrl;
                target.assetId = resolved.message.assetId;
                target.fileName = resolved.message.fileName;
            }
            if (typeof alt === "string") {
                target.alt = alt.trim();
            }
        } else if (target.type === "video") {
            const normalizedVideoUrl = typeof videoUrl === "string" && videoUrl.trim()
                ? videoUrl.trim()
                : typeof imageUrl === "string" && imageUrl.trim()
                    ? imageUrl.trim()
                    : "";
            if (normalizedVideoUrl) {
                target.url = normalizedVideoUrl;
            }
            if (typeof previewUrl === "string") {
                target.previewUrl = previewUrl.trim();
            }
            if (typeof alt === "string") {
                target.alt = alt.trim();
            }
        }

        messages[idx] = target;
        const normalizedMessages = this._normalizeStarterConfig({
            enabled: starter.enabled,
            messages,
        }).messages;
        const now = new Date();
        const nextStarter = {
            enabled: starter.enabled,
            messages: normalizedMessages,
            updatedAt: now,
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { conversationStarter: nextStarter, updatedAt: now } }
        );
        this._invalidateCache();

        const updatedMessage = normalizedMessages.find(m => m.id === messageId) || null;
        const changeId = await this._logChange(
            instructionId,
            sessionId,
            "update_conversation_starter_message",
            { messageId },
            { message: beforeMessage },
            { message: updatedMessage }
        );

        return {
            success: true,
            messageId,
            message: updatedMessage,
            changeId,
        };
    }

    async remove_conversation_starter_message(instructionId, { messageId }, sessionId) {
        if (!messageId) return { error: "ต้องระบุ messageId" };
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const starter = this._normalizeStarterConfig(inst.conversationStarter);
        const idx = starter.messages.findIndex(m => m.id === messageId);
        if (idx === -1) return { error: `ไม่พบ messageId: ${messageId}` };

        const beforeMessage = { ...starter.messages[idx] };
        const messages = starter.messages.filter(m => m.id !== messageId);
        const normalizedMessages = this._normalizeStarterConfig({
            enabled: starter.enabled,
            messages,
        }).messages;
        const now = new Date();
        const nextStarter = {
            enabled: starter.enabled,
            messages: normalizedMessages,
            updatedAt: now,
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { conversationStarter: nextStarter, updatedAt: now } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(
            instructionId,
            sessionId,
            "remove_conversation_starter_message",
            { messageId },
            { message: beforeMessage },
            { messageCount: normalizedMessages.length }
        );

        return {
            success: true,
            messageId,
            messageCount: normalizedMessages.length,
            messages: normalizedMessages,
            changeId,
        };
    }

    async reorder_conversation_starter_message(
        instructionId,
        { messageId, direction = "up", toIndex = null },
        sessionId
    ) {
        if (!messageId) return { error: "ต้องระบุ messageId" };
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const starter = this._normalizeStarterConfig(inst.conversationStarter);
        const currentIndex = starter.messages.findIndex(m => m.id === messageId);
        if (currentIndex === -1) return { error: `ไม่พบ messageId: ${messageId}` };

        const beforeOrder = starter.messages.map(m => m.id);
        const messages = [...starter.messages];
        let targetIndex = currentIndex;

        if (Number.isInteger(toIndex)) {
            targetIndex = Math.max(0, Math.min(toIndex, messages.length - 1));
        } else if (direction === "down") {
            targetIndex = Math.min(messages.length - 1, currentIndex + 1);
        } else {
            targetIndex = Math.max(0, currentIndex - 1);
        }

        if (targetIndex === currentIndex) {
            return { success: true, messages, order: beforeOrder, note: "ลำดับไม่เปลี่ยน" };
        }

        const [item] = messages.splice(currentIndex, 1);
        messages.splice(targetIndex, 0, item);

        const normalizedMessages = this._normalizeStarterConfig({
            enabled: starter.enabled,
            messages,
        }).messages;
        const now = new Date();
        const nextStarter = {
            enabled: starter.enabled,
            messages: normalizedMessages,
            updatedAt: now,
        };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { conversationStarter: nextStarter, updatedAt: now } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(
            instructionId,
            sessionId,
            "reorder_conversation_starter_message",
            { messageId, direction, toIndex },
            { order: beforeOrder },
            { order: normalizedMessages.map(m => m.id) }
        );

        return {
            success: true,
            messageId,
            messages: normalizedMessages,
            order: normalizedMessages.map(m => m.id),
            changeId,
        };
    }

    // ──────────────────────────── PAGE MODEL TOOL ────────────────────────────

    async update_page_model({ pageKeys, model }) {
        if (!model || typeof model !== "string" || !model.trim()) {
            return { error: "ต้องระบุ model เช่น 'gpt-5', 'gpt-4.1-mini', 'gpt-5-mini'" };
        }
        if (!Array.isArray(pageKeys) || pageKeys.length === 0) {
            return { error: "ต้องระบุ pageKeys (array) เช่น ['line:abc123', 'facebook:xyz456']" };
        }

        const results = [];
        for (const pk of pageKeys.slice(0, 20)) {
            const parsed = this._parsePageKey(pk);
            if (!parsed) { results.push({ pageKey: pk, error: "รูปแบบ pageKey ไม่ถูกต้อง" }); continue; }

            const collName = parsed.platform === "line" ? "line_bots" : "facebook_bots";
            const result = await this.db.collection(collName).updateOne(
                { _id: new ObjectId(parsed.botId) },
                { $set: { aiModel: model.trim() } }
            );

            if (result.matchedCount === 0) {
                results.push({ pageKey: pk, error: `ไม่พบ bot ID: ${parsed.botId}` });
            } else {
                results.push({ pageKey: pk, success: true, model: model.trim() });
            }
        }

        return {
            success: true,
            model: model.trim(),
            results,
            note: "เปลี่ยนโมเดลเรียบร้อยแล้ว จะมีผลกับข้อความใหม่ทันที",
        };
    }

    // ──────────────────────────── VERSION MANAGEMENT TOOLS ────────────────────────────

    async list_versions(instructionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const instId = inst.instructionId || instructionId;
        const versionColl = this.db.collection("instruction_versions");
        const versions = await versionColl.find({ instructionId: instId })
            .sort({ version: -1 })
            .project({ version: 1, snapshotAt: 1, note: 1, title: 1, instructionId: 1 })
            .toArray();

        // Also check current instruction version
        const currentVersion = Number.isInteger(inst.version) ? inst.version : 1;

        return {
            instructionId: instId,
            instructionName: inst.name || "Untitled",
            currentVersion,
            totalVersions: versions.length,
            versions: versions.map(v => ({
                version: v.version,
                snapshotAt: v.snapshotAt,
                note: v.note || "",
            })),
            note: versions.length === 0
                ? "ยังไม่มีเวอร์ชันที่บันทึกไว้ — ใช้ save_version เพื่อบันทึกเวอร์ชันใหม่"
                : "ใช้ view_version_detail(version) เพื่อดูรายละเอียดของแต่ละเวอร์ชัน",
        };
    }

    async save_version(instructionId, { note = "" }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const instId = inst.instructionId || instructionId;
        const versionColl = this.db.collection("instruction_versions");

        // Find the next version number
        const latest = await versionColl.find({ instructionId: instId })
            .sort({ version: -1 }).limit(1).toArray();
        const nextVersion = latest.length > 0 ? (latest[0].version || 0) + 1 : 1;
        const starterConfig = this._normalizeStarterConfig(inst.conversationStarter);

        // Create snapshot of current instruction state
        const snapshot = {
            instructionId: instId,
            version: nextVersion,
            name: inst.name || "",
            description: inst.description || "",
            conversationStarter: starterConfig,
            dataItems: (inst.dataItems || []).map(item => {
                const copy = { itemId: item.itemId, title: item.title, type: item.type };
                if (item.type === "table" && item.data) {
                    copy.data = {
                        columns: item.data.columns || [],
                        rowCount: Array.isArray(item.data.rows) ? item.data.rows.length : 0,
                        // Store full rows for recovery
                        rows: item.data.rows || [],
                    };
                } else if (item.type === "text") {
                    copy.content = item.content || "";
                }
                return copy;
            }),
            note: (note || "").substring(0, 500),
            snapshotAt: new Date(),
            savedBy: "instructionAI",
        };

        await versionColl.updateOne(
            { instructionId: instId, version: nextVersion },
            { $set: snapshot },
            { upsert: true }
        );

        // Also update the current instruction's version number
        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { version: nextVersion, updatedAt: new Date() } }
        );
        this._invalidateCache();
        this._notifyInstructionRuntimeChanged();

        // Log the change
        await this._logChange(instructionId, sessionId, "save_version",
            { version: nextVersion, note },
            null,
            { version: nextVersion }
        );

        return {
            success: true,
            version: nextVersion,
            note: snapshot.note,
            snapshotAt: snapshot.snapshotAt,
            dataItemCount: snapshot.dataItems.length,
            starterMessageCount: starterConfig.messages.length,
            message: `✅ บันทึกเวอร์ชัน ${nextVersion} เรียบร้อย${snapshot.note ? " (" + snapshot.note + ")" : ""}`,
        };
    }

    async view_version_detail(instructionId, { version }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        const instId = inst.instructionId || instructionId;
        if (version == null) return { error: "ต้องระบุ version" };

        const versionColl = this.db.collection("instruction_versions");
        const snapshot = await versionColl.findOne({ instructionId: instId, version: Number(version) });
        if (!snapshot) return { error: `ไม่พบเวอร์ชัน ${version}` };
        const starter = this._normalizeStarterConfig(snapshot.conversationStarter);

        return {
            version: snapshot.version,
            name: snapshot.name || snapshot.title || "",
            note: snapshot.note || "",
            snapshotAt: snapshot.snapshotAt,
            conversationStarter: {
                enabled: starter.enabled,
                messageCount: starter.messages.length,
                messages: starter.messages,
            },
            dataItems: (snapshot.dataItems || []).map(item => {
                const base = { itemId: item.itemId, title: item.title, type: item.type };
                if (item.type === "table" && item.data) {
                    base.columns = item.data.columns || [];
                    base.rowCount = item.data.rowCount || (Array.isArray(item.data.rows) ? item.data.rows.length : 0);
                } else if (item.type === "text") {
                    const content = item.content || "";
                    base.charCount = content.length;
                    base.preview = content.substring(0, 200) + (content.length > 200 ? "..." : "");
                }
                return base;
            }),
            // For legacy format
            ...(snapshot.content && !snapshot.dataItems ? {
                legacyContent: (snapshot.content || "").substring(0, 500),
            } : {}),
        };
    }

    async compare_version_stats(instructionId, { version1, version2 }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        if (version1 == null || version2 == null) return { error: "ต้องระบุ version1 และ version2" };

        const instId = inst.instructionId || instructionId;
        const threadService = new ConversationThreadService(this.db);

        const [stats1, stats2] = await Promise.all([
            threadService.getConversationAnalytics(instId, Number(version1)),
            threadService.getConversationAnalytics(instId, Number(version2)),
        ]);

        const fmt = (v) => ({
            totalConversations: v.totalThreads || 0,
            conversionRate: (v.conversionRate || 0) + "%",
            avgUserMessages: v.avgUserMessages || 0,
            purchasedCount: v.purchasedCount || 0,
            notPurchasedCount: v.notPurchasedCount || 0,
            totalOrderAmount: v.totalOrderAmount || 0,
            topProducts: (v.topProducts || []).slice(0, 3),
        });

        const s1 = fmt(stats1);
        const s2 = fmt(stats2);

        // Compute deltas
        const convDelta = (stats2.conversionRate || 0) - (stats1.conversionRate || 0);
        const msgDelta = (stats2.avgUserMessages || 0) - (stats1.avgUserMessages || 0);

        return {
            version1: { version: Number(version1), stats: s1 },
            version2: { version: Number(version2), stats: s2 },
            comparison: {
                conversionChange: convDelta > 0 ? `+${convDelta.toFixed(1)}% 📈` : `${convDelta.toFixed(1)}% 📉`,
                avgMessagesChange: msgDelta > 0 ? `+${msgDelta.toFixed(1)} msgs` : `${msgDelta.toFixed(1)} msgs`,
                moreConversations: (stats2.totalThreads || 0) - (stats1.totalThreads || 0),
            },
        };
    }

    // ──────────────────────────── CONVERSATION ANALYSIS TOOLS ────────────────────────────

    async get_conversation_stats(instructionId) {
        const threadService = new ConversationThreadService(this.db);
        // Look up the instructionId identifier for the instruction
        const inst = await this._getInstruction(instructionId);
        const instIdForQuery = inst?.instructionId || instructionId;

        const analytics = await threadService.getConversationAnalytics(instIdForQuery);
        return {
            totalConversations: analytics.totalThreads || 0,
            conversionRate: (analytics.conversionRate || 0) + "%",
            avgUserMessages: analytics.avgUserMessages || 0,
            avgDurationMinutes: analytics.avgDurationMinutes || 0,
            purchasedCount: analytics.purchasedCount || 0,
            notPurchasedCount: analytics.notPurchasedCount || 0,
            pendingCount: analytics.pendingCount || 0,
            totalOrderAmount: analytics.totalOrderAmount || 0,
            topProducts: (analytics.topProducts || []).slice(0, 5),
            platformBreakdown: analytics.platformBreakdown || {},
        };
    }

    async search_conversations(instructionId, { outcome, minMessages, maxMessages, products, limit = 10 }) {
        const threadService = new ConversationThreadService(this.db);
        const inst = await this._getInstruction(instructionId);
        const instIdForQuery = inst?.instructionId || instructionId;

        const filters = {};
        if (outcome) filters.outcome = Array.isArray(outcome) ? outcome : [outcome];
        if (minMessages != null) filters.minUserMessages = Number(minMessages);
        if (maxMessages != null) filters.maxUserMessages = Number(maxMessages);
        if (products && Array.isArray(products)) filters.products = products;

        const result = await threadService.getThreadsByInstruction(
            instIdForQuery, null, filters, { page: 1, limit: Math.min(limit, 20) }
        );

        return {
            totalFound: result.pagination?.totalCount || 0,
            conversations: (result.threads || []).map(t => ({
                threadId: t.threadId,
                senderId: (t.senderId || "").substring(0, 12) + "...",
                platform: t.platform,
                botName: t.botName,
                userMessages: t.stats?.userMessages || 0,
                outcome: t.outcome,
                orderedProducts: t.orderedProducts || [],
                totalOrderAmount: t.totalOrderAmount || 0,
                lastMessageAt: t.stats?.lastMessageAt,
                tags: t.tags || [],
            })),
            note: "ใช้ get_conversation_detail(threadId) เพื่อดูข้อความจริงของแต่ละสนทนา",
        };
    }

    async get_conversation_detail(instructionId, { threadId, page = 1, limit = 30 }) {
        if (!threadId) return { error: "ต้องระบุ threadId" };
        const threadService = new ConversationThreadService(this.db);

        const result = await threadService.getThreadMessages(threadId, {
            page: Number(page) || 1,
            limit: Math.min(Number(limit) || 30, 50),
        });

        if (result.error) return result;

        return {
            thread: {
                senderId: result.thread?.senderId,
                platform: result.thread?.platform,
                botName: result.thread?.botName,
                outcome: result.thread?.outcome,
                userMessages: result.thread?.stats?.userMessages || 0,
                orderedProducts: result.thread?.orderedProducts || [],
                totalOrderAmount: result.thread?.totalOrderAmount || 0,
            },
            messages: (result.messages || []).map(m => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
            })),
            pagination: result.pagination,
        };
    }

    // ──────────────────────────── TOOL DISPATCH ────────────────────────────

    getToolDefinitions() {
        return [
            // ── Instruction Read Tools ──
            { type: "function", function: { name: "get_instruction_overview", description: "ดูภาพรวมของ instruction: ชื่อ, description, จำนวน data items, สรุปแต่ละ item (title, type, row count, column names) — ไม่ดึงเนื้อหาจริง", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "get_data_item_detail", description: "ดูข้อมูลของ data item: ถ้าเป็น text ดึง content บางส่วน, ถ้าเป็น table ดึง columns + preview 5 rows แรก", parameters: { type: "object", properties: { itemId: { type: "string", description: "ID ของ data item" } }, required: ["itemId"] } } },
            { type: "function", function: { name: "get_rows", description: "ดึงแถวจาก data item ประเภทตาราง แบบแบ่งหน้า", parameters: { type: "object", properties: { itemId: { type: "string" }, startRow: { type: "number", description: "แถวเริ่มต้น (0-indexed, default 0)" }, limit: { type: "number", description: "จำนวนแถว (max 50, default 20)" }, columns: { type: "array", items: { type: "string" }, description: "เลือกเฉพาะคอลัมน์ (optional)" } }, required: ["itemId"] } } },
            { type: "function", function: { name: "get_text_content", description: "ดึงเนื้อหาของ data item ประเภท text", parameters: { type: "object", properties: { itemId: { type: "string" }, startChar: { type: "number" }, length: { type: "number", description: "จำนวนตัวอักษร" } }, required: ["itemId"] } } },
            { type: "function", function: { name: "search_in_table", description: "ค้นหาแถวในตารางที่มี keyword ตรงกับคอลัมน์ที่ระบุ (หรือทุกคอลัมน์)", parameters: { type: "object", properties: { itemId: { type: "string" }, keyword: { type: "string" }, column: { type: "string", description: "ค้นเฉพาะคอลัมน์นี้ (optional)" }, matchMode: { type: "string", enum: ["contains", "exact", "startsWith"] }, limit: { type: "number" } }, required: ["itemId", "keyword"] } } },
            { type: "function", function: { name: "search_content", description: "ค้นหาเนื้อหาเกี่ยวข้องทั้ง instruction ด้วย Hybrid Search (keyword + semantic embedding) — ค้นทั้ง text content และ table data ทุก item — ส่งคืน snippet + ตำแหน่ง + relevance score", parameters: { type: "object", properties: { query: { type: "string", description: "สิ่งที่ต้องการค้นหา (รองรับภาษาธรรมชาติ)" }, limit: { type: "number" } }, required: ["query"] } } },
            // ── Instruction Write Tools ──
            { type: "function", function: { name: "update_cell", description: "แก้ไขค่าของ cell ในตาราง ระบุแถวและคอลัมน์", parameters: { type: "object", properties: { itemId: { type: "string" }, rowIndex: { type: "number" }, column: { type: "string" }, newValue: { type: "string" } }, required: ["itemId", "rowIndex", "column", "newValue"] } } },
            { type: "function", function: { name: "update_rows_bulk", description: "แก้ไขหลาย cell ในตารางพร้อมกัน", parameters: { type: "object", properties: { itemId: { type: "string" }, updates: { type: "array", items: { type: "object", properties: { rowIndex: { type: "number" }, column: { type: "string" }, newValue: { type: "string" } }, required: ["rowIndex", "column", "newValue"] } } }, required: ["itemId", "updates"] } } },
            { type: "function", function: { name: "add_row", description: "เพิ่มแถวใหม่ในตาราง", parameters: { type: "object", properties: { itemId: { type: "string" }, rowData: { type: "object", description: "key=ชื่อคอลัมน์ value=ค่า" }, position: { type: "string", enum: ["start", "end", "after"] }, afterRowIndex: { type: "number" } }, required: ["itemId", "rowData"] } } },
            { type: "function", function: { name: "delete_row", description: "ลบแถวในตาราง", parameters: { type: "object", properties: { itemId: { type: "string" }, rowIndex: { type: "number" } }, required: ["itemId", "rowIndex"] } } },
            { type: "function", function: { name: "update_text_content", description: "แก้ไขเนื้อหาของ data item ประเภท text — รองรับ replace_all, find_replace, append, prepend", parameters: { type: "object", properties: { itemId: { type: "string" }, mode: { type: "string", enum: ["replace_all", "find_replace", "append", "prepend"] }, content: { type: "string" }, find: { type: "string" }, replaceWith: { type: "string" } }, required: ["itemId", "mode"] } } },
            { type: "function", function: { name: "add_column", description: "เพิ่มคอลัมน์ใหม่ในตาราง", parameters: { type: "object", properties: { itemId: { type: "string" }, columnName: { type: "string" }, defaultValue: { type: "string" }, position: { type: "string", enum: ["start", "end", "after"] }, afterColumn: { type: "string" } }, required: ["itemId", "columnName"] } } },
            { type: "function", function: { name: "delete_rows_bulk_confirm", description: "ขั้นตอน 1 ของการลบหลายแถว — ดูตัวอย่างแถวที่จะลบ + ได้ confirmToken (ต้องเรียกก่อน delete_rows_bulk เสมอ)", parameters: { type: "object", properties: { itemId: { type: "string" }, rowIndices: { type: "array", items: { type: "number" }, description: "รายการ rowIndex ที่ต้องการลบ (สูงสุด 50)" } }, required: ["itemId", "rowIndices"] } } },
            { type: "function", function: { name: "delete_rows_bulk", description: "ขั้นตอน 2 ของการลบหลายแถว — ลบจริงโดยใช้ confirmToken จาก delete_rows_bulk_confirm", parameters: { type: "object", properties: { itemId: { type: "string" }, confirmToken: { type: "string", description: "token จาก delete_rows_bulk_confirm" } }, required: ["itemId", "confirmToken"] } } },
            { type: "function", function: { name: "delete_column", description: "ลบคอลัมน์ออกจากตาราง — ลบทั้งหัวคอลัมน์และข้อมูลในคอลัมน์ทุกแถว", parameters: { type: "object", properties: { itemId: { type: "string" }, columnName: { type: "string", description: "ชื่อคอลัมน์ที่ต้องการลบ" } }, required: ["itemId", "columnName"] } } },
            { type: "function", function: { name: "delete_data_item", description: "ลบชุดข้อมูลทั้งอัน (ตารางหรือข้อความ) — ต้องยืนยันด้วย confirmTitle ที่ตรงกับชื่อชุดข้อมูล — เรียกครั้งแรกโดยไม่มี confirmTitle เพื่อดู preview ก่อน", parameters: { type: "object", properties: { itemId: { type: "string", description: "ID ของชุดข้อมูลที่ต้องการลบ" }, confirmTitle: { type: "string", description: "ชื่อชุดข้อมูลเพื่อยืนยันการลบ (ต้องตรงกับ title)" } }, required: ["itemId"] } } },
            // ── Create Data Item Tools ──
            { type: "function", function: { name: "create_table_item", description: "สร้างชุดข้อมูลใหม่ประเภทตาราง — ระบุชื่อ, คอลัมน์, และข้อมูลเริ่มต้น (optional) — ใช้เมื่อต้องการเพิ่มตารางใหม่ใน instruction", parameters: { type: "object", properties: { title: { type: "string", description: "ชื่อของชุดข้อมูล" }, columns: { type: "array", items: { type: "string" }, description: "รายการชื่อคอลัมน์" }, rows: { type: "array", items: { type: "object" }, description: "ข้อมูลเริ่มต้น — array ของ object { columnName: value } (optional, สูงสุด 500 แถว)" } }, required: ["title", "columns"] } } },
            { type: "function", function: { name: "create_text_item", description: "สร้างชุดข้อมูลใหม่ประเภทข้อความ — ระบุชื่อและเนื้อหาข้อความ — ใช้เมื่อต้องการเพิ่มคำอธิบาย, คำแนะนำ, หรือเนื้อหาอื่นๆ ใน instruction", parameters: { type: "object", properties: { title: { type: "string", description: "ชื่อของชุดข้อมูล" }, content: { type: "string", description: "เนื้อหาข้อความ" } }, required: ["title"] } } },
            // ── Conversation Starter Tools ──
            { type: "function", function: { name: "get_conversation_starter", description: "ดูการตั้งค่าข้อความเริ่มต้นการสนทนา (เปิด/ปิด + ลำดับข้อความ/รูปภาพ/วิดีโอ)", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "set_conversation_starter_enabled", description: "เปิดหรือปิดระบบข้อความเริ่มต้นการสนทนา", parameters: { type: "object", properties: { enabled: { type: "boolean", description: "true=เปิด, false=ปิด" } }, required: ["enabled"] } } },
            { type: "function", function: { name: "add_conversation_starter_message", description: "เพิ่มข้อความเริ่มต้น (text/image/video) เข้า sequence ตามลำดับ", parameters: { type: "object", properties: { type: { type: "string", enum: ["text", "image", "video"] }, content: { type: "string", description: "เนื้อหาข้อความ (เมื่อ type=text)" }, imageUrl: { type: "string", description: "URL รูป (เมื่อ type=image และไม่มี assetId)" }, videoUrl: { type: "string", description: "URL วิดีโอ (เมื่อ type=video)" }, previewUrl: { type: "string", description: "URL preview ของรูป/วิดีโอ (optional, แนะนำเมื่อเป็น video บน LINE)" }, alt: { type: "string", description: "ข้อความกำกับรูป/วิดีโอ (optional)" }, assetId: { type: "string", description: "assetId จาก follow_up_assets (optional, ใช้ได้กับ type=image)" }, position: { type: "string", enum: ["start", "end"], description: "เพิ่มต้นรายการหรือท้ายรายการ (default=end)" } }, required: ["type"] } } },
            { type: "function", function: { name: "update_conversation_starter_message", description: "แก้ไขข้อความเริ่มต้นที่มีอยู่ตาม messageId", parameters: { type: "object", properties: { messageId: { type: "string", description: "ID ของข้อความที่ต้องการแก้ไข" }, content: { type: "string", description: "เนื้อหาใหม่ (เมื่อเป็น text)" }, imageUrl: { type: "string", description: "URL รูปใหม่ (เมื่อเป็น image)" }, videoUrl: { type: "string", description: "URL วิดีโอใหม่ (เมื่อเป็น video)" }, previewUrl: { type: "string", description: "URL preview ใหม่ (optional)" }, alt: { type: "string", description: "alt/caption ใหม่ (optional)" }, assetId: { type: "string", description: "assetId ใหม่ (optional, ใช้ได้กับ image)" } }, required: ["messageId"] } } },
            { type: "function", function: { name: "remove_conversation_starter_message", description: "ลบข้อความเริ่มต้นออกจาก sequence ตาม messageId", parameters: { type: "object", properties: { messageId: { type: "string", description: "ID ของข้อความที่ต้องการลบ" } }, required: ["messageId"] } } },
            { type: "function", function: { name: "reorder_conversation_starter_message", description: "จัดลำดับข้อความเริ่มต้นใหม่ (เลื่อนขึ้น/ลง หรือย้ายไป index ที่กำหนด)", parameters: { type: "object", properties: { messageId: { type: "string", description: "ID ของข้อความที่ต้องการย้าย" }, direction: { type: "string", enum: ["up", "down"], description: "ทิศทางการเลื่อน (default=up)" }, toIndex: { type: "number", description: "ระบุตำแหน่งปลายทางแบบ 0-index (optional)" } }, required: ["messageId"] } } },
            // ── Follow-Up Management Tools ──
            { type: "function", function: { name: "list_followup_pages", description: "ดูรายการเพจทั้งหมด (LINE + Facebook) พร้อม pageKey, สถานะติดตาม, จำนวน rounds — ใช้เพื่อดู pageKey สำหรับ tools อื่น", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "get_followup_config", description: "ดูการตั้งค่าระบบติดตามลูกค้า — ถ้าระบุ pageKeys จะดึง config เฉพาะเพจ, ถ้าไม่ระบุจะดึง config กลาง", parameters: { type: "object", properties: { pageKeys: { type: "array", items: { type: "string" }, description: "รายการ pageKey (เช่น ['line:abc123', 'facebook:xyz456']) — ถ้าไม่ระบุจะดู config กลาง" } } } } },
            { type: "function", function: { name: "get_followup_round_detail", description: "ดูรายละเอียด round ติดตามลูกค้า: ข้อความ, delay, รูปภาพ — ระบุ pageKey เพื่อดูของเพจเฉพาะ", parameters: { type: "object", properties: { roundIndex: { type: "number", description: "ลำดับ round (0-indexed)" }, pageKey: { type: "string", description: "pageKey ของเพจ เช่น 'line:abc123' (optional, ถ้าไม่ระบุจะดู global)" } }, required: ["roundIndex"] } } },
            { type: "function", function: { name: "update_followup_settings", description: "แก้ไขการตั้งค่าระบบติดตามลูกค้า — ระบุ pageKeys (array) เพื่อแก้เฉพาะเพจหลายเพจพร้อมกัน, ถ้าไม่ระบุจะแก้ config กลาง", parameters: { type: "object", properties: { autoFollowUpEnabled: { type: "boolean", description: "เปิด/ปิดระบบติดตามอัตโนมัติ" }, orderPromptInstructions: { type: "string", description: "คำสั่ง prompt สำหรับวิเคราะห์ออเดอร์" }, pageKeys: { type: "array", items: { type: "string" }, description: "รายการ pageKey เพื่อแก้เฉพาะเพจ — รองรับหลายเพจพร้อมกัน" } } } } },
            { type: "function", function: { name: "update_followup_round", description: "แก้ไขข้อความหรือ delay ของ round ติดตามลูกค้า — ระบุ pageKeys เพื่อแก้หลายเพจพร้อมกัน, ถ้าไม่ระบุจะแก้ global", parameters: { type: "object", properties: { roundIndex: { type: "number", description: "ลำดับ round (0-indexed)" }, message: { type: "string", description: "ข้อความใหม่" }, delayMinutes: { type: "number", description: "ระยะเวลารอ (นาที)" }, pageKeys: { type: "array", items: { type: "string" }, description: "รายการ pageKey เพื่อแก้เฉพาะเพจ" } }, required: ["roundIndex"] } } },
            { type: "function", function: { name: "manage_followup_images", description: "เพิ่มหรือลบรูปภาพใน round ติดตามลูกค้า — ระบุ pageKeys เพื่อแก้หลายเพจพร้อมกัน", parameters: { type: "object", properties: { roundIndex: { type: "number", description: "ลำดับ round (0-indexed)" }, action: { type: "string", enum: ["add", "remove"] }, assetId: { type: "string", description: "ID ของ asset จาก list_followup_assets" }, imageUrl: { type: "string", description: "URL ของรูปภาพ (ถ้าไม่มี assetId)" }, pageKeys: { type: "array", items: { type: "string" }, description: "รายการ pageKey เพื่อแก้เฉพาะเพจ" } }, required: ["roundIndex", "action"] } } },
            { type: "function", function: { name: "list_followup_assets", description: "ดูรายการรูปภาพที่อัปโหลดไว้สำหรับระบบติดตามลูกค้า — ใช้เพื่อดู assetId ที่จะ reference ใน manage_followup_images", parameters: { type: "object", properties: {} } } },
            // ── Page Model Tool ──
            { type: "function", function: { name: "update_page_model", description: "เปลี่ยนโมเดล AI ของเพจ — ระบุ pageKeys (array) เพื่อเปลี่ยนหลายเพจพร้อมกัน เช่น gpt-5, gpt-4.1-mini, gpt-5-mini", parameters: { type: "object", properties: { pageKeys: { type: "array", items: { type: "string" }, description: "รายการ pageKey ที่ต้องการเปลี่ยนโมเดล" }, model: { type: "string", description: "ชื่อโมเดล เช่น gpt-5, gpt-4.1-mini, gpt-5-mini, gpt-5-nano" } }, required: ["pageKeys", "model"] } } },
            // ── Conversation Analysis Tools ──
            { type: "function", function: { name: "get_conversation_stats", description: "ดูสถิติภาพรวมของสนทนาลูกค้าที่ใช้ instruction นี้: conversion rate, จำนวนสนทนา, ยอดขาย, สินค้ายอดนิยม, แพลตฟอร์ม — ใช้เพื่อวิเคราะห์ประสิทธิภาพ", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "search_conversations", description: "ค้นหาสนทนาลูกค้าตามเงื่อนไข: outcome (purchased/not_purchased/pending), จำนวนข้อความ, สินค้า — ส่งคืนรายการ threads พร้อม threadId สำหรับดูรายละเอียด", parameters: { type: "object", properties: { outcome: { type: "string", description: "กรอง: purchased, not_purchased, pending" }, minMessages: { type: "number", description: "จำนวนข้อความลูกค้าขั้นต่ำ" }, maxMessages: { type: "number", description: "จำนวนข้อความลูกค้าสูงสุด" }, products: { type: "array", items: { type: "string" }, description: "กรองตามสินค้าที่ซื้อ" }, limit: { type: "number", description: "จำนวนผลลัพธ์ (default 10, max 20)" } } } } },
            { type: "function", function: { name: "get_conversation_detail", description: "ดูข้อความจริงของสนทนาลูกค้า — ใช้ threadId จาก search_conversations — แสดงทั้งข้อความลูกค้าและคำตอบ AI", parameters: { type: "object", properties: { threadId: { type: "string", description: "ID ของ thread จาก search_conversations" }, page: { type: "number" }, limit: { type: "number" } }, required: ["threadId"] } } },
            // ── Version Management Tools ──
            { type: "function", function: { name: "list_versions", description: "ดูรายการเวอร์ชันทั้งหมดของ instruction นี้ — แสดง version number, วันที่บันทึก, หมายเหตุ", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "save_version", description: "บันทึกสถานะปัจจุบันของ instruction เป็นเวอร์ชันใหม่ พร้อมหมายเหตุ — ใช้เมื่อแก้ไขเสร็จแล้วต้องการจดบันทึกไว้", parameters: { type: "object", properties: { note: { type: "string", description: "หมายเหตุสำหรับเวอร์ชันนี้ เช่น 'เพิ่มโปรโมชันเดือน ก.พ.'" } } } } },
            { type: "function", function: { name: "view_version_detail", description: "ดูรายละเอียดของเวอร์ชันเก่า — แสดง data items, columns, row count, เนื้อหา text", parameters: { type: "object", properties: { version: { type: "number", description: "หมายเลขเวอร์ชัน" } }, required: ["version"] } } },
            { type: "function", function: { name: "compare_version_stats", description: "เปรียบเทียบสถิติสนทนาลูกค้าระหว่าง 2 เวอร์ชัน — ดูว่า conversion rate เพิ่มขึ้นหรือลดลง", parameters: { type: "object", properties: { version1: { type: "number", description: "เวอร์ชันแรก" }, version2: { type: "number", description: "เวอร์ชันที่สอง" } }, required: ["version1", "version2"] } } },
        ];
    }

    async executeTool(toolName, args, instructionId, sessionId) {
        const readTools = [
            "get_instruction_overview",
            "get_data_item_detail",
            "get_rows",
            "get_text_content",
            "search_in_table",
            "search_content",
            "get_conversation_starter",
        ];
        const writeTools = [
            "update_cell",
            "update_rows_bulk",
            "add_row",
            "delete_row",
            "update_text_content",
            "add_column",
            "delete_column",
            "delete_rows_bulk",
            "delete_data_item",
            "create_table_item",
            "create_text_item",
            "set_conversation_starter_enabled",
            "add_conversation_starter_message",
            "update_conversation_starter_message",
            "remove_conversation_starter_message",
            "reorder_conversation_starter_message",
        ];
        const confirmTools = ["delete_rows_bulk_confirm"];
        // Follow-up tools (not tied to instructionId)
        const followUpReadTools = ["get_followup_config", "get_followup_round_detail", "list_followup_assets", "list_followup_pages"];
        const followUpWriteTools = ["update_followup_settings", "update_followup_round", "manage_followup_images", "update_page_model"];

        if (readTools.includes(toolName)) {
            if (toolName === "get_instruction_overview") return this.get_instruction_overview(instructionId);
            if (toolName === "search_content") return this.search_content(instructionId, args);
            return this[toolName](instructionId, args);
        }

        if (confirmTools.includes(toolName)) {
            return this[toolName](instructionId, args);
        }

        if (writeTools.includes(toolName)) {
            const result = await this[toolName](instructionId, args, sessionId);
            if (!result?.error) this._notifyInstructionRuntimeChanged();
            return result;
        }

        // Follow-up tools — no instructionId needed
        if (followUpReadTools.includes(toolName)) {
            if (toolName === "list_followup_pages") return this.list_followup_pages();
            if (toolName === "get_followup_config") return this.get_followup_config(args);
            if (toolName === "list_followup_assets") return this.list_followup_assets();
            return this[toolName](args);
        }

        if (followUpWriteTools.includes(toolName)) {
            const result = await this[toolName](args);
            if (!result?.error) this._notifyAllRuntimeChanged();
            return result;
        }

        // Conversation analysis tools
        const conversationTools = ["get_conversation_stats", "search_conversations", "get_conversation_detail"];
        if (conversationTools.includes(toolName)) {
            if (toolName === "get_conversation_stats") return this.get_conversation_stats(instructionId);
            return this[toolName](instructionId, args);
        }

        // Version management tools
        const versionReadTools = ["list_versions", "view_version_detail", "compare_version_stats"];
        const versionWriteTools = ["save_version"];
        if (versionReadTools.includes(toolName)) {
            if (toolName === "list_versions") return this.list_versions(instructionId);
            return this[toolName](instructionId, args);
        }
        if (versionWriteTools.includes(toolName)) {
            return this[toolName](instructionId, args, sessionId);
        }

        return { error: `Unknown tool: ${toolName}` };
    }
}

module.exports = InstructionChatService;
