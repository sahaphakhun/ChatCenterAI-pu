(function () {
  const bootstrap = window.__AGENT_FORGE_BOOTSTRAP__ || {
    agents: [],
    managedPages: [],
    instructions: [],
    instructionUsageMap: {},
    customerModelOptions: ["gpt-4.1"],
  };

  const state = {
    agents: Array.isArray(bootstrap.agents) ? bootstrap.agents : [],
    managedPages: Array.isArray(bootstrap.managedPages) ? bootstrap.managedPages : [],
    instructions: Array.isArray(bootstrap.instructions) ? bootstrap.instructions : [],
    instructionUsageMap:
      bootstrap.instructionUsageMap && typeof bootstrap.instructionUsageMap === "object"
        ? bootstrap.instructionUsageMap
        : {},
    customerModelOptions: Array.isArray(bootstrap.customerModelOptions)
      ? bootstrap.customerModelOptions
      : ["gpt-4.1"],
  };

  const dom = {
    managedPageSelector: document.getElementById("managedPageSelector"),
    pageSelectionHint: document.getElementById("pageSelectionHint"),
    createAgentForm: document.getElementById("createAgentForm"),
    newAgentName: document.getElementById("newAgentName"),
    newAgentMode: document.getElementById("newAgentMode"),
    newOptimizationMode: document.getElementById("newOptimizationMode"),
    newInstructionId: document.getElementById("newInstructionId"),
    newCustomerModel: document.getElementById("newCustomerModel"),
    clearCreateFormBtn: document.getElementById("clearCreateFormBtn"),
    agentsTableBody: document.getElementById("agentsTableBody"),
    healthCards: document.getElementById("healthCards"),
    refreshAgentsBtn: document.getElementById("refreshAgentsBtn"),
    agentCountLabel: document.getElementById("agentCountLabel"),
  };

  function showToast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message, "info");
      return;
    }
    alert(message);
  }

  function humanizeError(errorMessage) {
    const mapping = {
      create_new_requires_human_only: "โหมดสร้างใหม่ต้องใช้ human-only เท่านั้น",
      page_keys_required_for_create_new: "โหมดสร้างใหม่ต้องเลือกเพจอย่างน้อย 1 เพจ",
      instruction_required_for_improve: "โหมดปรับปรุงต้องเลือก Instruction",
      instruction_not_found: "ไม่พบ Instruction ที่เลือก",
      instruction_not_linked_to_pages: "Instruction นี้ยังไม่ถูกผูกกับเพจใดในระบบ",
      load_agents_failed: "โหลดรายการ Agent ไม่สำเร็จ",
      load_bootstrap_failed: "โหลดข้อมูลตั้งต้นไม่สำเร็จ",
      create_agent_failed: "สร้าง Agent ไม่สำเร็จ",
      update_agent_failed: "อัปเดต Agent ไม่สำเร็จ",
      delete_agent_failed: "ลบ Agent ไม่สำเร็จ",
      toggle_mode_failed: "เปลี่ยนโหมดไม่สำเร็จ",
      run_failed: "เริ่มรันไม่สำเร็จ",
    };
    return mapping[errorMessage] || errorMessage || "unknown_error";
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseInstructionLabel(instruction) {
    if (!instruction) return "";
    const pieces = [];
    pieces.push(instruction.name || "Untitled");
    if (instruction.instructionId) pieces.push(`(${instruction.instructionId})`);
    return pieces.join(" ");
  }

  function getInstructionByMongoId(mongoId) {
    return state.instructions.find((item) => item._id === mongoId) || null;
  }

  function resolveManagedPageLabel(pageKey) {
    if (!pageKey) return "-";
    const matched = state.managedPages.find((page) => page.pageKey === pageKey);
    if (!matched) return pageKey;
    return matched.name || matched.pageKey || pageKey;
  }

  function resolveInstructionMongoId(ref) {
    if (!ref) return null;
    const value = String(ref);
    const byMongo = state.instructions.find((item) => item._id === value);
    if (byMongo) return byMongo._id;
    const byCode = state.instructions.find((item) => item.instructionId === value);
    return byCode ? byCode._id : null;
  }

  function getSelectedPageKeys() {
    const checked = dom.managedPageSelector?.querySelectorAll("input[type='checkbox']:checked") || [];
    return Array.from(checked).map((input) => input.value);
  }

  function setSelectedPageKeys(pageKeys) {
    const selectedSet = new Set(Array.isArray(pageKeys) ? pageKeys : []);
    dom.managedPageSelector
      ?.querySelectorAll("input[type='checkbox']")
      .forEach((input) => {
        input.checked = selectedSet.has(input.value);
      });
  }

  function renderInstructionSelectOptions(selectElement, options = {}) {
    if (!selectElement) return;
    const includeEmpty = options.includeEmpty !== false;
    const emptyLabel = options.emptyLabel || "เลือก Instruction";

    const rows = [];
    if (includeEmpty) {
      rows.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    }

    for (const instruction of state.instructions) {
      const label = parseInstructionLabel(instruction);
      rows.push(`<option value="${instruction._id}">${escapeHtml(label)}</option>`);
    }

    selectElement.innerHTML = rows.join("");
  }

  function renderCustomerModelOptions(selectElement) {
    if (!selectElement) return;
    const options = state.customerModelOptions.length
      ? state.customerModelOptions
      : ["gpt-4.1"];

    selectElement.innerHTML = options
      .map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`)
      .join("");
  }

  function renderManagedPages() {
    if (!dom.managedPageSelector) return;

    if (!state.managedPages.length) {
      dom.managedPageSelector.innerHTML = "<div class='text-muted small'>ยังไม่พบเพจที่เชื่อมต่อ</div>";
      return;
    }

    dom.managedPageSelector.innerHTML = state.managedPages.map((page) => {
      const status = page.status || "unknown";
      const label = page.name || page.pageKey;
      return `
        <label class="managed-page-item">
          <input type="checkbox" value="${page.pageKey}">
          <span>${escapeHtml(label)}</span>
          <span class="text-muted small">(${escapeHtml(status)})</span>
        </label>
      `;
    }).join("");
  }

  function applyAutoPageSelectionForImprove() {
    if (!dom.newInstructionId || !dom.newOptimizationMode) return;
    if (dom.newOptimizationMode.value !== "improve") return;

    const instructionMongoId = dom.newInstructionId.value;
    if (!instructionMongoId) {
      setSelectedPageKeys([]);
      return;
    }

    const pageKeys = Array.isArray(state.instructionUsageMap[instructionMongoId])
      ? state.instructionUsageMap[instructionMongoId]
      : [];

    setSelectedPageKeys(pageKeys);
  }

  function applyOptimizationModeRules() {
    if (!dom.newOptimizationMode || !dom.newAgentMode || !dom.newInstructionId) {
      return;
    }

    const isCreateNew = dom.newOptimizationMode.value === "create-new";

    if (isCreateNew) {
      dom.newAgentMode.value = "human-only";
      dom.newAgentMode.disabled = true;
      dom.newInstructionId.disabled = true;
      dom.pageSelectionHint.textContent = "โหมดสร้างใหม่: เลือกเพจเองได้ และระบบจะสร้าง Instruction ใหม่ให้อัตโนมัติ (ทำงาน bootstrap ครั้งเดียว)";
      return;
    }

    dom.newAgentMode.disabled = false;
    dom.newInstructionId.disabled = false;
    dom.pageSelectionHint.textContent = "โหมดปรับปรุง: ระบบจะติ๊กเพจที่ใช้ instruction นี้ให้อัตโนมัติ";
    applyAutoPageSelectionForImprove();
  }

  function renderHealthCards() {
    if (!dom.healthCards) return;
    if (!state.agents.length) {
      dom.healthCards.innerHTML = "<div class='col-12'><div class='alert alert-light border'>ยังไม่มี agent</div></div>";
      return;
    }

    dom.healthCards.innerHTML = state.agents.map((agent) => {
      const health = agent.health || {};
      const latestRun = Array.isArray(agent.latestRuns) && agent.latestRuns.length > 0
        ? agent.latestRuns[0]
        : null;

      const optimizationLabel = agent.optimizationMode === "create-new"
        ? "create-new"
        : "improve";

      return `
        <div class="col-md-4">
          <div class="health-card">
            <div class="title d-flex justify-content-between align-items-center">
              <span>${escapeHtml(agent.name || "Agent")}</span>
              <span class="mode-badge ${agent.mode}">${escapeHtml(agent.mode || "-")}</span>
            </div>
            <div class="meta">Type: ${escapeHtml(optimizationLabel)}</div>
            <div class="meta">Last run: ${formatDateTime(latestRun ? latestRun.createdAt : null)}</div>
            <div class="meta">Conversion Before: ${health.conversionRateBefore || 0}%</div>
            <div class="meta">Conversion After: ${health.conversionRateAfter || 0}%</div>
            <div class="meta">Lift: ${health.conversionLiftPct || 0}%</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function buildInstructionSelectForRow(agent) {
    const disabled = agent.optimizationMode === "create-new" ? "disabled" : "";
    const selectedMongoId = resolveInstructionMongoId(agent.instructionId);
    const options = [`<option value="">-</option>`];
    for (const instruction of state.instructions) {
      const selected = instruction._id === selectedMongoId ? "selected" : "";
      options.push(
        `<option value="${instruction._id}" ${selected}>${escapeHtml(parseInstructionLabel(instruction))}</option>`,
      );
    }
    return `
      <select class="form-select form-select-sm agent-instruction-select" data-agent-id="${agent._id}" ${disabled}>
        ${options.join("")}
      </select>
    `;
  }

  function buildModelSelectForRow(agent) {
    const options = state.customerModelOptions.length
      ? state.customerModelOptions
      : ["gpt-4.1"];

    return `
      <select class="form-select form-select-sm agent-model-select" data-agent-id="${agent._id}">
        ${options
          .map((model) => {
            const selected = model === agent.customerDefaultModel ? "selected" : "";
            return `<option value="${escapeHtml(model)}" ${selected}>${escapeHtml(model)}</option>`;
          })
          .join("")}
      </select>
    `;
  }

  function buildManagedPagesCell(agent) {
    const pageKeys = Array.isArray(agent.pageKeys) ? agent.pageKeys : [];
    if (!pageKeys.length) return "-";

    const previewLimit = 2;
    const previewRows = pageKeys
      .slice(0, previewLimit)
      .map((pageKey) => escapeHtml(resolveManagedPageLabel(pageKey)));
    const moreCount = Math.max(0, pageKeys.length - previewLimit);

    return `
      <div class="managed-pages-cell">
        ${previewRows.join("<br>")}
        ${moreCount > 0 ? `<div class="small text-muted mt-1">+${moreCount} more</div>` : ""}
      </div>
    `;
  }

  function renderAgentTable() {
    if (!dom.agentsTableBody) return;
    dom.agentCountLabel.textContent = `${state.agents.length} agents`;

    if (!state.agents.length) {
      dom.agentsTableBody.innerHTML = "<tr><td colspan='8' class='text-center text-muted py-4'>ยังไม่มี agent</td></tr>";
      return;
    }

    dom.agentsTableBody.innerHTML = state.agents.map((agent) => {
      const latestRun = Array.isArray(agent.latestRuns) && agent.latestRuns.length > 0
        ? agent.latestRuns[0]
        : null;
      const runLink = latestRun
        ? `<a href="/admin/agent-forge/runs/${latestRun._id}" class="btn btn-sm btn-outline-secondary">View Run</a>`
        : "";
      const optimizationLabel = agent.optimizationMode === "create-new"
        ? (agent.createNewBootstrapDone ? "create-new (done)" : "create-new")
        : "improve";

      return `
        <tr>
          <td>
            <div class="fw-semibold">${escapeHtml(agent.name || "Agent")}</div>
            <div class="small text-muted">${escapeHtml(agent._id)}</div>
          </td>
          <td>
            <span class="small fw-semibold">${escapeHtml(optimizationLabel)}</span>
          </td>
          <td><span class="mode-badge ${agent.mode}">${escapeHtml(agent.mode || "-")}</span></td>
          <td>${buildInstructionSelectForRow(agent)}</td>
          <td>${buildManagedPagesCell(agent)}</td>
          <td>${buildModelSelectForRow(agent)}</td>
          <td>${latestRun ? `${escapeHtml(latestRun.status)} · ${formatDateTime(latestRun.createdAt)}` : "-"}</td>
          <td class="text-end">
            <div class="agent-actions">
              <button class="btn btn-sm btn-primary" data-action="run" data-agent-id="${agent._id}">Run</button>
              <button class="btn btn-sm btn-outline-primary" data-action="dry-run" data-agent-id="${agent._id}">Dry</button>
              <button class="btn btn-sm btn-outline-dark" data-action="toggle-mode" data-agent-id="${agent._id}" data-mode="${agent.mode}">Mode</button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete" data-agent-id="${agent._id}">Delete</button>
              ${runLink}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadBootstrapOptions() {
    const response = await fetch("/api/agent-forge/bootstrap/options");
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "load_bootstrap_failed");
    }

    state.instructions = Array.isArray(payload.instructions) ? payload.instructions : [];
    state.managedPages = Array.isArray(payload.managedPages) ? payload.managedPages : [];
    state.instructionUsageMap = payload.instructionUsageMap && typeof payload.instructionUsageMap === "object"
      ? payload.instructionUsageMap
      : {};
    state.customerModelOptions = Array.isArray(payload.customerModelOptions)
      ? payload.customerModelOptions
      : ["gpt-4.1"];

    renderManagedPages();
    renderInstructionSelectOptions(dom.newInstructionId, {
      includeEmpty: true,
      emptyLabel: "เลือก Instruction ที่ต้องการปรับปรุง",
    });
    renderCustomerModelOptions(dom.newCustomerModel);
    if (!dom.newCustomerModel.value) {
      dom.newCustomerModel.value = "gpt-4.1";
    }
    applyOptimizationModeRules();
  }

  async function loadAgents() {
    const response = await fetch("/api/agent-forge/agents?includeHealth=1");
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "load_agents_failed");
    }

    state.agents = Array.isArray(payload.agents) ? payload.agents : [];
    renderHealthCards();
    renderAgentTable();
  }

  async function createAgent(event) {
    event.preventDefault();

    const optimizationMode = dom.newOptimizationMode.value === "create-new"
      ? "create-new"
      : "improve";

    const payload = {
      name: dom.newAgentName.value.trim(),
      optimizationMode,
      mode: dom.newAgentMode.value,
      instructionId:
        optimizationMode === "improve"
          ? dom.newInstructionId.value || null
          : null,
      customerDefaultModel: dom.newCustomerModel.value || "gpt-4.1",
      pageKeys: getSelectedPageKeys(),
    };

    const response = await fetch("/api/agent-forge/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "create_agent_failed");
    }

    showToast("สร้าง Agent สำเร็จ");
    dom.createAgentForm.reset();
    applyOptimizationModeRules();
    await Promise.all([loadBootstrapOptions(), loadAgents()]);
  }

  async function updateAgentConfig(agentId, patch = {}) {
    const response = await fetch(`/api/agent-forge/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "update_agent_failed");
    }

    await Promise.all([loadBootstrapOptions(), loadAgents()]);
    return data;
  }

  async function runAgent(agentId, dryRun) {
    const response = await fetch(`/api/agent-forge/agents/${agentId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "run_failed");
    }

    if (data.run && data.run._id) {
      window.location.href = `/admin/agent-forge/runs/${data.run._id}`;
      return;
    }

    await loadAgents();
  }

  async function toggleMode(agentId, currentMode) {
    const nextMode = currentMode === "ai-live-reply" ? "human-only" : "ai-live-reply";
    const response = await fetch(`/api/agent-forge/agents/${agentId}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "toggle_mode_failed");
    }

    await loadAgents();
  }

  async function deleteAgent(agentId, agentName) {
    const displayName = agentName || "Agent";
    const confirmed = window.confirm(
      `ยืนยันลบ "${displayName}"?\nระบบจะปลดการผูก Agent Forge ออกจากเพจที่ดูแลอยู่`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/agent-forge/agents/${agentId}`, {
      method: "DELETE",
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "delete_agent_failed");
    }

    const detachedPages = Number(data.detachedPages || 0);
    showToast(`ลบ Agent สำเร็จ (ปลดการผูก ${detachedPages} เพจ)`);
    await Promise.all([loadBootstrapOptions(), loadAgents()]);
  }

  function handleTableAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const agentId = button.dataset.agentId;
    const mode = button.dataset.mode;

    if (!agentId) return;

    button.disabled = true;

    Promise.resolve()
      .then(async () => {
        if (action === "run") {
          await runAgent(agentId, false);
        } else if (action === "dry-run") {
          await runAgent(agentId, true);
        } else if (action === "toggle-mode") {
          await toggleMode(agentId, mode);
        } else if (action === "delete") {
          const targetAgent = state.agents.find((agent) => agent._id === agentId) || null;
          await deleteAgent(agentId, targetAgent?.name || null);
        }
      })
      .catch((error) => {
        console.error(error);
        showToast(`ไม่สำเร็จ: ${humanizeError(error.message || "unknown_error")}`);
      })
      .finally(() => {
        button.disabled = false;
      });
  }

  function bindEvents() {
    dom.createAgentForm?.addEventListener("submit", (event) => {
      createAgent(event).catch((error) => {
        console.error(error);
        showToast(`สร้าง Agent ไม่สำเร็จ: ${humanizeError(error.message || "unknown_error")}`);
      });
    });

    dom.newOptimizationMode?.addEventListener("change", () => {
      applyOptimizationModeRules();
    });

    dom.newInstructionId?.addEventListener("change", () => {
      applyAutoPageSelectionForImprove();
    });

    dom.clearCreateFormBtn?.addEventListener("click", () => {
      dom.createAgentForm?.reset();
      dom.newCustomerModel.value = "gpt-4.1";
      dom.newOptimizationMode.value = "improve";
      applyOptimizationModeRules();
      setSelectedPageKeys([]);
    });

    dom.refreshAgentsBtn?.addEventListener("click", () => {
      Promise.all([loadBootstrapOptions(), loadAgents()]).catch((error) => {
        console.error(error);
        showToast(`โหลดข้อมูลไม่สำเร็จ: ${humanizeError(error.message || "unknown_error")}`);
      });
    });

    dom.agentsTableBody?.addEventListener("click", handleTableAction);

    dom.agentsTableBody?.addEventListener("change", (event) => {
      const modelSelect = event.target.closest(".agent-model-select");
      if (modelSelect) {
        const agentId = modelSelect.dataset.agentId;
        const customerDefaultModel = modelSelect.value;
        updateAgentConfig(agentId, { customerDefaultModel }).catch((error) => {
          console.error(error);
          showToast(`อัปเดตโมเดลไม่สำเร็จ: ${humanizeError(error.message || "unknown_error")}`);
        });
        return;
      }

      const instructionSelect = event.target.closest(".agent-instruction-select");
      if (instructionSelect) {
        const agentId = instructionSelect.dataset.agentId;
        const instructionId = instructionSelect.value || null;
        updateAgentConfig(agentId, { instructionId, optimizationMode: "improve" }).catch((error) => {
          console.error(error);
          showToast(`อัปเดต instruction ไม่สำเร็จ: ${humanizeError(error.message || "unknown_error")}`);
        });
      }
    });
  }

  async function init() {
    renderManagedPages();
    renderInstructionSelectOptions(dom.newInstructionId, {
      includeEmpty: true,
      emptyLabel: "เลือก Instruction ที่ต้องการปรับปรุง",
    });
    renderCustomerModelOptions(dom.newCustomerModel);
    bindEvents();

    await loadBootstrapOptions();
    await loadAgents();
  }

  init().catch((error) => {
    console.error(error);
    renderHealthCards();
    renderAgentTable();
    showToast(`โหลดข้อมูลไม่สำเร็จ: ${humanizeError(error.message || "unknown_error")}`);
  });
})();
