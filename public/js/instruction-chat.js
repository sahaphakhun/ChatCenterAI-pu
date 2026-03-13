/**
 * Instruction Chat Editor — Frontend Logic v2
 * Premium ChatGPT / Vercel style with SSE streaming, session persistence
 */

(function () {
    "use strict";

    // ─── Config ─────────────────────────────────────────────────────────

    const MODELS = {
        "gpt-5.2": { label: "GPT-5.2", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.2-codex": { label: "GPT-5.2 Codex", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.1": { label: "GPT-5.1", efforts: ["off", "low", "medium", "high"], default: "medium" },
        "gpt-5": { label: "GPT-5", efforts: ["low", "medium", "high"], default: "medium" },
    };

    // ─── State ──────────────────────────────────────────────────────────

    let state = {
        instructions: [],
        selectedId: null,
        selectedName: "",
        sessionId: null,
        model: "gpt-5.2",
        thinking: "medium",
        history: [],
        totalTokens: 0,
        totalChanges: 0,
        sending: false,
        sidebarOpen: window.innerWidth >= 769,
        abortController: null,
        pendingImages: [], // { file, dataUrl }
        activeRequestId: null, // for SSE reconnect
        isUserNearBottom: true,
    };

    const SCROLL_BOTTOM_THRESHOLD_PX = 48;
    let scrollToBottomRafId = null;

    // ─── DOM ────────────────────────────────────────────────────────────

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        sidebar: $("#icSidebar"),
        sidebarOverlay: $("#icSidebarOverlay"),
        sidebarClose: $("#icSidebarClose"),
        toggleSidebar: $("#icToggleSidebar"),
        instructionList: $("#icInstructionList"),
        instructionSearch: $("#icInstructionSearch"),
        sessionSection: $("#icSessionSection"),
        sessionList: $("#icSessionList"),
        activeName: $("#icActiveName"),
        topbarTitle: $("#icTopbarTitle"),
        messages: $("#icMessages"),
        empty: $("#icEmpty"),
        quickSuggest: $("#icQuickSuggest"),
        quickSuggestWrap: $("#icQuickSuggestWrap"),
        inputArea: $("#icInputArea"),
        inputWrapper: $("#icInputWrapper"),
        input: $("#icInput"),
        send: $("#icSend"),
        statusInfo: $("#icStatusInfo"),
        statusModel: $("#icStatusModel"),
        statusThinking: $("#icStatusThinking"),
        statusTokens: $("#icStatusTokens"),
        statusChanges: $("#icStatusChanges"),
        modelBtn: $("#icModelBtn"),
        modelLabel: $("#icModelLabel"),
        modelDropdown: $("#icModelDropdown"),
        thinkingLevels: $("#icThinkingLevels"),
        thinkingNote: $("#icThinkingNote"),
        newChat: $("#icNewChat"),
        attach: $("#icAttach"),
        fileInput: $("#icFileInput"),
        imagePreview: $("#icImagePreview"),
    };

    // ─── Init ───────────────────────────────────────────────────────────

    async function init() {
        await loadInstructions();
        setupEventListeners();
        updateThinkingUI();

        // Desktop: sidebar visible by default
        if (window.innerWidth >= 769) {
            state.sidebarOpen = true;
        }
    }

    // ─── API ────────────────────────────────────────────────────────────

    async function loadInstructions() {
        try {
            const res = await fetch("/api/instructions-v2");
            const data = await res.json();
            if (data.success) {
                state.instructions = data.instructions || [];
                renderInstructionList();
            }
        } catch (err) {
            console.error("Failed to load instructions:", err);
            dom.instructionList.innerHTML = `
                <div class="ic-sidebar-loading">
                    <span style="color: var(--ic-danger);">โหลดไม่สำเร็จ</span>
                </div>`;
        }
    }

    async function sendMessage(text) {
        const rawText = typeof text === "string" ? text : "";
        if ((!rawText.trim() && state.pendingImages.length === 0) || !state.selectedId || state.sending) return;

        const historyForRequest = [...state.history];
        state.isUserNearBottom = isNearMessagesBottom();
        state.sending = true;
        updateSendButton();
        dom.input.value = "";
        autoResize(dom.input);

        // Capture and clear pending images
        const imagesToSend = [...state.pendingImages];
        state.pendingImages = [];
        clearImagePreview();

        // Hide welcome cards
        if (dom.empty) dom.empty.style.display = "none";

        // Add user message (with images if any)
        appendMessage("user", rawText, imagesToSend);
        const historyUserText = rawText.trim() || (imagesToSend.length > 0 ? `[แนบรูปภาพ ${imagesToSend.length} รูป]` : "");
        state.history.push({ role: "user", content: historyUserText });

        // Create streaming AI response container
        const aiMsg = appendStreamingMessage();
        const contentEl = aiMsg.querySelector(".ic-msg-content");
        let fullContent = "";

        // Set up abort controller
        state.abortController = new AbortController();

        try {
            // Upload images first if any
            let uploadedImages = [];
            for (const img of imagesToSend) {
                try {
                    const formData = new FormData();
                    formData.append("image", img.file);
                    const uploadRes = await fetch("/api/instruction-ai/upload-image", {
                        method: "POST", body: formData,
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData.success) uploadedImages.push({ data: uploadData.imageData, name: img.file.name });
                } catch (e) { console.warn("Image upload failed:", e); }
            }

            const response = await fetch("/api/instruction-ai/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instructionId: state.selectedId,
                    message: rawText,
                    model: state.model,
                    thinking: state.thinking,
                    history: historyForRequest,
                    sessionId: state.sessionId,
                    images: uploadedImages.length > 0 ? uploadedImages : undefined,
                }),
                signal: state.abortController.signal,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                contentEl.innerHTML = formatContent(`❌ Error: ${errData.error || response.statusText}`);
                return;
            }

            // Process SSE stream with shared handler
            const result = await handleSSEStream(response, aiMsg, contentEl);
            fullContent = result.fullContent;
            let historyRecovered = false;

            if (!fullContent && !(state._lastAssistantMessages && state._lastAssistantMessages.length)) {
                const recovered = await recoverMissingAssistantResult(contentEl);
                if (recovered.recovered) {
                    fullContent = recovered.content || "";
                    historyRecovered = true;
                }
            }

            // Save to history — use full tool messages if available
            if (fullContent && !historyRecovered) {
                const fullMsgs = state._lastAssistantMessages;
                if (fullMsgs && fullMsgs.length > 0) {
                    for (const m of fullMsgs) {
                        state.history.push(m);
                    }
                } else {
                    state.history.push({ role: "assistant", content: fullContent });
                }
                state._lastAssistantMessages = null;
            }

            // Auto-save session (backend also saves, but this keeps frontend state in sync)
            saveSession();

        } catch (err) {
            if (err.name === "AbortError") {
                contentEl.innerHTML += formatContent("\n\n⏹️ หยุดการตอบ");
            } else {
                contentEl.innerHTML = formatContent(`❌ เกิดข้อผิดพลาด: ${err.message}`);
            }
        } finally {
            state.sending = false;
            state.abortController = null;
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic_activeRequestId"); } catch (e) { }
            updateSendButton();
            const typingEl = contentEl.querySelector(".ic-typing");
            if (typingEl) typingEl.remove();
        }
    }

    // ─── Shared SSE Stream Handler ──────────────────────────────────────

    async function handleSSEStream(response, aiMsg, contentEl) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let lastRenderedContent = "";
        let hasRenderedContent = false;
        let statusEl = null;
        let streamRenderHandle = null;
        let streamTextEl = null;
        let streamTextVisible = "";
        let streamRenderCarry = 0;
        let streamLastFrameAt = 0;
        let lastStreamScrollAt = 0;
        let doneHandled = false;
        let errorHandled = false;
        let statusPhase = "thinking";
        let statusIteration = 1;
        let statusTool = null;
        let statusBaseElapsedSec = 0;
        let statusTicker = null;
        let receivedSseContent = false;
        let sseContentBuffer = "";
        let lastSseContentAt = 0;
        const streamStartedAt = Date.now();
        const STATE_POLL_MS = 450;
        const SSE_STALE_FOR_STATE_MS = 700;
        let cancelledByState = false;
        let statePollTimer = null;
        let statePollInFlight = false;
        let statePollingStopped = false;
        let lastStateDigest = "";
        const body = aiMsg.querySelector(".ic-msg-body");

        const setActiveRequestId = (requestId) => {
            if (!requestId) return;
            const value = String(requestId);
            state.activeRequestId = value;
            try { sessionStorage.setItem("ic_activeRequestId", value); } catch (e) { }
        };

        const clearActiveRequestId = () => {
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic_activeRequestId"); } catch (e) { }
        };

        const getFinalAssistantContent = (assistantMessages) => {
            if (!Array.isArray(assistantMessages)) return "";
            for (let i = assistantMessages.length - 1; i >= 0; i--) {
                const msg = assistantMessages[i];
                if (msg && msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
                    return msg.content;
                }
            }
            return "";
        };

        const ensureStatusEl = () => {
            if (statusEl) return statusEl;
            statusEl = document.createElement("div");
            statusEl.className = "ic-status-text";
            contentEl.innerHTML = "";
            contentEl.appendChild(statusEl);
            return statusEl;
        };

        const showStatus = (text) => {
            if (hasRenderedContent || !text) return;
            const statusNode = ensureStatusEl();
            if (statusNode.textContent === text) return;
            statusNode.textContent = text;
            scrollToBottom();
        };

        const clearStatus = () => {
            if (!statusEl) return;
            statusEl.remove();
            statusEl = null;
        };

        const getElapsedSeconds = () => {
            const localElapsed = Math.floor((Date.now() - streamStartedAt) / 1000);
            return Math.max(0, statusBaseElapsedSec + localElapsed);
        };

        const syncElapsedFromServer = (serverElapsedSec) => {
            if (!Number.isFinite(serverElapsedSec)) return;
            const localElapsed = Math.floor((Date.now() - streamStartedAt) / 1000);
            const targetBase = Math.max(0, serverElapsedSec - localElapsed);
            if (targetBase > statusBaseElapsedSec) {
                statusBaseElapsedSec = targetBase;
            }
        };

        const buildLiveStatusText = () => {
            const elapsed = ` (${getElapsedSeconds()}s)`;
            const statusMap = {
                thinking: `AI กำลังคิด...${elapsed}`,
                continuing: `ประมวลผลรอบ ${statusIteration || ""}...${elapsed}`,
                responding: `กำลังเขียนคำตอบ...${elapsed}`,
                tool_plan: `เตรียมเรียก tool: ${statusTool || "..."}${elapsed}`,
                tool: `กำลังรัน tool: ${statusTool || "..."}${elapsed}`,
            };
            return statusMap[statusPhase] || `กำลังประมวลผล...${elapsed}`;
        };

        const renderLiveStatus = () => {
            showStatus(buildLiveStatusText());
        };

        const startLiveStatusTicker = () => {
            if (statusTicker) return;
            renderLiveStatus();
            statusTicker = setInterval(renderLiveStatus, 250);
        };

        const stopLiveStatusTicker = () => {
            if (!statusTicker) return;
            clearInterval(statusTicker);
            statusTicker = null;
        };

        const formatElapsedTime = (totalSec) => {
            const secs = Math.max(0, Math.floor(totalSec));
            const mins = Math.floor(secs / 60);
            const remainSec = secs % 60;
            if (mins <= 0) return `${remainSec}s`;
            return `${mins}m ${remainSec}s`;
        };

        const renderTotalElapsedMeta = (isError = false) => {
            if (!body) return;
            let metaEl = body.querySelector(".ic-msg-total-time");
            if (!metaEl) {
                metaEl = document.createElement("div");
                metaEl.className = "ic-msg-total-time";
                body.appendChild(metaEl);
            }
            if (isError) {
                metaEl.classList.add("error");
            } else {
                metaEl.classList.remove("error");
            }
            metaEl.textContent = `เวลารวม ${formatElapsedTime(getElapsedSeconds())}`;
            scrollToBottom();
        };

        const ensureStreamTextEl = () => {
            if (streamTextEl) return streamTextEl;
            clearStatus();
            contentEl.innerHTML = "";
            streamTextEl = document.createElement("div");
            streamTextEl.className = "ic-streaming-raw";
            streamTextEl.textContent = streamTextVisible;
            contentEl.appendChild(streamTextEl);
            return streamTextEl;
        };

        const scrollStreamToBottom = (force = false) => {
            const now = performance.now();
            if (!force && now - lastStreamScrollAt < 40) return;
            lastStreamScrollAt = now;
            scrollToBottom(force);
        };

        const getStreamCharsPerSecond = (lag) => {
            if (lag > 12000) return 7600;
            if (lag > 6000) return 5200;
            if (lag > 3000) return 3400;
            if (lag > 1500) return 2300;
            if (lag > 700) return 1500;
            if (lag > 250) return 900;
            return 300;
        };

        const findStreamOverlap = (baseText, candidateText) => {
            const maxOverlap = Math.min(512, baseText.length, candidateText.length);
            for (let size = maxOverlap; size > 0; size--) {
                if (baseText.endsWith(candidateText.slice(0, size))) return size;
            }
            return 0;
        };

        const mergeIncomingSseText = (deltaText) => {
            const chunk = typeof deltaText === "string" ? deltaText : String(deltaText || "");
            if (!chunk) return;
            receivedSseContent = true;
            lastSseContentAt = Date.now();
            sseContentBuffer += chunk;

            let merged = fullContent;
            if (!merged) {
                merged = sseContentBuffer;
            } else if (merged.startsWith(sseContentBuffer)) {
                // State snapshot already has more content than SSE has streamed so far.
            } else if (sseContentBuffer.startsWith(merged)) {
                merged = sseContentBuffer;
            } else {
                const overlap = findStreamOverlap(merged, sseContentBuffer);
                if (overlap > 0) {
                    merged = `${merged}${sseContentBuffer.slice(overlap)}`;
                } else if (sseContentBuffer.length >= merged.length) {
                    merged = sseContentBuffer;
                }
            }

            if (merged !== fullContent) {
                fullContent = merged;
                scheduleRender();
            }
        };

        const flushStreamText = (frameTs = performance.now()) => {
            streamRenderHandle = null;
            const lag = fullContent.length - streamTextVisible.length;
            if (lag <= 0) {
                streamRenderCarry = 0;
                streamLastFrameAt = frameTs;
                return;
            }

            const prevFrame = streamLastFrameAt || frameTs;
            const deltaMs = Math.max(10, Math.min(48, frameTs - prevFrame || 16));
            streamLastFrameAt = frameTs;

            streamRenderCarry += (getStreamCharsPerSecond(lag) * deltaMs) / 1000;
            let take = Math.floor(streamRenderCarry);
            if (take < 1) take = 1;
            if (lag <= 120) take = Math.min(take, 3);
            if (lag <= 40) take = Math.min(take, 2);
            take = Math.min(take, lag);
            streamRenderCarry = Math.max(0, streamRenderCarry - take);

            const nextLength = streamTextVisible.length + take;
            const nextChunk = fullContent.slice(streamTextVisible.length, nextLength);
            if (nextChunk) {
                ensureStreamTextEl().textContent += nextChunk;
                streamTextVisible += nextChunk;
            }
            hasRenderedContent = streamTextVisible.length > 0;
            scrollStreamToBottom();

            if (streamTextVisible.length < fullContent.length) {
                streamRenderHandle = requestAnimationFrame(flushStreamText);
            } else {
                streamRenderCarry = 0;
            }
        };

        const renderContentNow = (force = false) => {
            if (!force && fullContent === lastRenderedContent) return;
            if (streamRenderHandle) {
                cancelAnimationFrame(streamRenderHandle);
                streamRenderHandle = null;
            }
            streamTextVisible = fullContent;
            streamRenderCarry = 0;
            streamLastFrameAt = 0;
            clearStatus();
            contentEl.innerHTML = formatContent(fullContent);
            streamTextEl = null;
            lastRenderedContent = fullContent;
            hasRenderedContent = fullContent.length > 0;
            scrollStreamToBottom();
        };

        const scheduleRender = () => {
            if (fullContent.length === streamTextVisible.length) return;
            if (streamRenderHandle) return;
            streamRenderHandle = requestAnimationFrame(flushStreamText);
        };

        const stopStatePolling = () => {
            statePollingStopped = true;
            if (statePollTimer) {
                clearInterval(statePollTimer);
                statePollTimer = null;
            }
        };

        const applyDonePayload = (data = {}) => {
            if (doneHandled) return;
            doneHandled = true;

            if (data.usage) state.totalTokens += data.usage.total_tokens || 0;
            if (data.changes) state.totalChanges += data.changes.length;
            if (data.assistantMessages) state._lastAssistantMessages = data.assistantMessages;
            if (data.versionSnapshot && Number.isInteger(data.versionSnapshot.version)) {
                const label = $("#icVersionLabel");
                if (label) label.textContent = `v${data.versionSnapshot.version}`;
                if (body) renderVersionSnapshotSummary(body, data.versionSnapshot);
            }

            if (data.toolsUsed && Array.isArray(data.toolsUsed) && data.toolsUsed.length > 0 && body) {
                const toolNames = data.toolsUsed
                    .map((tool) => (typeof tool === "string" ? tool : tool?.tool))
                    .filter(Boolean);
                if (toolNames.length > 0) {
                    renderToolsUsedSummary(body, toolNames);
                }
            }

            if (!fullContent && data.assistantMessages) {
                const fallbackContent = getFinalAssistantContent(data.assistantMessages);
                if (fallbackContent) {
                    fullContent = fallbackContent;
                    renderContentNow(true);
                }
            }

            clearActiveRequestId();
            updateStatusBar();
            stopStatePolling();
            stopLiveStatusTicker();
            renderTotalElapsedMeta(false);
        };

        const applyErrorPayload = (errorMessage) => {
            if (errorHandled) return;
            errorHandled = true;
            if (errorMessage) {
                fullContent = fullContent
                    ? `${fullContent}\n❌ ${errorMessage}`
                    : `❌ ${errorMessage}`;
                renderContentNow(true);
            }
            clearActiveRequestId();
            stopStatePolling();
            stopLiveStatusTicker();
            renderTotalElapsedMeta(true);
        };

        const syncToolPipelineFromState = (tools) => {
            if (!body || !Array.isArray(tools) || tools.length === 0) return;
            ensureToolPipeline(body, contentEl);
            for (const toolState of tools) {
                if (!toolState || !toolState.tool) continue;
                const stateStatus = String(toolState.status || "queued");
                const baseStatus = stateStatus === "running" ? "running" : (stateStatus === "queued" ? "queued" : "done");
                addToolToPipeline(body, toolState.tool, toolState.args || null, {
                    callId: toolState.callId || null,
                    status: baseStatus,
                });
                if (baseStatus === "done") {
                    const summary = toolState.summary || (stateStatus === "error" ? "❌" : "✅");
                    updateToolInPipeline(aiMsg, toolState.tool, summary, toolState.callId || null);
                }
            }
            scrollToBottom();
        };

        const applyStateSnapshot = async (snapshot) => {
            if (!snapshot || typeof snapshot !== "object") return;
            if (snapshot.sessionId) state.sessionId = snapshot.sessionId;
            if (snapshot.requestId) setActiveRequestId(snapshot.requestId);

            if (snapshot.phase) {
                const statusData = {
                    phase: snapshot.phase,
                    iteration: snapshot.iteration,
                    tool: snapshot.tool,
                    elapsedSec: snapshot.elapsedSec,
                };
                handleEvent("status", statusData);
            }

            if (Array.isArray(snapshot.tools) && snapshot.tools.length > 0) {
                syncToolPipelineFromState(snapshot.tools);
            }

            if (typeof snapshot.partialContent === "string" && snapshot.partialContent.length > 0) {
                const sseIdleMs = receivedSseContent
                    ? Date.now() - lastSseContentAt
                    : Date.now() - streamStartedAt;
                const shouldUseStateContent = sseIdleMs >= SSE_STALE_FOR_STATE_MS;
                const growsForward =
                    !fullContent ||
                    snapshot.partialContent.startsWith(fullContent) ||
                    (!receivedSseContent && snapshot.partialContent.length >= fullContent.length);

                if (
                    shouldUseStateContent &&
                    growsForward &&
                    snapshot.partialContent.length > fullContent.length
                ) {
                    fullContent = snapshot.partialContent;
                    scheduleRender();
                }
            }

            if (snapshot.status === "complete") {
                applyDonePayload({
                    usage: snapshot.usage,
                    changes: snapshot.changes,
                    toolsUsed: snapshot.toolsUsed,
                    assistantMessages: snapshot.assistantMessages,
                    versionSnapshot: snapshot.versionSnapshot,
                });
                cancelledByState = true;
                try { await reader.cancel(); } catch (e) { }
            } else if (snapshot.status === "error") {
                applyErrorPayload(snapshot.error || "การประมวลผลล้มเหลว");
                cancelledByState = true;
                try { await reader.cancel(); } catch (e) { }
            }
        };

        const pollStateOnce = async () => {
            if (statePollingStopped || statePollInFlight || !state.activeRequestId) return;
            statePollInFlight = true;
            try {
                const res = await fetch(`/api/instruction-ai/stream/state?requestId=${encodeURIComponent(state.activeRequestId)}`, {
                    cache: "no-store",
                });
                if (res.status === 404) {
                    clearActiveRequestId();
                    stopStatePolling();
                    return;
                }
                if (!res.ok) return;
                const payload = await res.json().catch(() => null);
                if (!payload || !payload.success) return;

                const toolDigest = Array.isArray(payload.tools)
                    ? payload.tools.map((t) => `${t.callId || ""}:${t.status || ""}:${t.summary || ""}`).join("|")
                    : "";
                const digest = [
                    payload.status || "",
                    payload.phase || "",
                    String(payload.iteration || ""),
                    payload.tool || "",
                    String((payload.partialContent || "").length),
                    toolDigest,
                    payload.error || "",
                ].join("||");

                if (digest === lastStateDigest && payload.status !== "complete" && payload.status !== "error") {
                    return;
                }
                lastStateDigest = digest;
                await applyStateSnapshot(payload);
            } catch (e) {
                // ignore fallback polling errors and continue streaming
            } finally {
                statePollInFlight = false;
            }
        };

        const startStatePolling = () => {
            if (statePollTimer || !state.activeRequestId) return;
            pollStateOnce();
            statePollTimer = setInterval(pollStateOnce, STATE_POLL_MS);
        };

        const handleEvent = (eventType, data) => {
            switch (eventType) {
                case "session":
                    if (data.sessionId) state.sessionId = data.sessionId;
                    if (data.requestId) {
                        setActiveRequestId(data.requestId);
                        startStatePolling();
                    }
                    break;

                case "thinking":
                    if (data.content && body) {
                        const thinkBlock = createThinkingBlock(data.content);
                        body.insertBefore(thinkBlock, contentEl);
                        scrollToBottom();
                    }
                    break;

                case "thinking_start":
                    if (body) {
                        const newBlock = createThinkingBlock("");
                        body.insertBefore(newBlock, contentEl);
                        clearStatus();
                        scrollToBottom();
                    }
                    break;

                case "thinking_delta":
                    if (data.text && body) {
                        const allBlocks = body.querySelectorAll(".ic-thinking-block");
                        let thinkBlock = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1] : null;
                        if (!thinkBlock) {
                            thinkBlock = createThinkingBlock("");
                            body.insertBefore(thinkBlock, contentEl);
                        }
                        const thinkBody = thinkBlock.querySelector(".ic-thinking-body");
                        if (thinkBody) thinkBody.textContent += data.text;
                        scrollToBottom();
                    }
                    break;

                case "thinking_done":
                    if (body) {
                        const allBlocks = body.querySelectorAll(".ic-thinking-block");
                        const lastBlock = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1] : null;
                        if (lastBlock && data.wordCount !== undefined) {
                            const meta = lastBlock.querySelector(".ic-thinking-meta");
                            if (meta) meta.textContent = `(${data.wordCount} words)`;
                        }
                    }
                    break;

                case "status":
                    if (data.phase && contentEl) {
                        statusPhase = data.phase || statusPhase;
                        statusIteration = data.iteration || statusIteration;
                        if (Object.prototype.hasOwnProperty.call(data, "tool")) {
                            statusTool = data.tool || null;
                        }
                        syncElapsedFromServer(data.elapsedSec);
                        renderLiveStatus();
                    }
                    break;

                case "tool_plan":
                    if (data.tool && body) {
                        ensureToolPipeline(body, contentEl);
                        addToolToPipeline(body, data.tool, null, { callId: data.callId, status: "queued" });
                        scrollToBottom();
                    }
                    break;

                case "content":
                    if (data.text !== undefined) {
                        mergeIncomingSseText(data.text);
                    }
                    break;

                case "tool_start":
                    if (data.tool && body) {
                        ensureToolPipeline(body, contentEl);
                        addToolToPipeline(body, data.tool, data.args, { callId: data.callId, status: "running" });
                        scrollToBottom();
                    }
                    break;

                case "tool_end":
                    if (data.tool) {
                        updateToolInPipeline(aiMsg, data.tool, data.summary || data.result || "✅", data.callId);
                    }
                    break;

                case "done":
                    applyDonePayload(data);
                    break;

                case "error":
                    applyErrorPayload(data.error);
                    break;

                default:
                    if (data.sessionId) {
                        state.sessionId = data.sessionId;
                    } else if (data.text !== undefined) {
                        mergeIncomingSseText(data.text);
                    } else if (data.error) {
                        applyErrorPayload(data.error);
                    }
                    break;
            }
        };

        const processRawSSEEvent = (rawEvent) => {
            if (!rawEvent) return;
            const lines = rawEvent.replace(/\r/g, "").split("\n");
            let eventType = "message";
            const dataLines = [];

            for (const line of lines) {
                if (!line) continue;
                if (line.startsWith(":")) continue;
                if (line.startsWith("event:")) {
                    eventType = line.slice(6).trim();
                    continue;
                }
                if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }

            if (dataLines.length === 0) return;
            const jsonStr = dataLines.join("\n");
            let data;
            try { data = JSON.parse(jsonStr); } catch { return; }
            handleEvent(eventType, data);
        };

        const processBuffer = (flush = false) => {
            let separatorIndex = buffer.indexOf("\n\n");
            while (separatorIndex !== -1) {
                const rawEvent = buffer.slice(0, separatorIndex);
                buffer = buffer.slice(separatorIndex + 2);
                processRawSSEEvent(rawEvent);
                separatorIndex = buffer.indexOf("\n\n");
            }

            if (flush && buffer.trim()) {
                processRawSSEEvent(buffer);
                buffer = "";
            }
        };

        const headerSessionId = response.headers.get("X-Instruction-Session-Id");
        if (headerSessionId) state.sessionId = headerSessionId;
        const headerRequestId = response.headers.get("X-Instruction-Request-Id");
        if (headerRequestId) setActiveRequestId(headerRequestId);
        startLiveStatusTicker();
        startStatePolling();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    buffer += decoder.decode();
                    buffer = buffer.replace(/\r\n/g, "\n");
                    processBuffer(true);
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                buffer = buffer.replace(/\r\n/g, "\n");
                processBuffer(false);
            }
        } catch (streamError) {
            if (streamError?.name === "AbortError") throw streamError;
            if (!cancelledByState) throw streamError;
        } finally {
            stopStatePolling();
            stopLiveStatusTicker();
        }

        renderContentNow(true);
        renderTotalElapsedMeta(errorHandled);
        scrollToBottom(true);
        return { fullContent };
    }

    // ─── Resume Active Request ──────────────────────────────────────────

    async function resumeActiveRequest(requestId) {
        if (state.sending) return; // Already processing

        state.isUserNearBottom = isNearMessagesBottom();
        state.sending = true;
        updateSendButton();

        const aiMsg = appendStreamingMessage();
        const contentEl = aiMsg.querySelector(".ic-msg-content");

        state.abortController = new AbortController();

        try {
            const response = await fetch(`/api/instruction-ai/stream/resume?requestId=${encodeURIComponent(requestId)}`, {
                signal: state.abortController.signal,
            });

            // If 404 — request completed while we were away, reload session
            if (response.status === 404) {
                // Remove streaming message and reload session from DB
                aiMsg.remove();
                state.activeRequestId = null;
                try { sessionStorage.removeItem("ic_activeRequestId"); } catch (e) { }
                const lastSession = await loadLatestSession(state.selectedId);
                if (lastSession?.sessionId && lastSession?.history?.length > 0) {
                    state.sessionId = lastSession.sessionId;
                    state.history = lastSession.history;
                    state.totalTokens = lastSession.totalTokens || 0;
                    state.totalChanges = lastSession.totalChanges || 0;
                    // Re-render messages
                    dom.messages.innerHTML = "";
                    for (const msg of state.history) {
                        if (msg.role === "user") appendMessage("user", msg.content);
                        else if (msg.role === "assistant" && msg.content && !msg.tool_calls) appendMessage("ai", msg.content);
                    }
                    updateStatusBar();
                }
                return;
            }

            if (!response.ok) {
                contentEl.innerHTML = formatContent("❌ ไม่สามารถต่อเนื่องได้");
                return;
            }

            const result = await handleSSEStream(response, aiMsg, contentEl);
            let historyRecovered = false;

            if (!result.fullContent && !(state._lastAssistantMessages && state._lastAssistantMessages.length)) {
                const recovered = await recoverMissingAssistantResult(contentEl);
                if (recovered.recovered) {
                    result.fullContent = recovered.content || "";
                    historyRecovered = true;
                }
            }

            const latestAssistantContent = (() => {
                for (let i = state.history.length - 1; i >= 0; i--) {
                    const msg = state.history[i];
                    if (msg && msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
                        return msg.content.trim();
                    }
                }
                return "";
            })();
            const isReplayDuplicate =
                result.fullContent &&
                latestAssistantContent &&
                result.fullContent.trim() === latestAssistantContent;

            if (isReplayDuplicate) {
                aiMsg.remove();
                state._lastAssistantMessages = null;
            } else if (result.fullContent && !historyRecovered) {
                const fullMsgs = state._lastAssistantMessages;
                if (fullMsgs && fullMsgs.length > 0) {
                    for (const m of fullMsgs) state.history.push(m);
                } else {
                    state.history.push({ role: "assistant", content: result.fullContent });
                }
                state._lastAssistantMessages = null;
            }

            saveSession();
        } catch (err) {
            if (err.name === "AbortError") {
                contentEl.innerHTML += formatContent("\n\n⏹️ หยุดการตอบ");
            } else {
                contentEl.innerHTML = formatContent(`❌ เกิดข้อผิดพลาด: ${err.message}`);
            }
        } finally {
            state.sending = false;
            state.abortController = null;
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic_activeRequestId"); } catch (e) { }
            updateSendButton();
            const typingEl = contentEl.querySelector(".ic-typing");
            if (typingEl) typingEl.remove();
        }
    }

    function stopStreaming() {
        if (state.abortController) {
            state.abortController.abort();
        }
    }

    // ─── Render Elements ────────────────────────────────────────────────

    function appendStreamingMessage() {
        const div = document.createElement("div");
        div.className = "ic-msg ic-msg--ai";
        div.innerHTML = `
        <div class="ic-msg-row">
            <div class="ic-msg-avatar ic-msg-avatar-ai">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
            </div>
            <div class="ic-msg-body">
                <div class="ic-msg-role">AI Assistant</div>
                <div class="ic-msg-content"><div class="ic-typing"><span></span><span></span><span></span></div></div>
            </div>
        </div>`;
        dom.messages.appendChild(div);
        scrollToBottom();
        return div;
    }

    function appendMessage(role, content, images) {
        const isUser = role === "user";
        const hasTextContent = typeof content === "string" && content.trim().length > 0;
        const div = document.createElement("div");
        div.className = `ic-msg ${isUser ? "ic-msg--user" : "ic-msg--ai"}`;

        let imageHtml = "";
        if (isUser && Array.isArray(images) && images.length > 0) {
            imageHtml = `<div class="ic-msg-images">${images.map(img =>
                `<img src="${img.dataUrl || img.data || ''}" class="ic-msg-thumb" alt="uploaded image">`
            ).join("")}</div>`;
        }

        if (isUser) {
            div.innerHTML = `
            <div class="ic-msg-row">
                <div class="ic-msg-body">
                    ${imageHtml}
                    ${hasTextContent ? `<div class="ic-msg-content">${formatContent(content)}</div>` : ""}
                </div>
            </div>`;
        } else {
            div.innerHTML = `
            <div class="ic-msg-row">
                <div class="ic-msg-avatar ic-msg-avatar-ai">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                </div>
                <div class="ic-msg-body">
                    <div class="ic-msg-role">AI Assistant</div>
                    <div class="ic-msg-content">${formatContent(content)}</div>
                </div>
            </div>`;
        }

        dom.messages.appendChild(div);
        scrollToBottom();
        return div;
    }

    function createThinkingBlock(content) {
        const block = document.createElement("div");
        block.className = "ic-thinking-block collapsed";
        const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
        const metaText = wordCount > 0 ? `(${wordCount} words)` : "...";
        block.innerHTML = `
        <div class="ic-thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="ic-thinking-icon"><i class="fas fa-lightbulb"></i> Thinking <span class="ic-thinking-meta">${metaText}</span></span>
            <i class="fas fa-chevron-down ic-chevron"></i>
        </div>
        <div class="ic-thinking-body">${escapeHtml(content)}</div>`;
        return block;
    }

    // ─── Image Upload Helpers ────────────────────────────────────────────

    function handleImageSelect(e) {
        const files = Array.from(e.target.files || []).slice(0, 10);
        if (!files.length) return;

        for (const file of files) {
            if (state.pendingImages.length >= 10) break;
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.pendingImages.push({ file, dataUrl: ev.target.result });
                renderImagePreview();
                updateSendButton();
            };
            reader.readAsDataURL(file);
        }
        // Reset file input
        e.target.value = "";
    }

    function renderImagePreview() {
        if (!dom.imagePreview) return;
        if (state.pendingImages.length === 0) {
            dom.imagePreview.style.display = "none";
            dom.imagePreview.innerHTML = "";
            return;
        }
        dom.imagePreview.style.display = "flex";
        dom.imagePreview.innerHTML = state.pendingImages.map((img, i) => `
            <div class="ic-preview-item">
                <img src="${img.dataUrl}" alt="preview">
                <button class="ic-preview-remove" data-idx="${i}" title="ลบ">&times;</button>
            </div>
        `).join("");
        // Remove buttons
        dom.imagePreview.querySelectorAll(".ic-preview-remove").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                state.pendingImages.splice(idx, 1);
                renderImagePreview();
                updateSendButton();
            });
        });
    }

    function clearImagePreview() {
        state.pendingImages = [];
        renderImagePreview();
    }

    // ─── Tool Pipeline (collapsed real-time summary) ──────────────────

    function getToolType(toolName) {
        if (!toolName) return "search";
        if (toolName.includes("search") || toolName.includes("get")) return "search";
        if (toolName.includes("update") || toolName.includes("rename")) return "edit";
        if (toolName.includes("add") || toolName.includes("create")) return "add";
        if (toolName.includes("delete")) return "delete";
        return "search";
    }

    function getToolIcon(type) {
        return { search: "fa-magnifying-glass", edit: "fa-pen", add: "fa-plus", delete: "fa-trash" }[type] || "fa-terminal";
    }

    function getToolColor(type) {
        return { search: "#38bdf8", edit: "#fbbf24", add: "#34d399", delete: "#f87171" }[type] || "#a78bfa";
    }

    function ensureToolPipeline(body, contentEl) {
        if (body.querySelector(".ic-tool-pipeline")) return;
        const pipeline = document.createElement("div");
        pipeline.className = "ic-tool-pipeline collapsed";
        pipeline.innerHTML = `
        <div class="ic-pipeline-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div class="ic-pipeline-status">
                <div class="ic-pipeline-spinner"></div>
                <span class="ic-pipeline-label">Executing tools...</span>
            </div>
            <div class="ic-pipeline-meta">
                <span class="ic-pipeline-count">0 calls</span>
                <i class="fas fa-chevron-down ic-pipeline-chevron"></i>
            </div>
        </div>
        <div class="ic-pipeline-body"></div>`;
        body.insertBefore(pipeline, contentEl);
    }

    function refreshToolPipelineHeader(pipeline) {
        if (!pipeline) return;
        const pipelineBody = pipeline.querySelector(".ic-pipeline-body");
        if (!pipelineBody) return;

        const entries = Array.from(pipelineBody.querySelectorAll(".ic-pipeline-entry"));
        const total = entries.length;
        const running = entries.filter((entry) => entry.classList.contains("running")).length;
        const queued = entries.filter((entry) => entry.classList.contains("queued")).length;
        const pending = running + queued;

        const countEl = pipeline.querySelector(".ic-pipeline-count");
        if (countEl) countEl.textContent = `${total} call${total > 1 ? "s" : ""}`;

        const labelEl = pipeline.querySelector(".ic-pipeline-label");
        const spinnerEl = pipeline.querySelector(".ic-pipeline-spinner");

        if (pending > 0) {
            pipeline.classList.add("active");
            if (spinnerEl) spinnerEl.style.display = "";
            const next = entries.find((entry) => entry.classList.contains("running")) ||
                entries.find((entry) => entry.classList.contains("queued"));
            if (labelEl) {
                const toolName = next?.dataset?.tool || "tool";
                labelEl.innerHTML = `<code>${escapeHtml(toolName)}</code>`;
            }
            return;
        }

        pipeline.classList.remove("active");
        if (spinnerEl) spinnerEl.style.display = "none";
        if (labelEl) {
            labelEl.innerHTML = `<span class="ic-pipeline-done-text">Done</span> · ${total} tool${total > 1 ? "s" : ""} executed`;
        }
    }

    function addToolToPipeline(body, toolName, args, options = {}) {
        const pipeline = body.querySelector(".ic-tool-pipeline");
        if (!pipeline) return;

        const pipelineBody = pipeline.querySelector(".ic-pipeline-body");
        const type = getToolType(toolName);
        const icon = getToolIcon(type);
        const color = getToolColor(type);
        const status = options.status || "running";
        const callId = options.callId ? String(options.callId) : null;

        const existing = callId
            ? Array.from(pipelineBody.querySelectorAll(".ic-pipeline-entry")).find((entry) => entry.dataset.callId === callId)
            : null;
        if (existing) {
            existing.classList.remove("queued", "running", "done");
            existing.classList.add(status);
            const statusEl = existing.querySelector(".ic-pipeline-entry-status");
            if (statusEl) statusEl.textContent = status;
            const right = existing.querySelector(".ic-pipeline-entry-right");
            if (right) {
                const spinner = right.querySelector(".ic-pipeline-entry-spinner");
                if (spinner) spinner.remove();
                const pending = right.querySelector(".ic-pipeline-entry-pending");
                if (pending) pending.remove();
                if (status === "running") {
                    const spin = document.createElement("div");
                    spin.className = "ic-pipeline-entry-spinner";
                    right.appendChild(spin);
                } else if (status === "queued") {
                    const waiting = document.createElement("i");
                    waiting.className = "fas fa-hourglass-half ic-pipeline-entry-pending";
                    right.appendChild(waiting);
                }
            }
            refreshToolPipelineHeader(pipeline);
            return;
        }

        // Add tool entry
        const entry = document.createElement("div");
        entry.className = `ic-pipeline-entry ${status}`;
        entry.dataset.tool = toolName;
        entry.dataset.type = type;
        if (callId) entry.dataset.callId = callId;
        const rightStatusAddon = status === "running"
            ? '<div class="ic-pipeline-entry-spinner"></div>'
            : (status === "queued" ? '<i class="fas fa-hourglass-half ic-pipeline-entry-pending"></i>' : "");
        entry.innerHTML = `
            <div class="ic-pipeline-entry-left">
                <i class="fas ${icon} ic-pipeline-entry-icon" style="color:${color}"></i>
                <span class="ic-pipeline-entry-name" style="color:${color}">${toolName}</span>
            </div>
            <div class="ic-pipeline-entry-right">
                <span class="ic-pipeline-entry-status">${status}</span>
                ${rightStatusAddon}
            </div>`;
        pipelineBody.appendChild(entry);
        refreshToolPipelineHeader(pipeline);
    }

    function updateToolInPipeline(aiMsg, toolName, summary, callId = null) {
        const pipeline = aiMsg.querySelector(".ic-tool-pipeline");
        if (!pipeline) return;

        const pipelineBody = pipeline.querySelector(".ic-pipeline-body");
        let entry = null;
        if (callId) {
            entry = Array.from(pipelineBody.querySelectorAll(".ic-pipeline-entry"))
                .find((el) => el.dataset.callId === String(callId));
        }
        if (!entry) {
            const entries = pipelineBody.querySelectorAll(`.ic-pipeline-entry.running[data-tool="${toolName}"], .ic-pipeline-entry.queued[data-tool="${toolName}"]`);
            entry = entries[entries.length - 1];
        }
        if (entry) {
            entry.classList.remove("queued");
            entry.classList.remove("running");
            entry.classList.add("done");
            const statusEl = entry.querySelector(".ic-pipeline-entry-status");
            const spinnerEl = entry.querySelector(".ic-pipeline-entry-spinner");
            const pendingEl = entry.querySelector(".ic-pipeline-entry-pending");
            if (statusEl) statusEl.textContent = summary;
            if (spinnerEl) spinnerEl.remove();
            if (pendingEl) pendingEl.remove();
            const right = entry.querySelector(".ic-pipeline-entry-right");
            if (right && !right.querySelector(".ic-pipeline-entry-check")) {
                const check = document.createElement("i");
                check.className = "fas fa-check ic-pipeline-entry-check";
                right.appendChild(check);
            }
        }
        refreshToolPipelineHeader(pipeline);
    }

    function renderToolsUsedSummary(body, tools) {
        if (!body || !Array.isArray(tools) || tools.length === 0) return;
        let summary = body.querySelector(".ic-tools-used");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "ic-tools-used";
            body.appendChild(summary);
        }
        const uniqueTools = [...new Set(tools)];
        summary.textContent = `Tools used: ${uniqueTools.join(", ")}`;
    }

    function renderVersionSnapshotSummary(body, snapshot) {
        if (!body || !snapshot || !Number.isInteger(snapshot.version)) return;
        let summary = body.querySelector(".ic-version-snapshot");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "ic-tools-used ic-version-snapshot";
            body.appendChild(summary);
        }
        const source = snapshot.auto ? "auto" : "tool";
        const note = snapshot.note ? ` — ${snapshot.note}` : "";
        summary.textContent = `Version saved: v${snapshot.version} (${source})${note}`;
    }

    // ─── Session Persistence ────────────────────────────────────────────

    function generateSessionId() {
        return `ses_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    }

    async function saveSession() {
        if (!state.sessionId || !state.selectedId) return;
        try {
            await fetch("/api/instruction-ai/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: state.sessionId,
                    instructionId: state.selectedId,
                    instructionName: state.selectedName,
                    history: state.history,
                    model: state.model,
                    thinking: state.thinking,
                    totalTokens: state.totalTokens,
                    totalChanges: state.totalChanges,
                }),
            });
        } catch (err) {
            console.warn("Failed to save session:", err);
        }
    }

    async function loadLatestSession(instructionId) {
        try {
            const res = await fetch("/api/instruction-ai/sessions?instructionId=" + encodeURIComponent(instructionId));
            const data = await res.json();
            if (data.success && data.sessions && data.sessions.length > 0) {
                return data.sessions[0];
            }
        } catch (err) {
            console.warn("Failed to load sessions:", err);
        }
        return null;
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function getLatestAssistantMessage(history = []) {
        if (!Array.isArray(history)) return null;
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg && msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
                return msg;
            }
        }
        return null;
    }

    async function recoverMissingAssistantResult(contentEl) {
        if (!state.selectedId) return { recovered: false, content: "" };

        for (let attempt = 0; attempt < 3; attempt++) {
            const latestSession = await loadLatestSession(state.selectedId);
            if (latestSession?.history?.length) {
                const serverLastAssistant = getLatestAssistantMessage(latestSession.history);
                const localLastAssistant = getLatestAssistantMessage(state.history);
                const hasNewAssistant = Boolean(
                    serverLastAssistant &&
                    (!localLastAssistant || serverLastAssistant.content.trim() !== localLastAssistant.content.trim())
                );

                if (hasNewAssistant) {
                    state.sessionId = latestSession.sessionId || state.sessionId;
                    state.history = latestSession.history;
                    state.totalTokens = latestSession.totalTokens || state.totalTokens;
                    state.totalChanges = latestSession.totalChanges || state.totalChanges;

                    if (contentEl && serverLastAssistant.content) {
                        contentEl.innerHTML = formatContent(serverLastAssistant.content);
                        scrollToBottom();
                    }

                    updateStatusBar();
                    return { recovered: true, content: serverLastAssistant.content };
                }
            }

            if (attempt < 2) await wait(600);
        }

        return { recovered: false, content: "" };
    }

    // ─── Render Lists ───────────────────────────────────────────────────

    function renderInstructionList(filter = "") {
        const filtered = state.instructions.filter(inst =>
            !filter || (inst.name || "").toLowerCase().includes(filter.toLowerCase())
        );

        if (!filtered.length) {
            dom.instructionList.innerHTML = `
                <div class="ic-sidebar-loading">
                    <span>ไม่พบ instruction</span>
                </div>`;
            return;
        }

        dom.instructionList.innerHTML = filtered.map(inst => {
            const items = inst.dataItems || [];
            const tableCount = items.filter(i => i.type === "table").length;
            const textCount = items.filter(i => i.type === "text").length;
            const active = inst._id === state.selectedId ? "active" : "";

            return `
            <div class="ic-inst-item ${active}" data-id="${inst._id}" data-name="${escapeHtml(inst.name || '')}">
                <div class="ic-inst-name">${escapeHtml(inst.name || "ไม่มีชื่อ")}</div>
                <div class="ic-inst-meta">
                    ${tableCount ? `<span class="ic-inst-badge">📊 ${tableCount} ตาราง</span>` : ""}
                    ${textCount ? `<span class="ic-inst-badge">📝 ${textCount} ข้อความ</span>` : ""}
                    ${!items.length ? '<span class="ic-inst-badge">ว่าง</span>' : ""}
                </div>
            </div>`;
        }).join("");
    }

    async function selectInstruction(id, name) {
        state.selectedId = id;
        state.selectedName = name;
        state.sessionId = generateSessionId();
        state.history = [];
        state.totalTokens = 0;
        state.totalChanges = 0;
        state.isUserNearBottom = true;

        // Update UI
        dom.activeName.textContent = name || "Untitled";
        dom.empty.style.display = "none";
        dom.input.disabled = false;
        if (dom.attach) dom.attach.disabled = false;
        dom.input.placeholder = `พิมพ์คำสั่ง... เช่น "ดูราคาสินค้า"`;
        dom.statusInfo.style.display = "inline-flex";
        dom.messages.innerHTML = "";

        // Try to load latest session and restore chat
        const lastSession = await loadLatestSession(id);
        if (lastSession && lastSession.sessionId && lastSession.history && lastSession.history.length > 0) {
            // Restore session state
            state.sessionId = lastSession.sessionId;
            state.history = lastSession.history;
            state.totalTokens = lastSession.totalTokens || 0;
            state.totalChanges = lastSession.totalChanges || 0;

            // Render old messages from history
            for (const msg of state.history) {
                if (msg.role === "user") {
                    appendMessage("user", msg.content);
                } else if (msg.role === "assistant" && msg.content && !msg.tool_calls) {
                    appendMessage("ai", msg.content);
                }
                // Skip tool_calls and tool result messages (visual only)
            }

            // Hide quick suggest if has history
            if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "none";

            // Check if there's an active request to resume
            try {
                const savedRequestId = sessionStorage.getItem("ic_activeRequestId");
                if (savedRequestId) {
                    resumeActiveRequest(savedRequestId);
                }
            } catch (e) { }
        } else {
            appendMessage("ai", `สวัสดีครับ 👋 เลือก **${escapeHtml(name)}** เรียบร้อยแล้ว พิมพ์คำถามหรือคำสั่งได้เลยครับ`);
            // Show quick suggest for new chats
            if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "flex";
        }

        renderInstructionList(dom.instructionSearch.value);
        updateStatusBar();

        // Close mobile sidebar only
        if (window.innerWidth < 769) {
            dom.sidebar.classList.remove("open");
            dom.sidebarOverlay.classList.remove("show");
        }

        // Focus input
        setTimeout(() => dom.input.focus(), 100);

        // Load version info
        loadVersionInfo(id);
    }

    // ─── Sidebar ────────────────────────────────────────────────────────

    function toggleSidebar() {
        if (window.innerWidth < 769) {
            // Mobile: toggle overlay sidebar
            const isOpen = dom.sidebar.classList.toggle("open");
            dom.sidebarOverlay.classList.toggle("show", isOpen);
        } else {
            // Desktop: toggle width
            dom.sidebar.classList.toggle("hidden");
        }
    }

    function openSidebar() {
        if (window.innerWidth < 769) {
            dom.sidebar.classList.add("open");
            dom.sidebarOverlay.classList.add("show");
        } else {
            dom.sidebar.classList.remove("hidden");
        }
    }

    function closeSidebar() {
        if (window.innerWidth < 769) {
            dom.sidebar.classList.remove("open");
            dom.sidebarOverlay.classList.remove("show");
        } else {
            dom.sidebar.classList.add("hidden");
        }
    }

    // ─── Status & UI Updates ────────────────────────────────────────────

    function updateStatusBar() {
        dom.statusModel.textContent = MODELS[state.model]?.label || state.model;
        dom.statusThinking.textContent = state.thinking.charAt(0).toUpperCase() + state.thinking.slice(1);
        dom.statusTokens.textContent = state.totalTokens.toLocaleString();
        dom.statusChanges.textContent = state.totalChanges;
    }

    function updateSendButton() {
        const hasText = dom.input.value.trim().length > 0;
        const hasImages = state.pendingImages.length > 0;
        const hasInstruction = !!state.selectedId;

        if (state.sending) {
            // Show stop button
            dom.send.innerHTML = '<i class="fas fa-stop"></i>';
            dom.send.disabled = false;
            dom.send.title = "หยุด";
            dom.send.classList.add("ic-btn-stop-active");
        } else {
            dom.send.innerHTML = '<i class="fas fa-arrow-up"></i>';
            dom.send.disabled = !(hasText || hasImages) || !hasInstruction;
            dom.send.title = "ส่ง (Enter)";
            dom.send.classList.remove("ic-btn-stop-active");
        }
    }

    function updateThinkingUI() {
        const modelConfig = MODELS[state.model];
        if (!modelConfig) return;

        const buttons = dom.thinkingLevels.querySelectorAll(".ic-think-btn");
        buttons.forEach(btn => {
            const level = btn.dataset.level;
            const supported = modelConfig.efforts.includes(level);
            btn.disabled = !supported;
            btn.classList.toggle("active", level === state.thinking);
        });

        const notes = [];
        if (!modelConfig.efforts.includes("max")) notes.push("ไม่รองรับ Max");
        if (!modelConfig.efforts.includes("off")) notes.push("ไม่รองรับ Off");
        dom.thinkingNote.textContent = notes.join(" · ");

        if (!modelConfig.efforts.includes(state.thinking)) {
            state.thinking = modelConfig.default;
            updateThinkingUI();
        }

        updateStatusBar();
    }

    // ─── Event Listeners ────────────────────────────────────────────────

    function setupEventListeners() {
        // Sidebar toggle
        dom.toggleSidebar.addEventListener("click", toggleSidebar);
        dom.sidebarOverlay.addEventListener("click", closeSidebar);
        if (dom.sidebarClose) {
            dom.sidebarClose.addEventListener("click", closeSidebar);
        }

        // Instruction selection
        dom.instructionList.addEventListener("click", (e) => {
            const item = e.target.closest(".ic-inst-item");
            if (item) selectInstruction(item.dataset.id, item.dataset.name);
        });

        // Search
        dom.instructionSearch.addEventListener("input", (e) => {
            renderInstructionList(e.target.value);
        });

        // Send message / Stop
        dom.send.addEventListener("click", () => {
            if (state.sending) {
                stopStreaming();
            } else {
                sendMessage(dom.input.value);
            }
        });

        dom.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!state.sending) {
                    sendMessage(dom.input.value);
                }
            }
        });

        dom.input.addEventListener("input", () => {
            updateSendButton();
            autoResize(dom.input);
        });

        dom.messages.addEventListener("scroll", () => {
            state.isUserNearBottom = isNearMessagesBottom();
            if (state.sending && !state.isUserNearBottom && scrollToBottomRafId) {
                cancelAnimationFrame(scrollToBottomRafId);
                scrollToBottomRafId = null;
            }
        }, { passive: true });

        // Image attach
        if (dom.attach) {
            dom.attach.addEventListener("click", () => {
                if (dom.fileInput) dom.fileInput.click();
            });
        }
        if (dom.fileInput) {
            dom.fileInput.addEventListener("change", handleImageSelect);
        }

        // Model dropdown
        dom.modelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = dom.modelDropdown.classList.toggle("show");
            dom.modelBtn.classList.toggle("open", isOpen);
        });

        document.addEventListener("click", (e) => {
            if (!dom.modelDropdown.contains(e.target) && !dom.modelBtn.contains(e.target)) {
                dom.modelDropdown.classList.remove("show");
                dom.modelBtn.classList.remove("open");
            }
        });

        // Model selection
        $$(".ic-model-option").forEach(opt => {
            opt.addEventListener("click", () => {
                state.model = opt.dataset.model;
                dom.modelLabel.textContent = MODELS[state.model]?.label || state.model;
                $$(".ic-model-option").forEach(o => o.classList.remove("active"));
                opt.classList.add("active");
                updateThinkingUI();
                // Close dropdown
                dom.modelDropdown.classList.remove("show");
                dom.modelBtn.classList.remove("open");
            });
        });

        // Thinking level
        dom.thinkingLevels.addEventListener("click", (e) => {
            const btn = e.target.closest(".ic-think-btn");
            if (!btn || btn.disabled) return;
            state.thinking = btn.dataset.level;
            updateThinkingUI();
        });

        // New chat buttons
        const handleNewChat = async () => {
            if (!state.selectedId) return;

            // Delete ALL sessions for this instruction from DB
            try {
                await fetch(`/api/instruction-ai/sessions/${state.sessionId}?instructionId=${state.selectedId}`, { method: "DELETE" });
            } catch (err) {
                console.warn("Failed to delete sessions:", err);
            }

            // Clear everything
            state.sessionId = generateSessionId();
            state.history = [];
            state.totalTokens = 0;
            state.totalChanges = 0;
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic_activeRequestId"); } catch (e) { }
            dom.messages.innerHTML = "";
            appendMessage("ai", `แชทใหม่เริ่มแล้ว! 🔄 เลือก **${escapeHtml(state.selectedName)}** อยู่ สั่งงานได้เลย`);
            updateStatusBar();
            dom.input.focus();
        };

        dom.newChat.addEventListener("click", handleNewChat);

        // Quick suggest button
        if (dom.quickSuggest) {
            dom.quickSuggest.addEventListener("click", () => {
                if (!state.selectedId || state.sending) return;
                if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "none";
                sendMessage("ช่วยแนะนำการปรับปรุง instruction นี้หน่อย");
            });
        }

        // Resize handler
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth >= 769) {
                    dom.sidebarOverlay.classList.remove("show");
                }
            }, 150);
        });
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatContent(text) {
        // ── 1. Extract markdown tables BEFORE escaping ──
        const tablePlaceholders = [];
        // Ensure trailing newline so last table row is captured
        const textNorm = text.endsWith('\n') ? text : text + '\n';
        text = textNorm.replace(
            /(?:^|\n)((?:\|[^\n]+\|\s*\n){2,})/g,
            (match, tableBlock, offset) => {
                const lines = tableBlock.trim().split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) return match;

                // Check for separator row (|---|---|)
                const sepIdx = lines.findIndex(l => /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|$/.test(l));
                if (sepIdx < 1) return match;

                // Parse alignment from separator
                const sepCells = lines[sepIdx].split('|').filter(c => c.trim() !== '');
                const aligns = sepCells.map(c => {
                    const t = c.trim();
                    if (t.startsWith(':') && t.endsWith(':')) return 'center';
                    if (t.endsWith(':')) return 'right';
                    return 'left';
                });

                // Parse header
                const headerCells = lines.slice(0, sepIdx)
                    .flatMap(l => [l.split('|').filter(c => c.trim() !== '').map(c => c.trim())]);

                // Parse body rows
                const bodyRows = lines.slice(sepIdx + 1).map(l =>
                    l.split('|').filter(c => c.trim() !== '').map(c => c.trim())
                );

                const colCount = Math.max(
                    aligns.length,
                    ...headerCells.map(r => r.length),
                    ...bodyRows.map(r => r.length)
                );

                // Determine table size class
                const isLarge = bodyRows.length > 8 || colCount > 4;
                const sizeClass = isLarge ? 'ic-table-large' : 'ic-table-compact';

                // Build HTML
                let html = `<div class="ic-table-wrap ${sizeClass}">`;
                html += `<div class="ic-table-scroll"><table class="ic-table">`;

                // Header
                html += '<thead><tr>';
                for (let i = 0; i < colCount; i++) {
                    const val = headerCells[0]?.[i] || '';
                    const align = aligns[i] || 'left';
                    html += `<th style="text-align:${align}">${escapeHtml(val)}</th>`;
                }
                html += '</tr></thead>';

                // Body
                html += '<tbody>';
                for (const row of bodyRows) {
                    // Skip completely empty rows
                    const hasContent = row.some(c => c.trim() !== '');
                    html += '<tr>';
                    for (let i = 0; i < colCount; i++) {
                        const val = row[i] || '';
                        const align = aligns[i] || 'left';
                        // Replace <br> tags in cell content
                        const cellHtml = escapeHtml(val)
                            .replace(/&lt;br&gt;/gi, '<br>')
                            .replace(/&lt;br\s*\/&gt;/gi, '<br>');
                        const emptyClass = !val.trim() ? ' class="ic-cell-empty"' : '';
                        html += `<td style="text-align:${align}"${emptyClass}>${cellHtml || '<span class="ic-cell-dash">—</span>'}</td>`;
                    }
                    html += '</tr>';
                }
                html += '</tbody></table></div>';

                // Row count badge
                html += `<div class="ic-table-meta">${bodyRows.length} rows · ${colCount} columns</div>`;
                html += '</div>';

                const idx = tablePlaceholders.length;
                tablePlaceholders.push(html);
                return `\n__TABLE_PLACEHOLDER_${idx}__\n`;
            }
        );

        // ── 2. Escape HTML for all non-table content ──
        let html = escapeHtml(text);

        // ── 3. Headings (### / ## / #) ──
        html = html.replace(/^###\s+(.+)$/gm, '<h4 class="ic-heading">$1</h4>');
        html = html.replace(/^##\s+(.+)$/gm, '<h3 class="ic-heading">$1</h3>');
        html = html.replace(/^#\s+(.+)$/gm, '<h2 class="ic-heading">$1</h2>');

        // ── 4. Bold ──
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // ── 5. Inline code ──
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

        // ── 6. Lists ──
        html = html.replace(/^[•\-]\s+(.+)$/gm, "<li>$1</li>");
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ic-ol-item">$1</li>');
        html = (() => {
            const lines = html.split("\n");
            const grouped = [];
            let activeList = "";
            const closeList = () => {
                if (activeList) {
                    grouped.push(`</${activeList}>`);
                    activeList = "";
                }
            };

            for (const line of lines) {
                const trimmed = line.trim();
                const isOrderedItem = /^<li class="ic-ol-item">.*<\/li>$/.test(trimmed);
                const isUnorderedItem = /^<li>.*<\/li>$/.test(trimmed);

                if (isOrderedItem) {
                    if (activeList !== "ol") {
                        closeList();
                        activeList = "ol";
                        grouped.push("<ol>");
                    }
                    grouped.push(trimmed);
                    continue;
                }

                if (isUnorderedItem) {
                    if (activeList !== "ul") {
                        closeList();
                        activeList = "ul";
                        grouped.push("<ul>");
                    }
                    grouped.push(trimmed);
                    continue;
                }

                closeList();
                grouped.push(line);
            }

            closeList();
            return grouped.join("\n");
        })();

        // ── 8. Line breaks ──
        html = html.replace(/\n/g, "<br>");
        html = html.replace(/<br><ul>/g, "<ul>");
        html = html.replace(/<ul><br>/g, "<ul>");
        html = html.replace(/<br><\/ul>/g, "</ul>");
        html = html.replace(/<\/ul><br>/g, "</ul>");
        html = html.replace(/<br><ol>/g, "<ol>");
        html = html.replace(/<ol><br>/g, "<ol>");
        html = html.replace(/<br><\/ol>/g, "</ol>");
        html = html.replace(/<\/ol><br>/g, "</ol>");
        html = html.replace(/<\/li><br><li/g, "</li><li");
        html = html.replace(/<br><h/g, "<h");
        html = html.replace(/<\/h([234])><br>/g, "</h$1>");

        // ── 9. Restore table placeholders ──
        for (let i = 0; i < tablePlaceholders.length; i++) {
            html = html.replace(`__TABLE_PLACEHOLDER_${i}__`, tablePlaceholders[i]);
            // Clean surrounding <br> around tables
            html = html.replace(/<br>__TABLE_PLACEHOLDER_/g, '__TABLE_PLACEHOLDER_');
        }
        // Final cleanup of <br> around table wraps
        html = html.replace(/<br>\s*(<div class="ic-table-wrap)/g, '$1');
        html = html.replace(/(<\/div>)\s*<br>/g, '$1');

        return html;
    }

    function isNearMessagesBottom() {
        if (!dom.messages) return true;
        const distanceFromBottom = dom.messages.scrollHeight - (dom.messages.scrollTop + dom.messages.clientHeight);
        return distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX;
    }

    function shouldAutoScroll(force = false) {
        if (force) return true;
        if (!state.sending) return true;
        return state.isUserNearBottom;
    }

    function scrollToBottom(force = false) {
        if (!dom.messages || !shouldAutoScroll(force)) return;
        if (scrollToBottomRafId) cancelAnimationFrame(scrollToBottomRafId);
        const forced = force;
        scrollToBottomRafId = requestAnimationFrame(() => {
            scrollToBottomRafId = null;
            if (!dom.messages || !shouldAutoScroll(forced)) return;
            dom.messages.scrollTop = dom.messages.scrollHeight;
            state.isUserNearBottom = true;
        });
    }

    function autoResize(textarea) {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }

    // ─── Version Management ─────────────────────────────────────────────

    async function loadVersionInfo(instructionId) {
        const controls = $("#icVersionControls");
        const label = $("#icVersionLabel");
        if (!controls || !label) return;

        controls.style.display = "flex";
        label.textContent = "...";

        try {
            const res = await fetch(`/api/instruction-ai/versions/${instructionId}`);
            const data = await res.json();
            label.textContent = data.currentVersion ? `v${data.currentVersion}` : "v0";
        } catch {
            label.textContent = "—";
        }
    }

    async function openVersionList() {
        const modal = $("#icVersionModal");
        const listEl = $("#icVersionList");
        if (!modal || !listEl || !state.selectedId) return;

        modal.style.display = "flex";
        listEl.innerHTML = '<div class="ic-version-empty">กำลังโหลด...</div>';

        try {
            const res = await fetch(`/api/instruction-ai/versions/${state.selectedId}`);
            const data = await res.json();

            if (!data.versions || data.versions.length === 0) {
                listEl.innerHTML = '<div class="ic-version-empty">ยังไม่มีเวอร์ชันที่บันทึกไว้<br><br>กด 💾 เพื่อบันทึกเวอร์ชันแรก</div>';
                return;
            }

            listEl.innerHTML = data.versions.map(v => {
                const date = v.snapshotAt ? new Date(v.snapshotAt).toLocaleDateString("th-TH", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                }) : "—";
                const isCurrent = v.version === data.currentVersion;
                return `
                <div class="ic-version-item ${isCurrent ? 'current' : ''}">
                    <div class="ic-version-item-left">
                        <span class="ic-version-num">v${v.version}</span>
                        <div class="ic-version-info">
                            <div class="ic-version-note-text">${v.note || '(ไม่มีหมายเหตุ)'}</div>
                            <div class="ic-version-date">${date}</div>
                        </div>
                    </div>
                    ${isCurrent ? '<span class="ic-version-current-badge">ปัจจุบัน</span>' : ''}
                </div>`;
            }).join("");
        } catch (err) {
            listEl.innerHTML = `<div class="ic-version-empty">❌ เกิดข้อผิดพลาด: ${err.message}</div>`;
        }
    }

    function openSaveVersionModal() {
        const modal = $("#icSaveVersionModal");
        const noteInput = $("#icVersionNote");
        if (!modal) return;
        modal.style.display = "flex";
        if (noteInput) { noteInput.value = ""; noteInput.focus(); }
    }

    async function confirmSaveVersion() {
        if (!state.selectedId) return;
        const btn = $("#icVersionSaveConfirm");
        const noteInput = $("#icVersionNote");
        const note = noteInput ? noteInput.value.trim() : "";

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...'; }

        try {
            const res = await fetch(`/api/instruction-ai/versions/${state.selectedId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note }),
            });
            const data = await res.json();
            if (data.success) {
                // Update label
                const label = $("#icVersionLabel");
                if (label) label.textContent = `v${data.version}`;
                // Close modal
                const modal = $("#icSaveVersionModal");
                if (modal) modal.style.display = "none";
                // Show confirmation in chat
                appendMessage("ai", `✅ บันทึกเวอร์ชัน **v${data.version}** เรียบร้อย${note ? " (" + note + ")" : ""}`);
            } else {
                appendMessage("ai", `❌ ไม่สามารถบันทึก: ${data.error}`);
            }
        } catch (err) {
            appendMessage("ai", `❌ เกิดข้อผิดพลาด: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> บันทึกเวอร์ชัน'; }
        }
    }

    function setupVersionListeners() {
        const versionBtn = $("#icVersionBtn");
        const saveBtn = $("#icSaveVersionBtn");
        const modalClose = $("#icVersionModalClose");
        const saveModalClose = $("#icSaveVersionModalClose");
        const saveConfirm = $("#icVersionSaveConfirm");
        const versionModal = $("#icVersionModal");
        const saveModal = $("#icSaveVersionModal");
        const noteInput = $("#icVersionNote");

        if (versionBtn) versionBtn.addEventListener("click", openVersionList);
        if (saveBtn) saveBtn.addEventListener("click", openSaveVersionModal);
        if (modalClose) modalClose.addEventListener("click", () => { if (versionModal) versionModal.style.display = "none"; });
        if (saveModalClose) saveModalClose.addEventListener("click", () => { if (saveModal) saveModal.style.display = "none"; });
        if (saveConfirm) saveConfirm.addEventListener("click", confirmSaveVersion);
        if (noteInput) noteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmSaveVersion(); });

        // Close modals on overlay click
        [versionModal, saveModal].forEach(modal => {
            if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
        });
    }

    // ─── Start ──────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", () => { init(); setupVersionListeners(); });
})();
