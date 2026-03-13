const express = require("express");
const { AgentForgeTools } = require("../services/agentForgeTools");

function parsePositiveNumber(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }
  return num;
}

function buildUserContext(req, getAdminUserContext) {
  const admin = typeof getAdminUserContext === "function"
    ? getAdminUserContext(req)
    : null;

  return {
    username: admin?.label || admin?.codeId || admin?.role || "admin",
    role: admin?.role || "admin",
  };
}

function sanitizeMode(mode) {
  return mode === "ai-live-reply" ? "ai-live-reply" : "human-only";
}

function attachSseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function createAgentForgeRouter(options = {}) {
  const {
    connectDB,
    requireAdmin,
    getAdminUserContext,
    agentForgeService,
    agentForgeRunner,
    agentForgeScheduler,
  } = options;

  if (!connectDB) throw new Error("connectDB_required");
  if (!requireAdmin) throw new Error("requireAdmin_required");
  if (!agentForgeService) throw new Error("agentForgeService_required");
  if (!agentForgeRunner) throw new Error("agentForgeRunner_required");

  const router = express.Router();
  router.use(requireAdmin);

  async function loadTools() {
    const db = (await connectDB()).db("chatbot");
    return new AgentForgeTools(db);
  }

  function handleError(res, error) {
    const message = error?.message || "unexpected_error";
    if (
      [
        "invalid_agent_id",
        "invalid_run_id",
        "invalid_snapshot_id",
        "invalid_message_id",
        "invalid_asset_id",
        "invalid_instruction_id",
        "reason_required",
        "reason_too_long",
        "collection_not_found",
        "asset_not_found",
        "run_not_found",
        "agent_not_found",
        "checkpoint_not_found",
        "create_new_requires_human_only",
        "page_keys_required_for_create_new",
        "instruction_required_for_improve",
        "instruction_not_found",
        "instruction_not_linked_to_pages",
      ].includes(message)
    ) {
      return res.status(400).json({ success: false, error: message });
    }

    console.error("[AgentForge API]", error);
    return res.status(500).json({ success: false, error: message });
  }

  // Agent management
  router.post("/agents", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const agent = await agentForgeService.createAgent(req.body || {}, userContext);
      return res.status(201).json({ success: true, agent });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/agents", async (req, res) => {
    try {
      const includeHealth = req.query.includeHealth === "1" || req.query.includeHealth === "true";
      const agents = await agentForgeService.listAgents();

      if (!includeHealth) {
        return res.json({ success: true, agents });
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const enriched = [];
      for (const agent of agents) {
        const [latestRuns, afterMetrics, beforeMetrics] = await Promise.all([
          agentForgeService.listRuns(agent._id, 5),
          agentForgeService.getSalesMetricsForAgent(agent._id, {
            dateFrom: weekAgo,
            dateTo: now,
          }),
          agentForgeService.getSalesMetricsForAgent(agent._id, {
            dateFrom: twoWeeksAgo,
            dateTo: weekAgo,
          }),
        ]);

        const beforeRate = Number(beforeMetrics?.conversionRate || 0);
        const afterRate = Number(afterMetrics?.conversionRate || 0);
        const liftPct = beforeRate > 0
          ? Number((((afterRate - beforeRate) / beforeRate) * 100).toFixed(2))
          : afterRate > 0
            ? 100
            : 0;

        enriched.push({
          ...agent,
          latestRuns,
          health: {
            mode: agent.mode,
            conversionRateBefore: beforeRate,
            conversionRateAfter: afterRate,
            conversionLiftPct: liftPct,
          },
        });
      }

      return res.json({ success: true, agents: enriched });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/bootstrap/options", async (req, res) => {
    try {
      const [instructions, managedPages, instructionUsageMap] = await Promise.all([
        agentForgeService.listInstructionOptions(),
        agentForgeService.listManagedPages(),
        agentForgeService.getInstructionUsageMap(),
      ]);

      return res.json({
        success: true,
        instructions,
        managedPages,
        instructionUsageMap,
        customerModelOptions: agentForgeService.getCustomerModelOptions(),
      });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/agents/:agentId", async (req, res) => {
    try {
      const agent = await agentForgeService.getAgentById(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ success: false, error: "agent_not_found" });
      }

      const [runs, cursors, managedPages] = await Promise.all([
        agentForgeService.listRuns(agent._id, 20),
        agentForgeService.getRunCursors(agent._id),
        agentForgeService.listManagedPages(),
      ]);

      const pages = managedPages.filter((page) => (agent.pageKeys || []).includes(page.pageKey));

      return res.json({
        success: true,
        agent,
        runs,
        cursors,
        pages,
      });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.patch("/agents/:agentId", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const agent = await agentForgeService.updateAgent(req.params.agentId, req.body || {}, userContext);
      return res.json({ success: true, agent });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.delete("/agents/:agentId", async (req, res) => {
    try {
      const result = await agentForgeService.deleteAgent(req.params.agentId);
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error?.message === "agent_not_found") {
        return res.status(404).json({ success: false, error: "agent_not_found" });
      }
      return handleError(res, error);
    }
  });

  router.post("/agents/:agentId/mode", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const mode = sanitizeMode(req.body?.mode);
      const agent = await agentForgeService.updateAgentMode(req.params.agentId, mode, userContext);
      return res.json({ success: true, agent });
    } catch (error) {
      return handleError(res, error);
    }
  });

  // Run control
  router.post("/agents/:agentId/run", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const run = await agentForgeRunner.startRun(
        req.params.agentId,
        {
          dryRun: !!req.body?.dryRun,
          runType: "manual",
          maxIterations: parsePositiveNumber(req.body?.maxIterations, undefined),
          batchSize: parsePositiveNumber(req.body?.batchSize, undefined),
          maxMessages: parsePositiveNumber(req.body?.maxMessages, undefined),
        },
        userContext,
      );
      return res.status(202).json({ success: true, run });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/runs/:runId/stop", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const run = await agentForgeService.requestStopRun(req.params.runId, userContext);
      return res.json({ success: true, run });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/agents/:agentId/runs", async (req, res) => {
    try {
      const limit = parsePositiveNumber(req.query.limit, 50);
      const runs = await agentForgeService.listRuns(req.params.agentId, limit);
      return res.json({ success: true, runs });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/runs/:runId", async (req, res) => {
    try {
      const run = await agentForgeService.getRunById(req.params.runId);
      if (!run) {
        return res.status(404).json({ success: false, error: "run_not_found" });
      }
      const includeEvalResults =
        req.query.includeEvalResults === "1" || req.query.includeEvalResults === "true";

      const [journal, evalResults] = await Promise.all([
        agentForgeService.listDecisionJournal(req.params.runId),
        includeEvalResults
          ? agentForgeService.listEvalResults(req.params.runId)
          : Promise.resolve([]),
      ]);

      return res.json({
        success: true,
        run,
        decisionJournal: journal,
        evalResults,
      });
    } catch (error) {
      return handleError(res, error);
    }
  });

  // Event stream / replay
  router.get("/runs/:runId/events", async (req, res) => {
    try {
      const afterSeq = parsePositiveNumber(req.query.afterSeq, 0);
      const limit = parsePositiveNumber(req.query.limit, 200);
      const events = await agentForgeService.listRunEvents(req.params.runId, afterSeq, limit);
      return res.json({ success: true, events });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/runs/:runId/stream", async (req, res) => {
    const runId = req.params.runId;
    let afterSeq = Number(req.query.afterSeq) || 0;

    attachSseHeaders(res);

    const heartbeatTimer = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    }, 15000);

    let pollTimer = null;
    let closed = false;

    const sendEvents = async () => {
      if (closed) return;
      try {
        const events = await agentForgeService.listRunEvents(runId, afterSeq, 200);
        for (const event of events) {
          afterSeq = event.seq;
          res.write(`event: event\ndata: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: error?.message || "stream_error" })}\n\n`,
        );
      }
    };

    await sendEvents();

    pollTimer = setInterval(() => {
      sendEvents().catch(() => {
        // no-op
      });
    }, 1500);

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeatTimer);
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    });
  });

  // OpenAI snapshots
  router.get("/runs/:runId/openai-snapshots", async (req, res) => {
    try {
      const includePayloadMasked =
        req.query.includePayloadMasked === "1" || req.query.includePayloadMasked === "true";
      const snapshots = await agentForgeService.listSnapshots(
        req.params.runId,
        parsePositiveNumber(req.query.limit, 200),
        { includePayloadMasked },
      );
      return res.json({ success: true, snapshots });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/runs/:runId/openai-snapshots/:snapshotId", async (req, res) => {
    try {
      const snapshot = await agentForgeService.getSnapshot(req.params.snapshotId);
      if (!snapshot || snapshot.runId !== String(req.params.runId)) {
        return res.status(404).json({ success: false, error: "snapshot_not_found" });
      }
      return res.json({ success: true, snapshot });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/runs/:runId/openai-snapshots/:snapshotId/unmask", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const snapshot = await agentForgeService.unmaskSnapshot(
        req.params.runId,
        req.params.snapshotId,
        userContext,
      );
      return res.json({ success: true, snapshot });
    } catch (error) {
      return handleError(res, error);
    }
  });

  // Self-test / simulator
  router.post("/internal/simulate-reply", async (req, res) => {
    try {
      const result = await agentForgeRunner.simulateReply({
        pageKey: req.body?.pageKey,
        instructionText: req.body?.instructionText,
        scenario: req.body?.scenario,
        model: req.body?.model,
      });
      return res.json({ success: true, ...result, noSideEffect: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/runs/:runId/self-tests", async (req, res) => {
    try {
      const allIterations =
        req.query.allIterations === "1" || req.query.allIterations === "true";
      const includeTranscript =
        req.query.includeTranscript === "1" || req.query.includeTranscript === "true";
      const evalResults = await agentForgeService.listEvalResults(req.params.runId, {
        includeTranscript,
        latestIterationOnly: !allIterations,
      });
      const grouped = new Map();
      for (const row of evalResults) {
        const key = row.iteration || 0;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key).push(row);
      }

      const iterations = Array.from(grouped.entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([iteration, rows]) => ({ iteration, cases: rows }));

      return res.json({ success: true, iterations });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/runs/:runId/self-tests/replay", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const result = await agentForgeRunner.runSelfTestsOnly(req.params.runId, userContext);
      return res.json({ success: true, result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/runs/:runId/replay-from-event/:seq", async (req, res) => {
    try {
      const userContext = buildUserContext(req, getAdminUserContext);
      const run = await agentForgeRunner.replayFromEvent(req.params.runId, req.params.seq, userContext);
      return res.status(202).json({ success: true, run });
    } catch (error) {
      return handleError(res, error);
    }
  });

  // History tools
  router.post("/history/customers/batch", async (req, res) => {
    try {
      const tools = await loadTools();
      const payload = req.body || {};
      const result = await tools.listCustomersBatch({
        pageKeys: payload.pageKeys || [],
        limit: Math.max(1, Math.min(40, Number(payload.limit) || 20)),
        cursor: payload.cursor || null,
        since: payload.since || null,
        until: payload.until || null,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/history/customer/conversation", async (req, res) => {
    try {
      const tools = await loadTools();
      const payload = req.body || {};
      const result = await tools.getCustomerConversation({
        senderId: payload.senderId,
        pageKey: payload.pageKey,
        platform: payload.platform,
        botId: payload.botId,
        maxMessages: Math.max(1, Math.min(200, Number(payload.maxMessages) || 20)),
        before: payload.before || null,
        after: payload.after || null,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/history/search/keyword", async (req, res) => {
    try {
      const tools = await loadTools();
      const payload = req.body || {};
      const result = await tools.searchConversationsKeyword({
        keyword: payload.keyword,
        pageKeys: payload.pageKeys || [],
        limit: parsePositiveNumber(payload.limit, 50),
        senderId: payload.senderId || null,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/history/search/rag", async (req, res) => {
    try {
      const tools = await loadTools();
      const payload = req.body || {};
      const result = await tools.searchConversationsRag({
        query: payload.query,
        pageKeys: payload.pageKeys || [],
        limit: parsePositiveNumber(payload.limit, 30),
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  // Image governance
  router.post("/images/collections", async (req, res) => {
    try {
      const tools = await loadTools();
      const userContext = buildUserContext(req, getAdminUserContext);
      const result = await tools.createImageCollection({
        ...req.body,
        createdBy: userContext.username,
      });
      return res.status(201).json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.patch("/images/collections/:collectionId", async (req, res) => {
    try {
      const tools = await loadTools();
      const result = await tools.updateImageCollection(req.params.collectionId, req.body || {});
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/images/collections/:collectionId/soft-delete", async (req, res) => {
    try {
      const tools = await loadTools();
      const userContext = buildUserContext(req, getAdminUserContext);
      const result = await tools.softDeleteImageCollection(req.params.collectionId, {
        ...req.body,
        deletedBy: userContext.username,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/images/import-admin-echo", async (req, res) => {
    try {
      const tools = await loadTools();
      const result = await tools.importAdminEchoImageToLibrary(req.body || {});
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/images/collections/link-pages", async (req, res) => {
    try {
      const tools = await loadTools();
      const payload = req.body || {};
      const result = await tools.linkCollectionToPages(
        payload.collectionId,
        payload.pageKeys || [],
        payload,
      );
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/images/assets/:assetId/soft-delete", async (req, res) => {
    try {
      const tools = await loadTools();
      const userContext = buildUserContext(req, getAdminUserContext);
      const result = await tools.softDeleteImageAsset(req.params.assetId, {
        ...req.body,
        deletedBy: userContext.username,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.post("/images/assets/:assetId/approve-delete", async (req, res) => {
    try {
      const tools = await loadTools();
      const userContext = buildUserContext(req, getAdminUserContext);
      const result = await tools.approveDeleteImageAsset(req.params.assetId, {
        ...req.body,
        approvedBy: userContext.username,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  // Scheduler helpers
  router.post("/agents/:agentId/process-now", async (req, res) => {
    try {
      if (!agentForgeScheduler) {
        return res.status(503).json({ success: false, error: "scheduler_unavailable" });
      }

      const userContext = buildUserContext(req, getAdminUserContext);
      const run = await agentForgeScheduler.processNow(
        req.params.agentId,
        {
          dryRun: !!req.body?.dryRun,
        },
        userContext,
      );
      return res.status(202).json({ success: true, run });
    } catch (error) {
      return handleError(res, error);
    }
  });

  router.get("/managed-pages", async (req, res) => {
    try {
      const pages = await agentForgeService.listManagedPages();
      return res.json({ success: true, pages });
    } catch (error) {
      return handleError(res, error);
    }
  });

  return router;
}

module.exports = createAgentForgeRouter;
