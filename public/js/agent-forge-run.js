(function () {
  const MAX_TIMELINE_EVENTS = 400;
  const INITIAL_EVENT_LIMIT = 120;

  const bootstrap = window.__AGENT_FORGE_RUN_BOOTSTRAP__ || {};
  const run = bootstrap.run || {};

  const state = {
    runId: run._id,
    afterSeq: 0,
    events: [],
    eventSource: null,
    snapshots: [],
    refreshingRunInfo: false,
  };

  const dom = {
    runStatusLabel: document.getElementById("runStatusLabel"),
    runIterationsLabel: document.getElementById("runIterationsLabel"),
    runSelfTestCountLabel: document.getElementById("runSelfTestCountLabel"),
    timelineEvents: document.getElementById("timelineEvents"),
    agentSawPanel: document.getElementById("agentSawPanel"),
    agentThoughtPanel: document.getElementById("agentThoughtPanel"),
    agentToolsPanel: document.getElementById("agentToolsPanel"),
    compactionPanel: document.getElementById("compactionPanel"),
    instructionDiffPanel: document.getElementById("instructionDiffPanel"),
    selfTestSummary: document.getElementById("selfTestSummary"),
    selfTestCases: document.getElementById("selfTestCases"),
    snapshotList: document.getElementById("snapshotList"),
    snapshotViewer: document.getElementById("snapshotViewer"),
    stopRunBtn: document.getElementById("stopRunBtn"),
    replaySelfTestsBtn: document.getElementById("replaySelfTestsBtn"),
    refreshSnapshotsBtn: document.getElementById("refreshSnapshotsBtn"),
    runTabs: document.getElementById("runTabs"),
  };

  function showToast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message, "info");
      return;
    }
    alert(message);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH");
  }

  function appendPanelText(element, text, maxChars = 25000) {
    if (!element) return;
    const next = `${element.textContent || ""}${text}`;
    if (next.length <= maxChars) {
      element.textContent = next;
      return;
    }
    element.textContent = next.slice(next.length - maxChars);
  }

  function toPayloadPreview(payload, maxLength = 6000) {
    let text = "";
    try {
      text = JSON.stringify(payload || {}, null, 2);
    } catch (error) {
      text = JSON.stringify({ message: "payload_not_serializable" }, null, 2);
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength)}\n... [truncated ${text.length - maxLength} chars]`;
  }

  function renderTimeline() {
    if (!dom.timelineEvents) return;

    if (!state.events.length) {
      dom.timelineEvents.innerHTML = "<div class='text-muted'>รอ event...</div>";
      return;
    }

    dom.timelineEvents.innerHTML = state.events.map((event) => {
      const payloadText =
        typeof event._payloadPreview === "string"
          ? event._payloadPreview
          : toPayloadPreview(event.payloadMasked || event.payload || {});
      const payload = escapeHtml(payloadText);
      return `
        <div class="timeline-item">
          <div class="event-title">#${event.seq} ${event.eventType}</div>
          <div class="meta">${formatDateTime(event.ts)} · phase=${event.phase || "runtime"}</div>
          <pre class="mb-0 mt-2">${payload}</pre>
        </div>
      `;
    }).join("");

    dom.timelineEvents.scrollTop = dom.timelineEvents.scrollHeight;
  }

  function appendEvent(event, options = {}) {
    state.events.push(event);
    if (state.events.length > MAX_TIMELINE_EVENTS) {
      state.events = state.events.slice(state.events.length - MAX_TIMELINE_EVENTS);
    }
    state.afterSeq = Math.max(state.afterSeq, Number(event.seq) || 0);

    const eventText = toPayloadPreview(event.payloadMasked || event.payload || {});
    event._payloadPreview = eventText;

    if (event.phase === "history") {
      appendPanelText(dom.agentSawPanel, `\n[${event.eventType}]\n${eventText}\n`);
    }

    if (event.phase === "decision" || event.eventType === "agent_decision") {
      appendPanelText(dom.agentThoughtPanel, `\n[${event.eventType}]\n${eventText}\n`);
    }

    if (event.phase === "self_test") {
      dom.selfTestSummary.textContent = `ล่าสุด: ${event.eventType}`;
    }

    if (event.phase === "compaction" || event.eventType === "context_compaction") {
      appendPanelText(dom.compactionPanel, `\n${eventText}\n`);
    }

    if (event.phase === "patch") {
      dom.instructionDiffPanel.textContent = eventText;
    }

    if (event.eventType && event.eventType.includes("tool")) {
      appendPanelText(dom.agentToolsPanel, `\n[${event.eventType}]\n${eventText}\n`);
    }

    if (options.render !== false) {
      renderTimeline();
    }
  }

  async function loadEventsOnce() {
    const response = await fetch(
      `/api/agent-forge/runs/${state.runId}/events?afterSeq=${state.afterSeq}&limit=${INITIAL_EVENT_LIMIT}`,
    );
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "load_events_failed");
    }

    const rows = Array.isArray(payload.events) ? payload.events : [];
    if (!rows.length) {
      renderTimeline();
      return;
    }

    rows.forEach((event) => appendEvent(event, { render: false }));
    renderTimeline();
  }

  function connectStream() {
    if (!state.runId) return;

    const source = new EventSource(`/api/agent-forge/runs/${state.runId}/stream?afterSeq=${state.afterSeq}`);
    state.eventSource = source;

    source.addEventListener("event", (event) => {
      try {
        const data = JSON.parse(event.data);
        appendEvent(data);
      } catch (error) {
        console.error("[AgentForgeRun] parse event error", error);
      }
    });

    source.addEventListener("error", () => {
      source.close();
      state.eventSource = null;
      setTimeout(() => {
        connectStream();
      }, 2000);
    });
  }

  async function refreshRunInfo() {
    if (state.refreshingRunInfo) return;
    state.refreshingRunInfo = true;

    try {
      const response = await fetch(`/api/agent-forge/runs/${state.runId}?includeEvalResults=0`);
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "load_run_failed");
      }

      const currentRun = payload.run;
      dom.runStatusLabel.textContent = currentRun.status || "-";
      dom.runIterationsLabel.textContent = currentRun.iterations || 0;
      dom.runSelfTestCountLabel.textContent = currentRun.selfTestCount || 0;

      if (currentRun?.meta?.candidatePatchText) {
        dom.instructionDiffPanel.textContent = currentRun.meta.candidatePatchText;
      }

      if (Array.isArray(payload.decisionJournal)) {
        dom.agentThoughtPanel.textContent = payload.decisionJournal
          .map((item) => `[${item.iteration}] ${item.decision}: ${item.reasoningSummary || ""}`)
          .join("\n");
      }
    } finally {
      state.refreshingRunInfo = false;
    }
  }

  async function loadSelfTests() {
    const response = await fetch(
      `/api/agent-forge/runs/${state.runId}/self-tests?allIterations=0&includeTranscript=0`,
    );
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "load_self_tests_failed");
    }

    const iterations = Array.isArray(payload.iterations) ? payload.iterations : [];
    if (!iterations.length) {
      dom.selfTestSummary.textContent = "ยังไม่มีผล self-test";
      dom.selfTestCases.innerHTML = "";
      return;
    }

    const latest = iterations[iterations.length - 1];
    dom.selfTestSummary.textContent = `Iteration ${latest.iteration} · ${latest.cases.length} cases`;

    dom.selfTestCases.innerHTML = latest.cases.map((testCase) => {
      return `
        <div class="self-test-case">
          <div class="d-flex justify-content-between">
            <div><strong>${testCase.caseId}</strong></div>
            <div class="self-test-score ${testCase.passed ? "text-success" : "text-danger"}">${testCase.weightedScore}</div>
          </div>
          <div class="small text-muted">violations: ${(testCase.violations || []).join(", ") || "none"}</div>
        </div>
      `;
    }).join("");
  }

  async function loadSnapshots() {
    const response = await fetch(`/api/agent-forge/runs/${state.runId}/openai-snapshots`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "load_snapshots_failed");
    }

    state.snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];

    if (!state.snapshots.length) {
      dom.snapshotList.innerHTML = "<div class='text-muted small'>ยังไม่มี snapshot</div>";
      dom.snapshotViewer.textContent = "";
      return;
    }

    dom.snapshotList.innerHTML = state.snapshots.map((snapshot) => {
      return `<button class="snapshot-chip" data-snapshot-id="${snapshot._id}">${snapshot.direction} · ${snapshot.turnId}</button>`;
    }).join("");
  }

  async function showSnapshot(snapshotId, unmask) {
    if (!snapshotId) return;

    if (unmask) {
      const response = await fetch(`/api/agent-forge/runs/${state.runId}/openai-snapshots/${snapshotId}/unmask`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "unmask_failed");
      }
      dom.snapshotViewer.textContent = JSON.stringify(payload.snapshot.payload || payload.snapshot, null, 2);
      return;
    }

    const response = await fetch(`/api/agent-forge/runs/${state.runId}/openai-snapshots/${snapshotId}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "snapshot_failed");
    }

    dom.snapshotViewer.textContent = JSON.stringify(payload.snapshot.payloadMasked || payload.snapshot, null, 2);
  }

  async function stopRun() {
    const response = await fetch(`/api/agent-forge/runs/${state.runId}/stop`, {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "stop_failed");
    }
    showToast("ส่งคำสั่ง stop แล้ว");
  }

  async function replaySelfTests() {
    const response = await fetch(`/api/agent-forge/runs/${state.runId}/self-tests/replay`, {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "replay_failed");
    }
    showToast("เริ่ม replay self-tests แล้ว");
    await loadSelfTests();
  }

  function setupTabs() {
    dom.runTabs?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-target]");
      if (!button) return;

      dom.runTabs.querySelectorAll("button.nav-link").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      const target = button.dataset.target;
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.remove("active");
      });

      const panel = document.querySelector(target);
      if (panel) panel.classList.add("active");
    });
  }

  function bindEvents() {
    dom.stopRunBtn?.addEventListener("click", () => {
      stopRun().catch((error) => {
        console.error(error);
        showToast(`stop ไม่สำเร็จ: ${error.message || "unknown_error"}`);
      });
    });

    dom.replaySelfTestsBtn?.addEventListener("click", () => {
      replaySelfTests().catch((error) => {
        console.error(error);
        showToast(`replay ไม่สำเร็จ: ${error.message || "unknown_error"}`);
      });
    });

    dom.refreshSnapshotsBtn?.addEventListener("click", () => {
      loadSnapshots().catch((error) => {
        console.error(error);
        showToast(`โหลด snapshot ไม่สำเร็จ: ${error.message || "unknown_error"}`);
      });
    });

    dom.snapshotList?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-snapshot-id]");
      if (!button) return;
      const snapshotId = button.dataset.snapshotId;
      const wantUnmask = event.shiftKey;

      showSnapshot(snapshotId, wantUnmask).catch((error) => {
        console.error(error);
        showToast(`เปิด snapshot ไม่สำเร็จ: ${error.message || "unknown_error"}`);
      });
    });
  }

  async function init() {
    setupTabs();
    bindEvents();

    dom.agentSawPanel.textContent = "";
    dom.agentThoughtPanel.textContent = "";
    dom.agentToolsPanel.textContent = "";
    dom.compactionPanel.textContent = "";

    await refreshRunInfo();
    await loadEventsOnce();

    connectStream();

    loadSelfTests().catch((error) => {
      console.error("[AgentForgeRun] load self-tests error", error);
    });
    loadSnapshots().catch((error) => {
      console.error("[AgentForgeRun] load snapshots error", error);
    });

    setInterval(() => {
      refreshRunInfo().catch((error) => {
        console.error("[AgentForgeRun] refresh run error", error);
      });
    }, 8000);
  }

  init().catch((error) => {
    console.error(error);
    showToast(`โหลด run ไม่สำเร็จ: ${error.message || "unknown_error"}`);
  });
})();
