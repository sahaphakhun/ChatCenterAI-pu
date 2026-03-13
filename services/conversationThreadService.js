/**
 * Conversation Thread Service
 * Aggregates and manages conversation threads for InstructionAI analytics.
 * Threads group chat_history messages by senderId+botId+platform,
 * enriched with instruction refs, order data, and auto-tags.
 */

const { ObjectId } = require("mongodb");
const crypto = require("crypto");

class ConversationThreadService {
    constructor(db) {
        this.db = db;
        this.threadColl = db.collection("conversation_threads");
        this.chatColl = db.collection("chat_history");
        this.orderColl = db.collection("orders");
    }

    // ──────────────────────────── THREAD MANAGEMENT ────────────────────────────

    /**
     * Generate a deterministic threadId from senderId + botId + platform
     */
    _generateThreadId(senderId, botId, platform) {
        const raw = `${senderId}::${botId || "default"}::${platform || "line"}`;
        return "thread_" + crypto.createHash("md5").update(raw).digest("hex").substring(0, 16);
    }

    /**
     * Create or update a conversation thread when a message is saved.
     * This is called from saveChatHistory() in index.js.
     */
    async upsertThread(
        senderId,
        platform,
        botId,
        instructionRefs = [],
        botName = null,
        instructionMeta = [],
    ) {
        if (!senderId) return null;

        const threadId = this._generateThreadId(senderId, botId, platform);
        const now = new Date();

        // Compute stats from chat_history
        const stats = await this._computeStats(senderId, botId, platform);

        // Build the upsert
        const setOnInsert = {
            threadId,
            senderId,
            platform: platform || "line",
            botId: botId || null,
            createdAt: now,
        };

        const setAlways = {
            updatedAt: now,
            "stats.totalMessages": stats.totalMessages,
            "stats.userMessages": stats.userMessages,
            "stats.assistantMessages": stats.assistantMessages,
            "stats.lastMessageAt": stats.lastMessageAt || now,
        };

        if (stats.firstMessageAt) {
            setAlways["stats.firstMessageAt"] = stats.firstMessageAt;
        }

        if (stats.firstMessageAt && stats.lastMessageAt) {
            setAlways["stats.durationMinutes"] = Math.round(
                (stats.lastMessageAt - stats.firstMessageAt) / 60000
            );
        }

        if (botName) {
            setAlways.botName = botName;
        }

        const normalizedInstructionMeta = this._normalizeInstructionMeta(
            instructionMeta,
            instructionRefs,
        );

        // Merge instruction refs/meta (addToSet each one)
        const addToSetOps = {};
        if (Array.isArray(instructionRefs) && instructionRefs.length > 0) {
            addToSetOps.instructionRefs = {
                $each: instructionRefs.filter(r => r && r.instructionId).map(r => ({
                    instructionId: r.instructionId,
                    version: r.version != null ? r.version : null,
                })),
            };
        }
        if (normalizedInstructionMeta.length > 0) {
            addToSetOps.instructionMeta = {
                $each: normalizedInstructionMeta,
            };
        }

        const updateOps = {
            $set: setAlways,
            $setOnInsert: setOnInsert,
        };
        if (Object.keys(addToSetOps).length > 0) {
            updateOps.$addToSet = addToSetOps;
        }

        try {
            await this.threadColl.updateOne(
                { threadId },
                updateOps,
                { upsert: true }
            );

            // Enrich with order data & auto-tag (background, non-blocking)
            this.updateThreadOrderInfo(threadId, senderId, platform, botId).then(() => {
                this.autoTagThread(threadId).catch(() => { });
            }).catch(() => { });
        } catch (err) {
            console.warn("[ConversationThread] upsert error:", err.message);
        }

        return threadId;
    }

    _normalizeInstructionMeta(instructionMeta = [], instructionRefs = []) {
        const normalized = [];
        const seen = new Set();

        const pushMeta = (candidate = {}) => {
            const instructionId =
                typeof candidate.instructionId === "string"
                    ? candidate.instructionId.trim()
                    : "";
            if (!instructionId) return;
            const versionNumber =
                Number.isInteger(candidate.versionNumber) && candidate.versionNumber > 0
                    ? candidate.versionNumber
                    : Number.isInteger(candidate.version) && candidate.version > 0
                        ? candidate.version
                        : null;
            const versionLabel =
                typeof candidate.versionLabel === "string" && candidate.versionLabel.trim()
                    ? candidate.versionLabel.trim()
                    : versionNumber != null
                        ? `v${versionNumber}`
                        : "legacy";
            const source =
                typeof candidate.source === "string" && candidate.source.trim()
                    ? candidate.source.trim()
                    : versionNumber != null
                        ? "resolved"
                        : "legacy";
            const key = `${instructionId}::${versionLabel}`;
            if (seen.has(key)) return;
            seen.add(key);
            normalized.push({
                instructionId,
                versionNumber,
                versionLabel,
                source,
            });
        };

        if (Array.isArray(instructionMeta)) {
            instructionMeta.forEach((entry) => {
                if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
                pushMeta(entry);
            });
        }
        if (Array.isArray(instructionRefs)) {
            instructionRefs.forEach((entry) => {
                if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
                if (!entry.instructionId) return;
                pushMeta({
                    instructionId: entry.instructionId,
                    versionNumber: Number.isInteger(entry.version) ? entry.version : null,
                    source: Number.isInteger(entry.version) ? "resolved" : "legacy",
                });
            });
        }

        return normalized;
    }

    _buildInstructionQuery(instructionId, version = null) {
        const normalizedInstructionId =
            typeof instructionId === "string" ? instructionId.trim() : "";
        if (!normalizedInstructionId) return {};

        const parsedVersion = Number(version);
        if (Number.isInteger(parsedVersion) && parsedVersion > 0) {
            return {
                $or: [
                    {
                        instructionRefs: {
                            $elemMatch: {
                                instructionId: normalizedInstructionId,
                                version: parsedVersion,
                            },
                        },
                    },
                    {
                        instructionMeta: {
                            $elemMatch: {
                                instructionId: normalizedInstructionId,
                                versionNumber: parsedVersion,
                            },
                        },
                    },
                    {
                        instructionMeta: {
                            $elemMatch: {
                                instructionId: normalizedInstructionId,
                                versionLabel: `v${parsedVersion}`,
                            },
                        },
                    },
                ],
            };
        }

        return {
            $or: [
                { "instructionRefs.instructionId": normalizedInstructionId },
                { "instructionMeta.instructionId": normalizedInstructionId },
            ],
        };
    }

    /**
     * Compute message stats from chat_history for a given user+bot+platform
     */
    async _computeStats(senderId, botId, platform) {
        const query = { senderId };
        if (botId) query.botId = botId;
        if (platform) query.platform = platform;

        const pipeline = [
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalMessages: { $sum: 1 },
                    userMessages: {
                        $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] },
                    },
                    assistantMessages: {
                        $sum: { $cond: [{ $eq: ["$role", "assistant"] }, 1, 0] },
                    },
                    firstMessageAt: { $min: "$timestamp" },
                    lastMessageAt: { $max: "$timestamp" },
                },
            },
        ];

        const result = await this.chatColl.aggregate(pipeline).toArray();
        if (result.length === 0) {
            return { totalMessages: 0, userMessages: 0, assistantMessages: 0, firstMessageAt: null, lastMessageAt: null };
        }
        return result[0];
    }

    /**
     * Update order info for a thread by looking up orders collection.
     */
    async updateThreadOrderInfo(threadId, senderId, platform, botId) {
        const orderQuery = { userId: senderId };
        if (platform) orderQuery.platform = platform;
        if (botId) orderQuery.botId = botId;

        const orders = await this.orderColl.find(orderQuery).sort({ extractedAt: -1 }).toArray();

        const hasOrder = orders.length > 0;
        const orderIds = orders.map(o => o._id.toString());
        const orderedProducts = [];
        let totalOrderAmount = 0;
        let latestStatus = "unknown";

        for (const order of orders) {
            if (order.status) latestStatus = order.status;
            const items = order.orderData?.items || [];
            for (const item of items) {
                if (item.product && !orderedProducts.includes(item.product)) {
                    orderedProducts.push(item.product);
                }
            }
            if (order.orderData?.totalAmount) {
                totalOrderAmount += Number(order.orderData.totalAmount) || 0;
            }
        }

        // Determine outcome
        let outcome = "unknown";
        if (hasOrder) {
            const hasCompleted = orders.some(o => o.status === "completed" || o.status === "confirmed" || o.status === "shipped");
            outcome = hasCompleted ? "purchased" : "pending";
        }

        await this.threadColl.updateOne(
            { threadId },
            {
                $set: {
                    hasOrder,
                    orderIds,
                    orderedProducts,
                    orderStatus: latestStatus,
                    totalOrderAmount,
                    outcome,
                    updatedAt: new Date(),
                },
            }
        );
    }

    /**
     * Auto-tag a thread based on its stats and order info.
     */
    async autoTagThread(threadId) {
        const thread = await this.threadColl.findOne({ threadId });
        if (!thread) return;

        const tags = new Set(Array.isArray(thread.tags) ? thread.tags.filter(t => !t.startsWith("auto:")) : []);

        // Auto tags
        if (thread.outcome === "purchased") tags.add("auto:purchased");
        if (thread.outcome === "not_purchased") tags.add("auto:not-purchased");

        const userMsgs = thread.stats?.userMessages || 0;
        if (userMsgs >= 20) tags.add("auto:high-engagement");
        else if (userMsgs >= 5) tags.add("auto:medium-engagement");
        else tags.add("auto:low-engagement");

        if (thread.hasOrder && thread.totalOrderAmount >= 5000) tags.add("auto:high-value");
        if ((thread.stats?.durationMinutes || 0) > 60) tags.add("auto:long-conversation");

        await this.threadColl.updateOne(
            { threadId },
            { $set: { tags: [...tags], updatedAt: new Date() } }
        );
    }

    // ──────────────────────────── QUERY & FILTERING ────────────────────────────

    /**
     * Get conversation threads for a specific instruction + version with advanced filters.
     */
    async getThreadsByInstruction(instructionId, version, filters = {}, pagination = {}) {
        const query = this._buildInstructionQuery(instructionId, version);

        // Outcome filter
        if (filters.outcome && Array.isArray(filters.outcome) && filters.outcome.length > 0) {
            query.outcome = { $in: filters.outcome };
        }

        // Message count filters (user messages only — ฝั่งลูกค้า)
        if (filters.minUserMessages != null || filters.maxUserMessages != null) {
            query["stats.userMessages"] = {};
            if (filters.minUserMessages != null) query["stats.userMessages"].$gte = Number(filters.minUserMessages);
            if (filters.maxUserMessages != null) query["stats.userMessages"].$lte = Number(filters.maxUserMessages);
        }

        // Product filter (multi-select — OR logic)
        if (filters.products && Array.isArray(filters.products) && filters.products.length > 0) {
            query.orderedProducts = { $in: filters.products };
        }

        // Tags filter
        if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
            query.tags = { $all: filters.tags };
        }

        // Platform filter
        if (filters.platform && filters.platform !== "all") {
            query.platform = filters.platform;
        }

        // Bot filter
        if (filters.botId) {
            query.botId = filters.botId;
        }

        // Date range
        if (filters.dateFrom || filters.dateTo) {
            query["stats.lastMessageAt"] = {};
            if (filters.dateFrom) query["stats.lastMessageAt"].$gte = new Date(filters.dateFrom);
            if (filters.dateTo) query["stats.lastMessageAt"].$lte = new Date(filters.dateTo);
        }

        // Sort
        const sortMap = {
            newest: { "stats.lastMessageAt": -1 },
            oldest: { "stats.lastMessageAt": 1 },
            most_messages: { "stats.userMessages": -1 },
            highest_order: { totalOrderAmount: -1 },
        };
        const sort = sortMap[filters.sortBy] || sortMap.newest;

        // Pagination
        const page = Math.max(1, Number(pagination.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(pagination.limit) || 20));
        const skip = (page - 1) * limit;

        const [threads, totalCount] = await Promise.all([
            this.threadColl.find(query).sort(sort).skip(skip).limit(limit).toArray(),
            this.threadColl.countDocuments(query),
        ]);

        return {
            threads: threads.map(t => this._formatThread(t)),
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                hasMore: page * limit < totalCount,
            },
        };
    }

    /**
     * Get full messages for a specific thread
     */
    async getThreadMessages(threadId, pagination = {}) {
        const thread = await this.threadColl.findOne({ threadId });
        if (!thread) return { error: "ไม่พบ thread" };

        const query = { senderId: thread.senderId };
        if (thread.botId) query.botId = thread.botId;
        if (thread.platform) query.platform = thread.platform;

        const page = Math.max(1, Number(pagination.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 50));
        const skip = (page - 1) * limit;

        const [messages, totalCount] = await Promise.all([
            this.chatColl.find(query, {
                projection: {
                    senderId: 1,
                    role: 1,
                    content: 1,
                    timestamp: 1,
                    source: 1,
                    instructionRefs: 1,
                    instructionMeta: 1,
                },
            }).sort({ timestamp: 1 }).skip(skip).limit(limit).toArray(),
            this.chatColl.countDocuments(query),
        ]);

        // Sanitize content (hide base64 images, limit length)
        const sanitized = messages.map(m => {
            let content =
                typeof m.content === "string" ? m.content : JSON.stringify(m.content || "");
            // Strip base64 images
            content = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[รูปภาพ]");
            // Limit long messages
            if (content.length > 2000) {
                content = content.substring(0, 2000) + "... (ตัดเหลือ 2,000 ตัวอักษร)";
            }
            const messageInstructionRefs = Array.isArray(m.instructionRefs)
                ? m.instructionRefs
                : [];
            const messageInstructionMeta = this._normalizeInstructionMeta(
                m.instructionMeta,
                messageInstructionRefs,
            );
            return {
                _id: m._id?.toString(),
                role: m.role,
                content,
                timestamp: m.timestamp,
                source: m.source || (m.role === "user" ? "user" : "ai"),
                instructionRefs: messageInstructionRefs,
                instructionMeta: messageInstructionMeta,
            };
        });

        return {
            thread: this._formatThread(thread),
            messages: sanitized,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                hasMore: page * limit < totalCount,
            },
        };
    }

    /**
     * Search messages within threads for a keyword
     */
    async searchInThreads(instructionId, version, keyword, limit = 20) {
        // First get threadIds for this instruction
        const threadQuery = this._buildInstructionQuery(instructionId, version);

        const threads = await this.threadColl.find(threadQuery, {
            projection: { threadId: 1, senderId: 1, botId: 1, platform: 1 },
        }).toArray();

        if (threads.length === 0) return { results: [], totalResults: 0 };

        // Search in chat_history for these users
        const senderIds = [...new Set(threads.map(t => t.senderId))];
        const searchResults = await this.chatColl.find({
            senderId: { $in: senderIds },
            content: { $regex: keyword, $options: "i" },
        }, {
            projection: { senderId: 1, role: 1, content: 1, timestamp: 1, botId: 1, platform: 1 },
        }).sort({ timestamp: -1 }).limit(limit).toArray();

        return {
            results: searchResults.map(m => ({
                senderId: m.senderId,
                role: m.role,
                content: (m.content || "").substring(0, 500),
                timestamp: m.timestamp,
                threadId: threads.find(t => t.senderId === m.senderId && t.botId === m.botId)?.threadId,
            })),
            totalResults: searchResults.length,
        };
    }

    /**
     * Get available filter options for a given instruction
     */
    async getFilterOptions(instructionId, version) {
        const query = this._buildInstructionQuery(instructionId, version);

        const threads = await this.threadColl.find(query, {
            projection: { outcome: 1, orderedProducts: 1, platform: 1, botId: 1, botName: 1, tags: 1 },
        }).toArray();

        // Collect unique values
        const outcomes = new Set();
        const products = new Map(); // product → count
        const platforms = new Set();
        const bots = new Map(); // botId → botName
        const tags = new Set();

        for (const t of threads) {
            if (t.outcome) outcomes.add(t.outcome);
            if (t.platform) platforms.add(t.platform);
            if (t.botId && t.botName) bots.set(t.botId, t.botName);
            else if (t.botId) bots.set(t.botId, t.botId);
            if (Array.isArray(t.orderedProducts)) {
                for (const p of t.orderedProducts) {
                    products.set(p, (products.get(p) || 0) + 1);
                }
            }
            if (Array.isArray(t.tags)) {
                for (const tag of t.tags) tags.add(tag);
            }
        }

        return {
            outcomes: [...outcomes],
            products: [...products.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count })),
            platforms: [...platforms],
            bots: [...bots.entries()].map(([id, name]) => ({ id, name })),
            tags: [...tags].sort(),
            totalThreads: threads.length,
        };
    }

    // ──────────────────────────── ANALYTICS ────────────────────────────

    /**
     * Get aggregate analytics for conversations using a specific instruction
     */
    async getConversationAnalytics(instructionId, version, dateRange = {}) {
        const query = this._buildInstructionQuery(instructionId, version);
        if (dateRange.from || dateRange.to) {
            query["stats.lastMessageAt"] = {};
            if (dateRange.from) query["stats.lastMessageAt"].$gte = new Date(dateRange.from);
            if (dateRange.to) query["stats.lastMessageAt"].$lte = new Date(dateRange.to);
        }

        const pipeline = [
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalThreads: { $sum: 1 },
                    totalUserMessages: { $sum: "$stats.userMessages" },
                    totalAssistantMessages: { $sum: "$stats.assistantMessages" },
                    avgUserMessages: { $avg: "$stats.userMessages" },
                    avgDurationMinutes: { $avg: "$stats.durationMinutes" },
                    purchasedCount: {
                        $sum: { $cond: [{ $eq: ["$outcome", "purchased"] }, 1, 0] },
                    },
                    notPurchasedCount: {
                        $sum: { $cond: [{ $eq: ["$outcome", "not_purchased"] }, 1, 0] },
                    },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ["$outcome", "pending"] }, 1, 0] },
                    },
                    unknownCount: {
                        $sum: { $cond: [{ $eq: ["$outcome", "unknown"] }, 1, 0] },
                    },
                    totalOrderAmount: { $sum: "$totalOrderAmount" },
                    threadsWithOrders: {
                        $sum: { $cond: ["$hasOrder", 1, 0] },
                    },
                },
            },
        ];

        const result = await this.threadColl.aggregate(pipeline).toArray();
        const stats = result[0] || {
            totalThreads: 0, totalUserMessages: 0, totalAssistantMessages: 0,
            avgUserMessages: 0, avgDurationMinutes: 0, purchasedCount: 0,
            notPurchasedCount: 0, pendingCount: 0, unknownCount: 0,
            totalOrderAmount: 0, threadsWithOrders: 0,
        };

        // Conversion rate
        const total = stats.totalThreads || 1;
        stats.conversionRate = Math.round((stats.purchasedCount / total) * 10000) / 100;
        stats.avgUserMessages = Math.round((stats.avgUserMessages || 0) * 10) / 10;
        stats.avgDurationMinutes = Math.round((stats.avgDurationMinutes || 0) * 10) / 10;

        // Top products
        const topProducts = await this.threadColl.aggregate([
            { $match: query },
            { $unwind: "$orderedProducts" },
            { $group: { _id: "$orderedProducts", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]).toArray();

        stats.topProducts = topProducts.map(p => ({ product: p._id, count: p.count }));

        // Platform breakdown
        const platformBreakdown = await this.threadColl.aggregate([
            { $match: query },
            { $group: { _id: "$platform", count: { $sum: 1 } } },
        ]).toArray();

        stats.platformBreakdown = {};
        for (const p of platformBreakdown) {
            stats.platformBreakdown[p._id || "unknown"] = p.count;
        }

        return stats;
    }

    // ──────────────────────────── TAG MANAGEMENT ────────────────────────────

    /**
     * Add or remove manual tags on a thread
     */
    async manageTags(threadId, addTags = [], removeTags = []) {
        const ops = {};
        if (addTags.length > 0) {
            // Prefix manual tags to distinguish from auto tags
            ops.$addToSet = { tags: { $each: addTags.map(t => `manual:${t}`) } };
        }

        const thread = await this.threadColl.findOne({ threadId });
        if (!thread) return { error: "ไม่พบ thread" };

        if (addTags.length > 0) {
            await this.threadColl.updateOne({ threadId }, {
                $addToSet: { tags: { $each: addTags.map(t => t.startsWith("manual:") ? t : `manual:${t}`) } },
            });
        }

        if (removeTags.length > 0) {
            await this.threadColl.updateOne({ threadId }, {
                $pull: { tags: { $in: removeTags } },
            });
        }

        const updated = await this.threadColl.findOne({ threadId });
        return { success: true, tags: updated?.tags || [] };
    }

    // ──────────────────────────── REBUILD / MIGRATION ────────────────────────────

    /**
     * Rebuild all threads from chat_history — one-time migration.
     * Groups by senderId+botId+platform, looks up bot config for instructionRefs.
     */
    async rebuildAllThreads(progressCallback = null) {
        // Get all unique senderId+botId+platform combinations
        const groups = await this.chatColl.aggregate([
            {
                $group: {
                    _id: { senderId: "$senderId", botId: "$botId", platform: "$platform" },
                    totalMessages: { $sum: 1 },
                    userMessages: { $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] } },
                    assistantMessages: { $sum: { $cond: [{ $eq: ["$role", "assistant"] }, 1, 0] } },
                    firstMessageAt: { $min: "$timestamp" },
                    lastMessageAt: { $max: "$timestamp" },
                },
            },
        ]).toArray();

        // Pre-load all bots for instruction ref lookup
        const [lineBots, fbBots] = await Promise.all([
            this.db.collection("line_bots").find({}, { projection: { _id: 1, name: 1, selectedInstructions: 1 } }).toArray(),
            this.db.collection("facebook_bots").find({}, { projection: { _id: 1, name: 1, selectedInstructions: 1 } }).toArray(),
        ]);

        const botMap = new Map();
        for (const bot of [...lineBots, ...fbBots]) {
            botMap.set(bot._id.toString(), {
                name: bot.name || "",
                selectedInstructions: bot.selectedInstructions || [],
            });
        }

        let processed = 0;
        const total = groups.length;

        for (const group of groups) {
            const { senderId, botId, platform } = group._id;
            const threadId = this._generateThreadId(senderId, botId, platform);

            // Look up instruction refs from bot config
            let instructionRefs = [];
            let instructionMeta = [];
            let botName = null;
            if (botId && botMap.has(botId)) {
                const botInfo = botMap.get(botId);
                botName = botInfo.name;
                instructionRefs = (botInfo.selectedInstructions || [])
                    .map((s) => {
                        if (s && typeof s === "object" && s.instructionId) {
                            return {
                                instructionId: s.instructionId,
                                version: s.version != null ? s.version : null,
                            };
                        }
                        if (typeof s === "string" && s.trim()) {
                            return { instructionId: s.trim(), version: null };
                        }
                        return null;
                    })
                    .filter(Boolean);
                instructionMeta = this._normalizeInstructionMeta([], instructionRefs);
            }

            const durationMinutes = group.firstMessageAt && group.lastMessageAt
                ? Math.round((group.lastMessageAt - group.firstMessageAt) / 60000)
                : 0;

            // Upsert thread
            await this.threadColl.updateOne(
                { threadId },
                {
                    $set: {
                        threadId,
                        senderId,
                        platform: platform || "line",
                        botId: botId || null,
                        botName,
                        instructionRefs,
                        instructionMeta,
                        stats: {
                            totalMessages: group.totalMessages,
                            userMessages: group.userMessages,
                            assistantMessages: group.assistantMessages,
                            firstMessageAt: group.firstMessageAt,
                            lastMessageAt: group.lastMessageAt,
                            durationMinutes,
                        },
                        updatedAt: new Date(),
                    },
                    $setOnInsert: { createdAt: new Date(), tags: [] },
                },
                { upsert: true }
            );

            // Enrich with order data
            await this.updateThreadOrderInfo(threadId, senderId, platform, botId);

            // Auto-tag
            await this.autoTagThread(threadId);

            processed++;
            if (progressCallback && processed % 100 === 0) {
                progressCallback(processed, total);
            }
        }

        return { totalGroups: total, processedThreads: processed };
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    _formatThread(thread) {
        if (!thread) return null;
        return {
            threadId: thread.threadId,
            senderId: thread.senderId,
            platform: thread.platform,
            botId: thread.botId,
            botName: thread.botName || null,
            instructionRefs: thread.instructionRefs || [],
            instructionMeta: this._normalizeInstructionMeta(
                thread.instructionMeta,
                thread.instructionRefs,
            ),
            stats: thread.stats || {},
            hasOrder: thread.hasOrder || false,
            orderIds: thread.orderIds || [],
            orderedProducts: thread.orderedProducts || [],
            orderStatus: thread.orderStatus || null,
            totalOrderAmount: thread.totalOrderAmount || 0,
            outcome: thread.outcome || "unknown",
            tags: thread.tags || [],
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
        };
    }

    /**
     * Ensure required indexes exist on conversation_threads
     */
    async ensureIndexes() {
        try {
            await this.threadColl.createIndex({ threadId: 1 }, { unique: true });
            await this.threadColl.createIndex(
                { "instructionRefs.instructionId": 1, "instructionRefs.version": 1, updatedAt: -1 }
            );
            await this.threadColl.createIndex(
                { "instructionMeta.instructionId": 1, "instructionMeta.versionNumber": 1, updatedAt: -1 }
            );
            await this.threadColl.createIndex(
                { senderId: 1, botId: 1, platform: 1 }
            );
            await this.threadColl.createIndex({ outcome: 1 });
            await this.threadColl.createIndex({ "stats.userMessages": 1 });
            await this.threadColl.createIndex({ tags: 1 });
            await this.threadColl.createIndex({ orderedProducts: 1 });
            console.log("[ConversationThread] Indexes ensured.");
        } catch (err) {
            console.warn("[ConversationThread] Index creation warning:", err.message);
        }
    }
}

module.exports = ConversationThreadService;
