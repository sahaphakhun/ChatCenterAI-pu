const moment = require("moment-timezone");
const { ObjectId } = require("mongodb");
const { AgentForgeTools } = require("./agentForgeTools");
const {
  evaluateCase,
  summarizeIteration,
} = require("./agentForgeScorer");

const DEFAULT_TIMEZONE = "Asia/Bangkok";
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_MESSAGES = 20;
const DEFAULT_MAX_ITERATIONS = 3;
const MIN_CASES_PER_ITERATION = 5;

const SIMPLE_INSTRUCTION_TEMPLATE = [
  "## บทบาท",
  "คุณคือแอดมินขายสินค้าที่ต้องตอบสั้น กระชับ และปิดการขายเร็ว",
  "",
  "## กติกาหลัก",
  "1) ตอบราคาแบบมีตัวเลือกชัดเจน",
  "2) ถ้าข้อมูลสั่งซื้อไม่ครบ ให้ถามเฉพาะจุดที่ขาด",
  "3) ถ้าข้อมูลครบ ให้สรุปยอด + ขอชื่อ/ที่อยู่/เบอร์ในข้อความเดียว",
  "4) ห้ามเดาข้อมูลสินค้า ราคา หรือบัญชีโอน",
].join("\n");

class StopRunError extends Error {
  constructor(message = "run_stop_requested") {
    super(message);
    this.name = "StopRunError";
  }
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function normalizeCaseId(caseData, index) {
  if (caseData && typeof caseData.caseId === "string" && caseData.caseId.trim()) {
    return caseData.caseId.trim();
  }
  return `case_${index + 1}`;
}

function extractResponseText(response) {
  if (!response) return "";
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (Array.isArray(response.output)) {
    const pieces = [];
    for (const item of response.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (!c) continue;
        if (typeof c.text === "string" && c.text.trim()) {
          pieces.push(c.text.trim());
        }
      }
    }
    if (pieces.length) return pieces.join("\n").trim();
  }

  if (Array.isArray(response.content)) {
    const pieces = response.content
      .map((item) => (item && typeof item.text === "string" ? item.text.trim() : ""))
      .filter(Boolean);
    if (pieces.length) return pieces.join("\n").trim();
  }

  return "";
}

function tryParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      return null;
    }
  }

  const genericBlockMatch = trimmed.match(/```\s*([\s\S]*?)```/i);
  if (genericBlockMatch && genericBlockMatch[1]) {
    try {
      return JSON.parse(genericBlockMatch[1].trim());
    } catch {
      return null;
    }
  }

  return null;
}

class AgentForgeRunner {
  constructor(options = {}) {
    this.connectDB = options.connectDB;
    this.agentForgeService = options.agentForgeService;
    this.openaiClient = options.openaiClient || null;
    this.openaiProvider = options.openaiProvider || "openai";
    this.resolveOpenAIClient = typeof options.resolveOpenAIClient === "function"
      ? options.resolveOpenAIClient
      : null;
    this.normalizeProvider = typeof options.normalizeProvider === "function"
      ? options.normalizeProvider
      : null;
    this.resolveModelForProvider = typeof options.resolveModelForProvider === "function"
      ? options.resolveModelForProvider
      : null;
    this.timezone = options.timezone || DEFAULT_TIMEZONE;
    this.activeRuns = new Map();
  }

  _normalizeProvider(provider) {
    if (this.normalizeProvider) {
      return this.normalizeProvider(provider);
    }
    if (typeof provider !== "string") return "openai";
    const normalized = provider.trim().toLowerCase();
    return normalized === "openrouter" ? "openrouter" : "openai";
  }

  _buildProviderModelError(contextLabel, modelId, provider, detail = "") {
    const normalizedProvider = this._normalizeProvider(provider);
    const detailText = detail ? ` รายละเอียด: ${detail}` : "";
    const error = new Error(
      `${contextLabel}: provider "${normalizedProvider}" ไม่รองรับ model "${modelId}".${detailText}`,
    );
    error.code = "provider_model_not_supported";
    return error;
  }

  _isProviderModelApiError(error) {
    const message = String(error?.message || "").toLowerCase();
    if (!message) return false;
    if (!message.includes("model")) return false;
    return (
      message.includes("not support") ||
      message.includes("not found") ||
      message.includes("unsupported") ||
      message.includes("no endpoints")
    );
  }

  _resolveModelForProviderOrThrow(modelId, provider, contextLabel) {
    const fallbackModel =
      typeof modelId === "string" && modelId.trim() ? modelId.trim() : "gpt-4.1";
    if (!this.resolveModelForProvider) {
      return fallbackModel;
    }
    const resolved = this.resolveModelForProvider(fallbackModel, provider);
    if (!resolved?.ok) {
      throw this._buildProviderModelError(
        contextLabel,
        fallbackModel,
        provider,
        resolved?.error || "",
      );
    }
    return resolved.model || fallbackModel;
  }

  async _getOpenAIContext() {
    const fallbackProvider = this._normalizeProvider(this.openaiProvider);
    if (this.openaiClient) {
      return {
        client: this.openaiClient,
        provider: fallbackProvider,
      };
    }
    if (!this.resolveOpenAIClient) {
      return { client: null, provider: fallbackProvider };
    }
    try {
      const resolved = await this.resolveOpenAIClient();
      if (!resolved) {
        return { client: null, provider: fallbackProvider };
      }
      if (resolved && typeof resolved === "object" && resolved.client) {
        return {
          client: resolved.client,
          provider: this._normalizeProvider(resolved.provider),
        };
      }
      return {
        client: resolved,
        provider: fallbackProvider,
      };
    } catch (error) {
      return { client: null, provider: fallbackProvider };
    }
  }

  async _getOpenAIClient() {
    const context = await this._getOpenAIContext();
    return context.client || null;
  }

  async startRun(agentId, options = {}, userContext = {}) {
    const run = await this.agentForgeService.createRun(
      agentId,
      {
        runType: options.runType || "manual",
        dryRun: !!options.dryRun,
        scheduledFor: options.scheduledFor || new Date(),
      },
      userContext,
    );

    const runPromise = this.executeRun(run._id, {
      ...options,
      runType: options.runType || "manual",
      userContext,
    }).catch((error) => {
      console.error("[AgentForgeRunner] run execution error:", error?.message || error);
    }).finally(() => {
      this.activeRuns.delete(run._id);
    });

    this.activeRuns.set(run._id, runPromise);
    return run;
  }

  async waitForRun(runId) {
    const promise = this.activeRuns.get(String(runId));
    if (!promise) return null;
    await promise;
    return this.agentForgeService.getRunById(runId);
  }

  async simulateReply({
    pageKey = null,
    instructionText = "",
    scenario = "",
    model = null,
  } = {}) {
    const safeScenario = typeof scenario === "string" && scenario.trim()
      ? scenario.trim()
      : "ลูกค้าถามราคา";

    const safeInstruction = typeof instructionText === "string" && instructionText.trim()
      ? instructionText.trim()
      : SIMPLE_INSTRUCTION_TEMPLATE;

    const openaiContext = await this._getOpenAIContext();
    const openaiClient = openaiContext.client;

    if (openaiClient) {
      let resolvedModel = model || "gpt-4.1";
      try {
        resolvedModel = this._resolveModelForProviderOrThrow(
          resolvedModel,
          openaiContext.provider,
          "Agent Forge simulate-reply",
        );
      } catch (error) {
        return {
          reply: this._buildFallbackSimulatedReply({}, safeScenario),
          modelUsed: "unsupported",
          warning: error?.message || "provider_model_not_supported",
        };
      }

      const requestPayload = {
        model: resolvedModel,
        input: [
          {
            role: "system",
            content: [
              "ตอบเป็นแอดมินขายสินค้าแบบสั้น กระชับ ปิดการขาย",
              `PageKey: ${pageKey || "unknown"}`,
              `Instruction:\\n${safeInstruction.slice(0, 12000)}`,
            ].join("\n\n"),
          },
          {
            role: "user",
            content: safeScenario,
          },
        ],
      };

      try {
        const response = await openaiClient.responses.create(requestPayload);
        const text = extractResponseText(response) || this._buildFallbackSimulatedReply({}, safeScenario);
        return {
          reply: text,
          modelUsed: requestPayload.model,
          usage: response?.usage || null,
        };
      } catch (error) {
        if (this._isProviderModelApiError(error)) {
          return {
            reply: this._buildFallbackSimulatedReply({}, safeScenario),
            modelUsed: "unsupported",
            warning: this._buildProviderModelError(
              "Agent Forge simulate-reply",
              requestPayload.model,
              openaiContext.provider,
              error?.message || "",
            ).message,
          };
        }
        return {
          reply: this._buildFallbackSimulatedReply({}, safeScenario),
          modelUsed: "fallback",
          warning: error?.message || "openai_error",
        };
      }
    }

    return {
      reply: this._buildFallbackSimulatedReply({}, safeScenario),
      modelUsed: "fallback",
      usage: null,
    };
  }

  async replayFromEvent(runId, seq, userContext = {}) {
    const sourceRun = await this.agentForgeService.getRunById(runId);
    if (!sourceRun) {
      throw new Error("run_not_found");
    }

    const checkpoints = await this.agentForgeService.listRunEvents(runId, 0, 5000);
    const targetSeq = Number(seq) || 0;
    const hasCheckpoint = checkpoints.some(
      (event) => event.seq === targetSeq && event.eventType === "checkpoint",
    );

    if (!hasCheckpoint) {
      throw new Error("checkpoint_not_found");
    }

    const newRun = await this.startRun(
      sourceRun.agentId,
      {
        dryRun: true,
        runType: "replay",
        replayFromRunId: runId,
        replayFromSeq: targetSeq,
      },
      userContext,
    );

    await this.agentForgeService.appendRunEvent(newRun._id, "replay_requested", {
      sourceRunId: runId,
      sourceSeq: targetSeq,
    }, {
      phase: "runner",
      createdBy: userContext?.username || "admin",
    });

    return newRun;
  }

  async runSelfTestsOnly(runId, userContext = {}) {
    const run = await this.agentForgeService.getRunById(runId);
    if (!run) throw new Error("run_not_found");

    const profile = await this.agentForgeService.getAgentById(run.agentId);
    if (!profile) throw new Error("agent_not_found");

    const patchText = run?.meta?.candidatePatchText || SIMPLE_INSTRUCTION_TEMPLATE;

    const selfTestResult = await this._executeSelfTests({
      runId,
      agentId: profile._id,
      profile,
      patchText,
      iteration: (run.iterations || 0) + 1,
      baselineScore: Number(run?.meta?.baselineScore || 80),
      userContext,
    });

    await this.agentForgeService.appendRunEvent(runId, "self_test_replay_completed", {
      summary: selfTestResult.summary,
    }, {
      phase: "self_test",
      createdBy: userContext?.username || "admin",
    });

    return selfTestResult;
  }

  async executeRun(runId, options = {}) {
    const run = await this.agentForgeService.getRunById(runId);
    if (!run) throw new Error("run_not_found");

    const profile = await this.agentForgeService.getAgentById(run.agentId);
    if (!profile) {
      await this.agentForgeService.finalizeRun(runId, "failed", {
        errorMessage: "agent_not_found",
      });
      return;
    }

    await this.agentForgeService.appendRunEvent(runId, "run_started", {
      agentId: profile._id,
      mode: profile.mode,
      dryRun: !!run.dryRun,
      runType: run.runType,
      pageKeys: profile.pageKeys,
    }, {
      phase: "runner",
      createdBy: "agent_forge_runner",
    });

    const lock = await this.agentForgeService.acquireRunLock(
      profile._id,
      runId,
      "agent_forge_runner",
    );

    if (!lock.acquired) {
      await this.agentForgeService.finalizeRun(runId, "rejected_concurrent", {
        errorMessage: lock.reason || "already_running",
      });
      await this.agentForgeService.appendRunEvent(runId, "run_rejected", {
        reason: lock.reason || "already_running",
      }, {
        phase: "runner",
        createdBy: "agent_forge_runner",
      });
      return;
    }

    let lockReleased = false;

    try {
      const db = (await this.connectDB()).db("chatbot");
      const tools = new AgentForgeTools(db);
      const cursorRows = await this.agentForgeService.getRunCursors(profile._id);
      const cursorMap = new Map();
      for (const row of cursorRows) {
        cursorMap.set(row.pageKey, row);
      }

      const evalWindowDays = clampNumber(profile.evaluationWindowDays, 1, 30, 3);
      const evalSinceDate = moment().tz(this.timezone).subtract(evalWindowDays, "days").toDate();
      const batchSize = clampNumber(options.batchSize || DEFAULT_BATCH_SIZE, 10, 40, DEFAULT_BATCH_SIZE);
      const maxMessages = clampNumber(options.maxMessages || DEFAULT_MAX_MESSAGES, 1, 200, DEFAULT_MAX_MESSAGES);
      const maxIterations = clampNumber(options.maxIterations || DEFAULT_MAX_ITERATIONS, 1, 8, DEFAULT_MAX_ITERATIONS);

      const contextData = {
        customersProcessed: [],
        toolCallsSummary: {
          list_customers_batch: 0,
          get_customer_conversation: 0,
        },
        conversationInsights: [],
        signalCounters: {
          asksPrice: 0,
          asksShipping: 0,
          asksPayment: 0,
          missingOrderFields: 0,
          hasGhostSignal: 0,
        },
        compactedSummaries: [],
        pageCursorUpdates: {},
        tokenEstimate: 0,
        compactionManifest: null,
      };

      await this.agentForgeService.appendRunEvent(runId, "checkpoint", {
        label: "fetch_history_start",
      }, {
        phase: "runner",
        createdBy: "agent_forge_runner",
      });

      for (const pageKey of profile.pageKeys || []) {
        await this._assertRunNotStopped(runId);
        const pageCursor = cursorMap.get(pageKey);
        const since = pageCursor?.lastProcessedAt || evalSinceDate;

        const pageResult = await this._fetchPageHistory({
          runId,
          agentId: profile._id,
          pageKey,
          since,
          batchSize,
          maxMessages,
          profile,
          tools,
          contextData,
        });

        contextData.pageCursorUpdates[pageKey] = {
          lastProcessedAt: pageResult.lastProcessedAt || since,
          lastMessageId: pageResult.lastMessageId || null,
        };
      }

      await this.agentForgeService.appendRunEvent(runId, "checkpoint", {
        label: "history_fetched",
        customersProcessedCount: contextData.customersProcessed.length,
      }, {
        phase: "runner",
        createdBy: "agent_forge_runner",
      });

      const instructionContext = await this._loadInstructionContext(profile.instructionId);
      const baselineScore = await this._resolveBaselineScore(profile, contextData);

      let patchState = await this._generateInstructionPatch({
        runId,
        profile,
        instructionContext,
        contextData,
      });

      let iteration = 0;
      let finalSelfTest = null;
      let finalDecision = "continue";

      while (iteration < maxIterations) {
        await this._assertRunNotStopped(runId);
        await this.agentForgeService.refreshRunLock(profile._id, runId);
        iteration += 1;

        const selfTestResult = await this._executeSelfTests({
          runId,
          agentId: profile._id,
          profile,
          patchText: patchState.patchText,
          iteration,
          baselineScore,
          userContext: options.userContext || {},
        });

        finalSelfTest = selfTestResult;

        const decision = this._decideIteration({
          iteration,
          maxIterations,
          selfTestResult,
          baselineScore,
        });

        finalDecision = decision.decision;

        await this.agentForgeService.logDecisionJournal(
          runId,
          iteration,
          decision.decision,
          decision.reasoningSummary,
          {
            action: decision.nextAction,
            avgScore: selfTestResult.summary.avgScore,
            baselineScore,
          },
        );

        await this.agentForgeService.appendRunEvent(runId, "agent_decision", {
          iteration,
          decision: decision.decision,
          reasoningSummary: decision.reasoningSummary,
          nextAction: decision.nextAction,
        }, {
          phase: "decision",
          createdBy: "agent_forge_runner",
        });

        await this.agentForgeService.updateRun(runId, {
          iterations: iteration,
          selfTestCount: selfTestResult.summary.totalCount,
          "meta.baselineScore": baselineScore,
          "meta.candidatePatchText": patchState.patchText,
          "meta.lastSelfTestSummary": selfTestResult.summary,
        });

        if (decision.decision === "stop_pass" || decision.decision === "stop_fail") {
          break;
        }

        patchState = await this._refineInstructionPatch({
          runId,
          iteration,
          previousPatch: patchState.patchText,
          selfTestResult,
          contextData,
          profile,
          instructionContext,
        });
      }

      const cursorUpdates = Object.entries(contextData.pageCursorUpdates).map(([pageKey, cursor]) => ({
        pageKey,
        lastProcessedAt: cursor.lastProcessedAt || new Date(),
        lastMessageId: cursor.lastMessageId || null,
      }));

      if (!finalSelfTest) {
        throw new Error("self_test_not_executed");
      }

      const shouldPublish =
        finalDecision === "stop_pass" &&
        !run.dryRun &&
        instructionContext &&
        instructionContext._id;
      const shouldAutoSwitchWorkflow =
        !run.dryRun &&
        profile.optimizationMode === "create-new" &&
        profile.createNewBootstrapDone === false;

      if (shouldPublish) {
        await this.agentForgeService.appendRunEvent(runId, "checkpoint", {
          label: "publish_and_commit_start",
        }, {
          phase: "publish",
          createdBy: "agent_forge_runner",
        });

        await this.agentForgeService.commitRunAndCursorsAtomic({
          runId,
          agentId: profile._id,
          cursorUpdates,
          instructionPublish: {
            instructionId: instructionContext._id,
            expectedVersion: instructionContext.version,
            patchText: patchState.patchText,
            runId,
            note: "Agent Forge publish",
          },
          runPatch: {
            status: "completed",
            runType: run.runType,
            iterations: iteration,
            selfTestCount: finalSelfTest.summary.totalCount,
            cursorTo: {
              updatedPages: cursorUpdates.length,
            },
            publishedVersion:
              typeof instructionContext.version === "number"
                ? instructionContext.version + 1
                : null,
            meta: {
              ...(run.meta || {}),
              baselineScore,
              finalDecision,
              candidatePatchText: patchState.patchText,
              toolCallsSummary: contextData.toolCallsSummary,
              compactionManifest: contextData.compactionManifest,
            },
          },
        });

        await this.agentForgeService.appendRunEvent(runId, "run_completed", {
          status: "completed",
          published: true,
          publishedVersion:
            typeof instructionContext.version === "number"
              ? instructionContext.version + 1
              : null,
        }, {
          phase: "runner",
          createdBy: "agent_forge_runner",
        });
      } else {
        const endStatus = run.dryRun ? "completed_dry_run" : finalDecision === "stop_pass" ? "completed_no_publish" : "needs_review";
        await this.agentForgeService.finalizeRun(runId, endStatus, {
          iterations: iteration,
          selfTestCount: finalSelfTest.summary.totalCount,
          cursorTo: {
            updatedPages: cursorUpdates.length,
          },
          meta: {
            ...(run.meta || {}),
            baselineScore,
            finalDecision,
            candidatePatchText: patchState.patchText,
            toolCallsSummary: contextData.toolCallsSummary,
            compactionManifest: contextData.compactionManifest,
          },
        });

        await this.agentForgeService.appendRunEvent(runId, "run_completed", {
          status: endStatus,
          published: false,
        }, {
          phase: "runner",
          createdBy: "agent_forge_runner",
        });
      }

      if (shouldAutoSwitchWorkflow) {
        const switchedProfile = await this.agentForgeService.markCreateNewBootstrapCompleted(
          profile._id,
          runId,
        );
        if (switchedProfile) {
          await this.agentForgeService.syncAgentConfigToPages(switchedProfile, {
            username: "agent_forge_runner",
            role: "system",
          });
          await this.agentForgeService.appendRunEvent(runId, "workflow_auto_switched", {
            from: "create-new",
            to: "improve",
            mode: switchedProfile.mode,
          }, {
            phase: "runner",
            createdBy: "agent_forge_runner",
          });
        }
      }

      await this.agentForgeService.releaseRunLock(profile._id, runId, "active");
      lockReleased = true;
    } catch (error) {
      if (error instanceof StopRunError) {
        await this.agentForgeService.finalizeRun(runId, "stopped", {
          errorMessage: "run_stop_requested",
        });
        await this.agentForgeService.appendRunEvent(runId, "run_stopped", {
          message: "Run stopped by request",
        }, {
          phase: "runner",
          createdBy: "agent_forge_runner",
        });
      } else {
        await this.agentForgeService.finalizeRun(runId, "failed", {
          errorMessage: error?.message || "run_failed",
        });
        await this.agentForgeService.appendRunEvent(runId, "run_failed", {
          message: error?.message || "run_failed",
        }, {
          phase: "runner",
          createdBy: "agent_forge_runner",
        });
      }

      throw error;
    } finally {
      if (!lockReleased) {
        try {
          await this.agentForgeService.releaseRunLock(profile._id, runId, "active");
        } catch (releaseError) {
          console.error("[AgentForgeRunner] release lock error:", releaseError);
        }
      }
    }
  }

  async _fetchPageHistory({
    runId,
    agentId,
    pageKey,
    since,
    batchSize,
    maxMessages,
    profile,
    tools,
    contextData,
  }) {
    let cursor = null;
    let hasMore = true;
    let lastProcessedAt = since;
    let lastMessageId = null;

    while (hasMore) {
      await this._assertRunNotStopped(runId);
      await this.agentForgeService.refreshRunLock(agentId, runId);

      const batchResponse = await tools.listCustomersBatch({
        pageKeys: [pageKey],
        limit: batchSize,
        cursor,
        since,
      });

      contextData.toolCallsSummary.list_customers_batch += 1;

      await this.agentForgeService.appendRunEvent(runId, "tool_call", {
        tool: "list_customers_batch",
        pageKey,
        limit: batchSize,
        toolStatus: batchResponse.toolStatus || "ok",
        latencyMs: batchResponse.latencyMs || 0,
        dataSizeBytes: batchResponse.dataSizeBytes || 0,
        truncated: !!batchResponse.truncated,
      }, {
        phase: "tools",
        createdBy: "agent_forge_runner",
      });

      const customers = Array.isArray(batchResponse.customers)
        ? batchResponse.customers
        : [];

      await this.agentForgeService.appendRunEvent(runId, "history_batch_loaded", {
        pageKey,
        limit: batchSize,
        loaded: customers.length,
        hasMore: !!batchResponse.hasMore,
      }, {
        phase: "history",
        createdBy: "agent_forge_runner",
      });

      for (const customer of customers) {
        await this._assertRunNotStopped(runId);

        const senderId = customer.senderId;
        if (!senderId) continue;

        const conversation = await tools.getCustomerConversation({
          senderId,
          pageKey,
          maxMessages,
        });

        contextData.toolCallsSummary.get_customer_conversation += 1;

        await this.agentForgeService.appendRunEvent(runId, "tool_call", {
          tool: "get_customer_conversation",
          pageKey,
          senderId,
          maxMessages,
          toolStatus: conversation.toolStatus || "ok",
          latencyMs: conversation.latencyMs || 0,
          dataSizeBytes: conversation.dataSizeBytes || 0,
          truncated: !!conversation.truncated,
        }, {
          phase: "tools",
          createdBy: "agent_forge_runner",
        });

        const insights = this._extractConversationInsights(conversation.messages || []);

        contextData.customersProcessed.push({
          pageKey,
          senderId,
          lastMessageAt: customer.lastMessageAt || null,
        });

        contextData.conversationInsights.push({
          pageKey,
          senderId,
          insights,
        });

        if (insights.asksPrice) contextData.signalCounters.asksPrice += 1;
        if (insights.asksShipping) contextData.signalCounters.asksShipping += 1;
        if (insights.asksPayment) contextData.signalCounters.asksPayment += 1;
        if (insights.missingOrderFields) contextData.signalCounters.missingOrderFields += 1;
        if (insights.hasGhostSignal) contextData.signalCounters.hasGhostSignal += 1;

        contextData.tokenEstimate += estimateTokensFromText(
          JSON.stringify(conversation.messages || []),
        );

        if (customer.lastMessageAt) {
          lastProcessedAt = customer.lastMessageAt;
        }

        const latestMessage = Array.isArray(conversation.messages)
          ? conversation.messages[conversation.messages.length - 1]
          : null;

        if (latestMessage && latestMessage.id) {
          lastMessageId = latestMessage.id;
        }
      }

      if (
        contextData.tokenEstimate >
        Number(profile.compactionTriggerTokens || 220000)
      ) {
        await this._compactContextWithModel({
          runId,
          profile,
          contextData,
          lastProcessedAt,
        });
      }

      hasMore = !!batchResponse.hasMore;
      cursor = batchResponse.nextCursor || null;
      if (!cursor) {
        hasMore = false;
      }
    }

    return {
      lastProcessedAt,
      lastMessageId,
    };
  }

  _buildCompactionManifest(contextData, lastProcessedAt) {
    const latestSummary =
      Array.isArray(contextData.compactedSummaries) &&
      contextData.compactedSummaries.length > 0
        ? contextData.compactedSummaries[contextData.compactedSummaries.length - 1]
        : null;

    return {
      customersProcessed: contextData.customersProcessed.map(
        (item) => `${item.pageKey}:${item.senderId}`,
      ),
      toolCallsSummary: { ...contextData.toolCallsSummary },
      signalCounters: { ...(contextData.signalCounters || {}) },
      lastProcessedCursor: lastProcessedAt || null,
      rounds: Array.isArray(contextData.compactedSummaries)
        ? contextData.compactedSummaries.length
        : 0,
      latestSummary: latestSummary?.summaryText || null,
      keyPatterns: Array.isArray(latestSummary?.keyPatterns)
        ? latestSummary.keyPatterns
        : [],
    };
  }

  async _compactContextWithModel({
    runId,
    profile,
    contextData,
    lastProcessedAt,
  }) {
    const openaiContext = await this._getOpenAIContext();
    const openaiClient = openaiContext.client;
    if (!openaiClient) {
      throw new Error("model_compaction_required");
    }

    const pendingInsights = Array.isArray(contextData.conversationInsights)
      ? contextData.conversationInsights
      : [];
    const triggeredAtEstimate = Number(contextData.tokenEstimate || 0);

    if (pendingInsights.length === 0) {
      return;
    }

    const previousSummary =
      Array.isArray(contextData.compactedSummaries) &&
      contextData.compactedSummaries.length > 0
        ? contextData.compactedSummaries[contextData.compactedSummaries.length - 1]
        : null;

    const resolvedModel = this._resolveModelForProviderOrThrow(
      profile.runnerModel || "gpt-5.2",
      openaiContext.provider,
      "Agent Forge context compaction",
    );

    const requestPayload = {
      model: resolvedModel,
      reasoning: {
        effort: profile.runnerThinking || "xhigh",
      },
      input: [
        {
          role: "system",
          content: [
            "You are Context Compactor for Agent Forge.",
            "Compact conversation signals while preserving business-critical facts.",
            "Return strict JSON only with keys:",
            "summaryText, keyPatterns, recommendedActions, riskFlags",
            "Do not include markdown.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            previousSummary: previousSummary || null,
            signalCounters: contextData.signalCounters || {},
            toolCallsSummary: contextData.toolCallsSummary || {},
            customersProcessedCount: contextData.customersProcessed.length,
            pendingInsights: pendingInsights.slice(-600),
          }),
        },
      ],
    };

    const compactionTurnId = `context_compaction_${Date.now()}`;

    await this.agentForgeService.storeOpenAISnapshot(
      runId,
      compactionTurnId,
      "request",
      requestPayload,
    );

    let response = null;
    try {
      response = await openaiClient.responses.create(requestPayload);
    } catch (error) {
      if (this._isProviderModelApiError(error)) {
        throw this._buildProviderModelError(
          "Agent Forge context compaction",
          requestPayload.model,
          openaiContext.provider,
          error?.message || "",
        );
      }
      await this.agentForgeService.appendRunEvent(runId, "context_compaction_failed", {
        message: error?.message || "model_compaction_failed",
      }, {
        phase: "compaction",
        createdBy: "agent_forge_runner",
      });
      throw new Error("model_compaction_failed");
    }

    await this.agentForgeService.storeOpenAISnapshot(
      runId,
      compactionTurnId,
      "response",
      response,
      response?.usage || null,
    );

    const outputText = extractResponseText(response);
    const parsed = tryParseJson(outputText);

    const summaryText =
      typeof parsed?.summaryText === "string" && parsed.summaryText.trim()
        ? parsed.summaryText.trim()
        : outputText.trim().slice(0, 8000) || "No summary generated";
    const keyPatterns = Array.isArray(parsed?.keyPatterns) ? parsed.keyPatterns : [];
    const recommendedActions = Array.isArray(parsed?.recommendedActions)
      ? parsed.recommendedActions
      : [];
    const riskFlags = Array.isArray(parsed?.riskFlags) ? parsed.riskFlags : [];

    if (!Array.isArray(contextData.compactedSummaries)) {
      contextData.compactedSummaries = [];
    }

    const round = contextData.compactedSummaries.length + 1;
    contextData.compactedSummaries.push({
      round,
      summaryText,
      keyPatterns,
      recommendedActions,
      riskFlags,
    });

    // Model-direct compaction: raw detailed insights are dropped after summarization.
    contextData.conversationInsights = [];

    contextData.tokenEstimate = estimateTokensFromText(
      JSON.stringify({
        summaryText,
        keyPatterns,
        recommendedActions,
        riskFlags,
        signalCounters: contextData.signalCounters,
      }),
    );

    contextData.compactionManifest = this._buildCompactionManifest(
      contextData,
      lastProcessedAt,
    );

    await this.agentForgeService.appendRunEvent(runId, "context_compaction", {
      mode: "model_direct",
      triggeredAtEstimate,
      summaryPreview: summaryText.slice(0, 1200),
      manifest: contextData.compactionManifest,
      modelUsed: requestPayload.model,
    }, {
      phase: "compaction",
      createdBy: "agent_forge_runner",
    });
  }

  _extractConversationInsights(messages = []) {
    const userTexts = messages
      .filter((m) => m && m.role === "user")
      .map((m) => {
        if (typeof m.content === "string") return m.content;
        if (m.content && typeof m.content === "object") {
          try {
            return JSON.stringify(m.content);
          } catch {
            return "";
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");

    const normalized = userTexts.toLowerCase();

    return {
      asksPrice: /(ราคา|เท่าไหร่|กี่บาท|โปร|promotion|price)/i.test(userTexts),
      asksShipping: /(ค่าส่ง|ส่งไหม|ส่งฟรี|ปลายทาง|cod)/i.test(userTexts),
      asksPayment: /(โอน|qr|พร้อมเพย์|บัญชี|ชำระ)/i.test(userTexts),
      missingOrderFields: /(ขวด|ชุด)/i.test(userTexts) && !/(14|22|g|กรัม)/i.test(userTexts),
      hasGhostSignal: /(หาย|เงียบ|ยังสนใจไหม|follow)/i.test(userTexts),
      userTextSample: normalized.slice(0, 300),
    };
  }

  async _loadInstructionContext(instructionId) {
    if (!instructionId) {
      return null;
    }

    const db = (await this.connectDB()).db("chatbot");
    const coll = db.collection("instructions_v2");

    const query = [];
    const objectId = toObjectId(instructionId);
    if (objectId) {
      query.push({ _id: objectId });
    }
    query.push({ instructionId: String(instructionId) });

    const doc = await coll.findOne({ $or: query });
    if (!doc) {
      return null;
    }

    const textParts = [];
    if (Array.isArray(doc.dataItems)) {
      for (const item of doc.dataItems) {
        if (!item) continue;
        if (typeof item.content === "string" && item.content.trim()) {
          textParts.push(`${item.title || item.itemId || "item"}:\n${item.content.trim()}`);
        }
      }
    }

    return {
      _id: doc._id.toString(),
      instructionId: doc.instructionId || doc._id.toString(),
      name: doc.name || "",
      version: Number.isInteger(doc.version) ? doc.version : 0,
      text: textParts.join("\n\n").slice(0, 120000),
    };
  }

  async _resolveBaselineScore(profile, contextData) {
    if (Number.isFinite(Number(profile?.baselineScore))) {
      return Number(profile.baselineScore);
    }

    // fallback baseline from stored profile metadata; final fallback 80.
    const metaBaseline = Number(profile?.meta?.baselineScore);
    if (Number.isFinite(metaBaseline)) {
      return metaBaseline;
    }

    if (contextData.customersProcessed.length >= 50) {
      return 82;
    }
    return 80;
  }

  async _generateInstructionPatch({
    runId,
    profile,
    instructionContext,
    contextData,
  }) {
    const counters = contextData.signalCounters && typeof contextData.signalCounters === "object"
      ? { ...contextData.signalCounters }
      : {
        asksPrice: 0,
        asksShipping: 0,
        asksPayment: 0,
        missingOrderFields: 0,
        hasGhostSignal: 0,
      };
    const latestCompactionSummary =
      Array.isArray(contextData.compactedSummaries) && contextData.compactedSummaries.length > 0
        ? contextData.compactedSummaries[contextData.compactedSummaries.length - 1]
        : null;

    const summaryPrompt = {
      role: "system",
      content: [
        "คุณคือ Agent Forge Optimizer",
        "งาน: สรุปการปรับ instruction เพื่อเพิ่ม conversion, ลดความสับสน และลดการโต้ตอบที่ไม่จำเป็น",
        "ห้ามเดาข้อมูลสินค้า/ราคา",
        "ตอบเป็นข้อสั้น ๆ พร้อมข้อความ instruction ที่แก้แล้ว",
      ].join("\n"),
    };

    const userPrompt = {
      role: "user",
      content: [
        `Agent: ${profile.name}`,
        `Mode: ${profile.mode}`,
        `Customer model default: ${profile.customerDefaultModel}`,
        `Counters: ${JSON.stringify(counters)}`,
        `Customers processed: ${contextData.customersProcessed.length}`,
        `Compaction summary: ${latestCompactionSummary ? JSON.stringify(latestCompactionSummary) : "none"}`,
        `Current instruction excerpt:\n${(instructionContext?.text || "").slice(0, 5000)}`,
        "ต้องคง KB เดิมให้ครบถ้วน และเพิ่มโครงสร้างตอบสั้นแบบปิดการขาย",
        "เพิ่มตัวอย่าง instruction แบบง่ายด้วย",
      ].join("\n\n"),
    };

    let generatedText = "";
    let modelUsed = null;

    const openaiContext = await this._getOpenAIContext();
    const openaiClient = openaiContext.client;
    if (openaiClient) {
      const resolvedModel = this._resolveModelForProviderOrThrow(
        profile.runnerModel || "gpt-5.2",
        openaiContext.provider,
        "Agent Forge patch generation",
      );

      const requestPayload = {
        model: resolvedModel,
        reasoning: {
          effort: profile.runnerThinking || "xhigh",
        },
        input: [summaryPrompt, userPrompt],
      };

      await this.agentForgeService.storeOpenAISnapshot(
        runId,
        "patch_generation",
        "request",
        requestPayload,
      );

      try {
        const response = await openaiClient.responses.create(requestPayload);
        generatedText = extractResponseText(response);
        modelUsed = requestPayload.model;

        await this.agentForgeService.storeOpenAISnapshot(
          runId,
          "patch_generation",
          "response",
          response,
          response?.usage || null,
        );
      } catch (error) {
        if (this._isProviderModelApiError(error)) {
          throw this._buildProviderModelError(
            "Agent Forge patch generation",
            requestPayload.model,
            openaiContext.provider,
            error?.message || "",
          );
        }
        await this.agentForgeService.appendRunEvent(runId, "openai_patch_generation_failed", {
          message: error?.message || "openai_error",
        }, {
          phase: "openai",
          createdBy: "agent_forge_runner",
        });
      }
    }

    if (!generatedText) {
      generatedText = [
        "[Agent Forge Auto Patch]",
        `- ลูกค้าที่ถามราคา: ${counters.asksPrice}`,
        `- ลูกค้าที่ถามค่าส่ง/ปลายทาง: ${counters.asksShipping}`,
        `- ลูกค้าที่ถามโอน/QR: ${counters.asksPayment}`,
        `- เคสจำนวนแต่ไม่ระบุขนาด: ${counters.missingOrderFields}`,
        `- สัญญาณลูกค้าหาย: ${counters.hasGhostSignal}`,
        "",
        "แนวทางปรับปรุง:",
        "1) ตอบราคาเป็น 2 ตัวเลือกหลัก + choice close",
        "2) ถ้าข้อมูลไม่ครบให้ถามเฉพาะ field ที่ขาด (ขนาด/จำนวน/ชื่อ/ที่อยู่/เบอร์)",
        "3) ถ้าข้อมูลครบให้สรุปยอดและขอข้อมูลจัดส่งในข้อความเดียว",
        "4) โหมดชำระเงินให้ default เป็นปลายทาง และห้ามเดาข้อมูลโอน",
        "",
        "ตัวอย่าง instruction แบบง่าย:",
        SIMPLE_INSTRUCTION_TEMPLATE,
      ].join("\n");
    }

    await this.agentForgeService.appendRunEvent(runId, "instruction_patch_generated", {
      modelUsed,
      patchPreview: generatedText.slice(0, 3000),
    }, {
      phase: "patch",
      createdBy: "agent_forge_runner",
    });

    return {
      patchText: generatedText,
      modelUsed,
    };
  }

  async _refineInstructionPatch({
    runId,
    iteration,
    previousPatch,
    selfTestResult,
    contextData,
    profile,
    instructionContext,
  }) {
    const failures = (selfTestResult.caseResults || [])
      .filter((item) => !item.passed)
      .map((item) => ({ caseId: item.caseId, violations: item.violations || [] }));

    const refinementHint = [
      `Iteration ${iteration} failed cases: ${JSON.stringify(failures)}`,
      `Customers processed: ${contextData.customersProcessed.length}`,
      "Refine the instruction patch to address failed cases while keeping factual accuracy 100%.",
    ].join("\n");

    const fallback = [
      previousPatch,
      "",
      "[Refinement]",
      `- รอบ ${iteration}: เพิ่มเงื่อนไขย้ำความครบถ้วนของข้อมูลก่อนปิดออเดอร์`,
      `- รอบ ${iteration}: เพิ่ม guardrail ป้องกันการเดาข้อมูลการโอน`,
      `- รอบ ${iteration}: บังคับตอบแบบ choice close ทุกครั้งเมื่อถามราคา`,
    ].join("\n");

    const openaiContext = await this._getOpenAIContext();
    const openaiClient = openaiContext.client;
    if (!openaiClient) {
      return {
        patchText: fallback,
      };
    }

    const resolvedModel = this._resolveModelForProviderOrThrow(
      profile.runnerModel || "gpt-5.2",
      openaiContext.provider,
      "Agent Forge patch refinement",
    );

    const requestPayload = {
      model: resolvedModel,
      reasoning: {
        effort: profile.runnerThinking || "xhigh",
      },
      input: [
        {
          role: "system",
          content: "Refine this instruction patch using failed self-test feedback. Keep KB complete and safe.",
        },
        {
          role: "user",
          content: [
            `Current patch:\n${previousPatch.slice(0, 12000)}`,
            `Feedback:\n${refinementHint}`,
            `Instruction excerpt:\n${(instructionContext?.text || "").slice(0, 5000)}`,
          ].join("\n\n"),
        },
      ],
    };

    await this.agentForgeService.storeOpenAISnapshot(
      runId,
      `patch_refine_${iteration}`,
      "request",
      requestPayload,
    );

    try {
      const response = await openaiClient.responses.create(requestPayload);
      const text = extractResponseText(response) || fallback;

      await this.agentForgeService.storeOpenAISnapshot(
        runId,
        `patch_refine_${iteration}`,
        "response",
        response,
        response?.usage || null,
      );

      await this.agentForgeService.appendRunEvent(runId, "instruction_patch_refined", {
        iteration,
        patchPreview: text.slice(0, 2500),
      }, {
        phase: "patch",
        createdBy: "agent_forge_runner",
      });

      return {
        patchText: text,
      };
    } catch (error) {
      if (this._isProviderModelApiError(error)) {
        throw this._buildProviderModelError(
          "Agent Forge patch refinement",
          requestPayload.model,
          openaiContext.provider,
          error?.message || "",
        );
      }
      await this.agentForgeService.appendRunEvent(runId, "openai_patch_refine_failed", {
        iteration,
        message: error?.message || "openai_error",
      }, {
        phase: "openai",
        createdBy: "agent_forge_runner",
      });

      return {
        patchText: fallback,
      };
    }
  }

  async _executeSelfTests({
    runId,
    agentId,
    profile,
    patchText,
    iteration,
    baselineScore,
    userContext,
  }) {
    const evalCases = await this.agentForgeService.listEvalCases(agentId);
    const selectedCases = this._selectSelfTestCases(evalCases, MIN_CASES_PER_ITERATION);

    const caseResults = [];

    for (let i = 0; i < selectedCases.length; i += 1) {
      const caseData = selectedCases[i];
      const caseId = normalizeCaseId(caseData, i);
      const transcript = await this._simulateConversationCase({
        runId,
        profile,
        patchText,
        caseData,
        caseId,
      });

      const violations = this._detectCaseViolations(caseData, transcript);
      const scoreEval = evaluateCase({
        transcript,
        kbViolations: violations.filter((v) => v === "factual_missing"),
        flags: {
          hallucination: violations.includes("hallucination"),
          toneMismatch: violations.includes("tone_mismatch"),
        },
      });

      const caseResult = {
        caseId,
        category: caseData.category || "general",
        scores: scoreEval.scores,
        weightedScore: scoreEval.weightedScore,
        passed: scoreEval.passed,
        violations,
        transcript,
      };

      await this.agentForgeService.saveEvalResult(runId, iteration, caseResult);
      caseResults.push(caseResult);

      await this.agentForgeService.appendRunEvent(runId, "self_test_case_completed", {
        iteration,
        caseId,
        passed: caseResult.passed,
        weightedScore: caseResult.weightedScore,
        violations,
      }, {
        phase: "self_test",
        createdBy: "agent_forge_runner",
      });
    }

    const summary = summarizeIteration(caseResults);

    // Additional plan constraints.
    if (summary.totalCount < MIN_CASES_PER_ITERATION) {
      if (!summary.criticalViolations.includes("insufficient_cases")) {
        summary.criticalViolations.push("insufficient_cases");
      }
      summary.passed = false;
    }

    if (summary.avgScore < baselineScore) {
      summary.passed = false;
      if (!summary.criticalViolations.includes("below_baseline")) {
        summary.criticalViolations.push("below_baseline");
      }
    }

    await this.agentForgeService.appendRunEvent(runId, "self_test_iteration_summary", {
      iteration,
      baselineScore,
      summary,
    }, {
      phase: "self_test",
      createdBy: "agent_forge_runner",
    });

    return {
      iteration,
      baselineScore,
      summary,
      caseResults,
      actor: "frontend_simulator",
      reviewer: userContext?.username || "agent_forge",
    };
  }

  _selectSelfTestCases(cases = [], minCases = MIN_CASES_PER_ITERATION) {
    const rows = Array.isArray(cases) ? [...cases] : [];

    if (rows.length >= minCases) {
      return rows.slice(0, Math.max(minCases, 5));
    }

    const fallbackCases = [
      { caseId: "fallback_price", category: "sales", script: "ลูกค้าถามราคา" },
      { caseId: "fallback_size", category: "order", script: "ลูกค้าระบุจำนวนแต่ไม่ระบุขนาด" },
      { caseId: "fallback_payment", category: "payment", script: "ลูกค้าขอโอนเงิน" },
      { caseId: "fallback_shipping", category: "shipping", script: "ลูกค้าถามค่าส่ง" },
      { caseId: "fallback_followup", category: "followup", script: "ลูกค้าหายไป 1 วัน" },
    ];

    const byId = new Map();
    for (const row of rows) {
      byId.set(row.caseId, row);
    }

    for (const fallbackCase of fallbackCases) {
      if (byId.size >= minCases) break;
      if (!byId.has(fallbackCase.caseId)) {
        byId.set(fallbackCase.caseId, fallbackCase);
      }
    }

    return Array.from(byId.values()).slice(0, Math.max(minCases, 5));
  }

  async _simulateConversationCase({
    runId,
    profile,
    patchText,
    caseData,
    caseId,
  }) {
    const scenario = caseData.script || "ลูกค้าต้องการรายละเอียดสินค้า";
    const systemText = [
      "คุณคือตัวจำลอง AI ตอบลูกค้า",
      "ให้ตอบข้อความเดียวที่สั้น กระชับ ปิดการขาย",
      "ยึดตาม instruction ด้านล่าง",
      `Instruction:\n${patchText.slice(0, 10000)}`,
    ].join("\n\n");

    const userText = `เคสทดสอบ: ${scenario}`;

    let assistantText = "";

    const openaiContext = await this._getOpenAIContext();
    const openaiClient = openaiContext.client;
    if (openaiClient) {
      const resolvedModel = this._resolveModelForProviderOrThrow(
        profile.customerDefaultModel || "gpt-4.1",
        openaiContext.provider,
        "Agent Forge self-test",
      );

      const requestPayload = {
        model: resolvedModel,
        input: [
          { role: "system", content: systemText },
          { role: "user", content: userText },
        ],
      };

      await this.agentForgeService.storeOpenAISnapshot(
        runId,
        `self_test_${caseId}`,
        "request",
        requestPayload,
      );

      try {
        const response = await openaiClient.responses.create(requestPayload);
        assistantText = extractResponseText(response);

        await this.agentForgeService.storeOpenAISnapshot(
          runId,
          `self_test_${caseId}`,
          "response",
          response,
          response?.usage || null,
        );
      } catch (error) {
        if (this._isProviderModelApiError(error)) {
          throw this._buildProviderModelError(
            "Agent Forge self-test",
            requestPayload.model,
            openaiContext.provider,
            error?.message || "",
          );
        }
        await this.agentForgeService.appendRunEvent(runId, "openai_self_test_failed", {
          caseId,
          message: error?.message || "openai_error",
        }, {
          phase: "openai",
          createdBy: "agent_forge_runner",
        });
      }
    }

    if (!assistantText) {
      assistantText = this._buildFallbackSimulatedReply(caseData, scenario);
    }

    return [
      {
        role: "user",
        content: userText,
      },
      {
        role: "assistant",
        content: assistantText,
      },
    ];
  }

  _buildFallbackSimulatedReply(caseData, scenario) {
    const caseId = String(caseData.caseId || "").toLowerCase();

    if (caseId.includes("price") || /ราคา/.test(scenario)) {
      return "มี 2 ขนาดค่ะ 22g และ 14g โปรส่งฟรี 3/5 ขวด สนใจแบบไหนคะ พิมพ์ 1 หรือ 2 ได้เลยค่ะ";
    }

    if (caseId.includes("payment") || /โอน|qr/.test(scenario)) {
      return "ได้ค่ะ แนะนำเก็บเงินปลายทางก่อนนะคะ หากต้องการโอนจะส่ง QR ที่ยืนยันแล้วให้ค่ะ";
    }

    if (caseId.includes("size") || /ขนาด/.test(scenario)) {
      return "รับทราบค่ะ รบกวนยืนยันขนาดก่อนนะคะ 14g หรือ 22g เพื่อสรุปยอดให้ถูกต้องค่ะ";
    }

    return "ได้ค่ะ เดี๋ยวสรุปตัวเลือกที่เหมาะสมให้ทันทีนะคะ";
  }

  _detectCaseViolations(caseData, transcript) {
    const violations = [];
    const assistantText = transcript
      .filter((item) => item && item.role === "assistant")
      .map((item) => String(item.content || ""))
      .join("\n")
      .toLowerCase();

    const caseId = String(caseData.caseId || "").toLowerCase();

    if (!assistantText.trim()) {
      violations.push("factual_missing");
      return violations;
    }

    if (/\b\d{10,}\b/.test(assistantText)) {
      violations.push("hallucination");
    }

    if (caseId.includes("payment") || /โอน|qr/.test(caseData.script || "")) {
      if (!/ปลายทาง|qr|ชำระ|โอน/.test(assistantText)) {
        violations.push("factual_missing");
      }
    }

    if (caseId.includes("size") || /ขนาด/.test(caseData.script || "")) {
      if (!/14|22|ขนาด/.test(assistantText)) {
        violations.push("factual_missing");
      }
    }

    if (assistantText.length > 800) {
      violations.push("tone_mismatch");
    }

    return violations;
  }

  _decideIteration({
    iteration,
    maxIterations,
    selfTestResult,
    baselineScore,
  }) {
    const summary = selfTestResult.summary;
    const hasCritical = Array.isArray(summary.criticalViolations) && summary.criticalViolations.length > 0;

    if (
      summary.passed &&
      !hasCritical &&
      summary.avgScore >= baselineScore
    ) {
      return {
        decision: "stop_pass",
        nextAction: "publish",
        reasoningSummary: `Self-test ผ่านรอบ ${iteration} ด้วยคะแนน ${summary.avgScore} (baseline ${baselineScore})`,
      };
    }

    if (iteration >= maxIterations) {
      return {
        decision: "stop_fail",
        nextAction: "human_review",
        reasoningSummary: `ถึงรอบสูงสุด ${maxIterations} แล้ว แต่คะแนนยังไม่ผ่านเกณฑ์`,
      };
    }

    return {
      decision: "continue",
      nextAction: "refine_instruction",
      reasoningSummary: `ยังไม่ผ่านเกณฑ์ (avg ${summary.avgScore}, baseline ${baselineScore}) ปรับปรุงรอบถัดไป`,
    };
  }

  async _assertRunNotStopped(runId) {
    const stopRequested = await this.agentForgeService.isStopRequested(runId);
    if (stopRequested) {
      throw new StopRunError();
    }
  }
}

module.exports = {
  AgentForgeRunner,
  StopRunError,
};
