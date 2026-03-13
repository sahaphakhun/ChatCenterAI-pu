/**
 * Instruction Conversations — Frontend Logic
 * Handles instruction selection, filter management, thread display, and detail view.
 */
(function () {
    "use strict";

    // ─── State ───
    let currentInstructionId = null;
    let currentVersion = null;
    let currentPage = 1;
    let totalPages = 1;
    let selectedOutcome = "all";
    let selectedProducts = [];
    let filterOptions = null;

    // ─── DOM Refs ───
    const $ = (id) => document.getElementById(id);
    const instructionSelect = $("instructionSelect");
    const analyticsPanel = $("analyticsPanel");
    const sidebarActions = $("sidebarActions");
    const filtersBar = $("filtersBar");
    const threadList = $("threadList");
    const emptyState = $("emptyState");
    const pagination = $("pagination");
    const threadDetailOverlay = $("threadDetailOverlay");
    const loadingOverlay = $("loadingOverlay");

    // ─── Init ───
    instructionSelect.addEventListener("change", onInstructionChange);
    $("btnApplyFilters").addEventListener("click", () => { currentPage = 1; loadThreads(); });
    $("btnPrevPage").addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadThreads(); } });
    $("btnNextPage").addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadThreads(); } });
    $("btnBackToList").addEventListener("click", closeThreadDetail);
    $("btnRebuild").addEventListener("click", rebuildThreads);
    $("sidebarToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));

    // Outcome chips
    document.querySelectorAll("#outcomeChips .chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            document.querySelectorAll("#outcomeChips .chip").forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            selectedOutcome = chip.dataset.value;
        });
    });

    // Search on Enter
    $("searchInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { currentPage = 1; loadThreads(); }
    });

    // ─── Instruction Change ───
    async function onInstructionChange() {
        currentInstructionId = instructionSelect.value;
        currentPage = 1;
        selectedProducts = [];

        if (!currentInstructionId) {
            hideAll();
            return;
        }

        showLoading();
        try {
            await Promise.all([loadAnalytics(), loadFilterOptions(), loadThreads()]);
        } finally {
            hideLoading();
        }

        analyticsPanel.style.display = "block";
        sidebarActions.style.display = "block";
        filtersBar.style.display = "block";
    }

    // ─── Load Analytics ───
    async function loadAnalytics() {
        try {
            const params = new URLSearchParams();
            if (currentVersion != null) params.set("version", currentVersion);

            const res = await fetch(`/api/instruction-conversations/${currentInstructionId}/analytics?${params}`);
            const data = await res.json();

            $("statConversion").textContent = (data.conversionRate || 0) + "%";
            $("statAvgMessages").textContent = (data.avgUserMessages || 0) + " msgs";
            $("statTotalThreads").textContent = data.totalThreads || 0;
            $("statWithOrders").textContent = data.threadsWithOrders || 0;

            // Top products
            const topEl = $("topProducts");
            if (data.topProducts && data.topProducts.length > 0) {
                topEl.innerHTML = `<h4><i class="fas fa-box"></i> สินค้ายอดนิยม</h4>` +
                    data.topProducts.slice(0, 5).map((p) =>
                        `<div class="product-item"><span class="product-name">${esc(p.product)}</span><span class="product-count">${p.count}</span></div>`
                    ).join("");
            } else {
                topEl.innerHTML = "";
            }

            // Platform
            const platEl = $("platformBreakdown");
            if (data.platformBreakdown) {
                platEl.innerHTML = Object.entries(data.platformBreakdown).map(([p, c]) =>
                    `<span class="platform-badge ${p}">${p.toUpperCase()}: ${c}</span>`
                ).join("");
            }
        } catch (err) {
            console.error("Analytics error:", err);
        }
    }

    // ─── Load Filter Options ───
    async function loadFilterOptions() {
        try {
            const params = new URLSearchParams();
            if (currentVersion != null) params.set("version", currentVersion);

            const res = await fetch(`/api/instruction-conversations/${currentInstructionId}/filters?${params}`);
            filterOptions = await res.json();

            // Render product tags
            const tagsEl = $("productTags");
            if (filterOptions.products && filterOptions.products.length > 0) {
                tagsEl.innerHTML = filterOptions.products.map((p) =>
                    `<span class="product-tag" data-product="${esc(p.name)}">${esc(p.name)} (${p.count})</span>`
                ).join("");

                tagsEl.querySelectorAll(".product-tag").forEach((tag) => {
                    tag.addEventListener("click", () => {
                        tag.classList.toggle("selected");
                        const prod = tag.dataset.product;
                        if (tag.classList.contains("selected")) {
                            if (!selectedProducts.includes(prod)) selectedProducts.push(prod);
                        } else {
                            selectedProducts = selectedProducts.filter((p) => p !== prod);
                        }
                    });
                });
            } else {
                tagsEl.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">ไม่มีข้อมูลสินค้า</span>';
            }
        } catch (err) {
            console.error("Filter options error:", err);
        }
    }

    // ─── Load Threads ───
    async function loadThreads() {
        if (!currentInstructionId) return;

        showLoading();
        try {
            const params = new URLSearchParams();
            if (currentVersion != null) params.set("version", currentVersion);
            if (selectedOutcome && selectedOutcome !== "all") params.set("outcome", selectedOutcome);

            const minMsg = $("minMessages").value;
            const maxMsg = $("maxMessages").value;
            if (minMsg) params.set("minUserMessages", minMsg);
            if (maxMsg) params.set("maxUserMessages", maxMsg);

            const platform = $("platformFilter").value;
            if (platform) params.set("platform", platform);

            params.set("sortBy", $("sortBy").value);

            if (selectedProducts.length > 0) params.set("products", selectedProducts.join(","));

            const search = $("searchInput").value.trim();
            if (search) params.set("search", search);

            params.set("page", currentPage);
            params.set("limit", 20);

            const res = await fetch(`/api/instruction-conversations/${currentInstructionId}?${params}`);
            const data = await res.json();

            // Handle search results (different format)
            if (search && data.results) {
                renderSearchResults(data.results);
                return;
            }

            renderThreads(data.threads || []);

            // Update pagination
            if (data.pagination) {
                currentPage = data.pagination.page;
                totalPages = data.pagination.totalPages;
                $("pageInfo").textContent = `${currentPage} / ${totalPages}`;
                $("btnPrevPage").disabled = currentPage <= 1;
                $("btnNextPage").disabled = !data.pagination.hasMore;
                pagination.style.display = totalPages > 1 ? "flex" : "none";
            }
        } catch (err) {
            console.error("Load threads error:", err);
        } finally {
            hideLoading();
        }
    }

    // ─── Render Threads ───
    function renderThreads(threads) {
        if (threads.length === 0) {
            threadList.style.display = "none";
            emptyState.style.display = "block";
            emptyState.innerHTML = `
                <i class="fas fa-search"></i>
                <h3>ไม่พบสนทนาที่ตรงกับเงื่อนไข</h3>
                <p>ลองปรับ filter หรือเลือก Instruction อื่น</p>
            `;
            return;
        }

        emptyState.style.display = "none";
        threadList.style.display = "block";

        threadList.innerHTML = threads.map((t) => {
            const userIdShort = (t.senderId || "").substring(0, 12);
            const time = formatRelativeTime(t.stats?.lastMessageAt || t.updatedAt);
            const outcomeLabel = getOutcomeLabel(t.outcome);
            const productList = (t.orderedProducts || []).join(", ");
            const totalAmount = t.totalOrderAmount > 0 ? `฿${t.totalOrderAmount.toLocaleString()}` : "";

            return `
                <div class="thread-card" data-thread-id="${esc(t.threadId)}" onclick="window._openThread('${esc(t.threadId)}')">
                    <div class="thread-header">
                        <div class="thread-user">
                            <div class="user-icon"><i class="fas fa-user"></i></div>
                            <div class="user-info">
                                <div class="user-id">${esc(userIdShort)}...</div>
                                <div class="bot-name">${esc(t.botName || t.platform || "—")} ${t.platform ? `(${t.platform.toUpperCase()})` : ""}</div>
                            </div>
                        </div>
                        <span class="thread-time">${time}</span>
                    </div>
                    <div class="thread-stats">
                        <span class="stat"><i class="fas fa-comment"></i> ${t.stats?.userMessages || 0} msgs</span>
                        <span class="outcome-badge ${t.outcome || "unknown"}">${outcomeLabel}</span>
                        ${productList ? `<span class="stat"><i class="fas fa-shopping-cart"></i> ${esc(productList)} ${totalAmount}</span>` : ""}
                    </div>
                    ${renderTags(t.tags)}
                </div>
            `;
        }).join("");
    }

    function renderSearchResults(results) {
        if (results.length === 0) {
            threadList.style.display = "none";
            emptyState.style.display = "block";
            emptyState.innerHTML = `<i class="fas fa-search"></i><h3>ไม่พบผลลัพธ์</h3>`;
            return;
        }

        emptyState.style.display = "none";
        threadList.style.display = "block";
        pagination.style.display = "none";

        threadList.innerHTML = results.map((r) => `
            <div class="thread-card" ${r.threadId ? `onclick="window._openThread('${esc(r.threadId)}')"` : ""}>
                <div class="thread-header">
                    <div class="thread-user">
                        <div class="user-icon"><i class="fas fa-${r.role === "user" ? "user" : "robot"}"></i></div>
                        <div class="user-info">
                            <div class="user-id">${esc((r.senderId || "").substring(0, 12))}...</div>
                            <div class="bot-name">${r.role}</div>
                        </div>
                    </div>
                    <span class="thread-time">${formatRelativeTime(r.timestamp)}</span>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5;">${esc(r.content || "")}</div>
            </div>
        `).join("");
    }

    function renderTags(tags) {
        if (!tags || tags.length === 0) return "";
        return `<div class="thread-tags">${tags.map((t) =>
            `<span class="thread-tag">${esc(t.replace(/^(auto|manual):/, ""))}</span>`
        ).join("")}</div>`;
    }

    // ─── Thread Detail ───
    window._openThread = async function (threadId) {
        showLoading();
        try {
            const res = await fetch(`/api/instruction-conversations/${currentInstructionId}/thread/${threadId}`);
            const data = await res.json();

            if (data.error) {
                console.error("Thread detail error:", data.error);
                return;
            }

            // Meta
            const t = data.thread || {};
            $("threadMeta").innerHTML = `
                <strong>${esc(t.senderId || "")}</strong> — ${esc(t.botName || "")} (${(t.platform || "").toUpperCase()})
                · <span class="outcome-badge ${t.outcome || "unknown"}">${getOutcomeLabel(t.outcome)}</span>
                · ${t.stats?.userMessages || 0} ข้อความลูกค้า
            `;

            // Messages
            const msgEl = $("threadMessages");
            msgEl.innerHTML = (data.messages || []).map((m) => `
                <div class="message-bubble ${m.role}">
                    ${esc(m.content || "")}
                    <div class="message-time">${formatTime(m.timestamp)}</div>
                </div>
            `).join("");

            // Scroll to bottom
            setTimeout(() => { msgEl.scrollTop = msgEl.scrollHeight; }, 100);

            // Order summary
            const orderEl = $("threadOrderSummary");
            if (t.hasOrder && t.orderedProducts && t.orderedProducts.length > 0) {
                orderEl.style.display = "block";
                orderEl.innerHTML = `
                    <div class="order-card">
                        <h4><i class="fas fa-shopping-bag"></i> ออเดอร์</h4>
                        <div class="order-products">${t.orderedProducts.map((p) => esc(p)).join(", ")}</div>
                        ${t.totalOrderAmount > 0 ? `<div class="order-amount">฿${t.totalOrderAmount.toLocaleString()}</div>` : ""}
                    </div>
                `;
            } else {
                orderEl.style.display = "none";
            }

            threadDetailOverlay.style.display = "flex";
        } catch (err) {
            console.error("Open thread error:", err);
        } finally {
            hideLoading();
        }
    };

    function closeThreadDetail() {
        threadDetailOverlay.style.display = "none";
    }

    // ─── Rebuild ───
    async function rebuildThreads() {
        if (!confirm("ต้องการสร้าง Thread Index ใหม่ทั้งหมดจาก chat_history ที่มีอยู่?\n\nอาจใช้เวลาสักครู่...")) return;

        $("btnRebuild").disabled = true;
        $("btnRebuild").innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสร้าง...';

        try {
            const res = await fetch(`/api/instruction-conversations/${currentInstructionId || "all"}/rebuild`, { method: "POST" });
            const data = await res.json();
            alert(`เสร็จแล้ว! สร้าง ${data.processedThreads || 0} threads จาก ${data.totalGroups || 0} กลุ่ม`);
            // Reload
            if (currentInstructionId) {
                await Promise.all([loadAnalytics(), loadFilterOptions(), loadThreads()]);
            }
        } catch (err) {
            alert("เกิดข้อผิดพลาด: " + err.message);
        } finally {
            $("btnRebuild").disabled = false;
            $("btnRebuild").innerHTML = '<i class="fas fa-sync-alt"></i> Rebuild Threads';
        }
    }

    // ─── Helpers ───
    function hideAll() {
        analyticsPanel.style.display = "none";
        sidebarActions.style.display = "none";
        filtersBar.style.display = "none";
        threadList.style.display = "none";
        pagination.style.display = "none";
        threadDetailOverlay.style.display = "none";
        emptyState.style.display = "block";
        emptyState.innerHTML = `
            <i class="fas fa-comments"></i>
            <h3>เลือก Instruction เพื่อดูประวัติสนทนา</h3>
            <p>ระบบจะแสดงรายการสนทนาทั้งหมดของลูกค้าที่ใช้ Instruction นั้น</p>
        `;
    }

    function showLoading() { loadingOverlay.style.display = "flex"; }
    function hideLoading() { loadingOverlay.style.display = "none"; }

    function esc(str) {
        const div = document.createElement("div");
        div.textContent = String(str || "");
        return div.innerHTML;
    }

    function getOutcomeLabel(outcome) {
        const map = {
            purchased: "ซื้อ",
            not_purchased: "ไม่ซื้อ",
            pending: "รอ",
            unknown: "ไม่ทราบ",
        };
        return map[outcome] || outcome || "ไม่ทราบ";
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return "—";
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return "ตอนนี้";
        if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
        if (diffHr < 24) return `${diffHr} ชม. ที่แล้ว`;
        if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
        return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    }

    function formatTime(dateStr) {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleString("th-TH", {
            hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
        });
    }
})();
