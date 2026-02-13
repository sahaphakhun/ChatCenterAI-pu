/**
 * Admin API Usage Dashboard - Consolidated View
 * Single page with charts, filters, and unified data table
 */

// ==================== Global State ====================
const State = {
    data: null,
    filteredData: [],
    viewMode: 'grouped', // 'grouped' or 'detailed'
    sortColumn: 'cost',
    sortDirection: 'desc',
    filters: {
        bot: '',
        model: '',
        platform: '',
        key: '',
        search: ''
    },
    charts: {
        daily: null,
        pie: null
    },
    expandedRow: null
};

const THB_RATE = 33;

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', function () {
    initEventListeners();
    loadDashboardData();
});

function initEventListeners() {
    // Date range
    document.getElementById('dateRangeSelect').addEventListener('change', loadDashboardData);

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', function () {
        this.querySelector('i').classList.add('fa-spin');
        loadDashboardData().finally(() => {
            this.querySelector('i').classList.remove('fa-spin');
        });
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);

    // Filters
    ['filterBot', 'filterModel', 'filterPlatform', 'filterKey'].forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });

    // Search with debounce
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 300);
    });

    // Clear filters
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

    // View mode toggle
    document.querySelectorAll('#viewModeToggle button').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#viewModeToggle button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            State.viewMode = this.dataset.view;
            renderTable();
        });
    });

    // Close expanded panel
    document.getElementById('closeExpandedPanel').addEventListener('click', closeExpandedPanel);
}

// ==================== Data Loading ====================
async function loadDashboardData() {
    try {
        showLoadingState();

        const params = getDateParams();
        const response = await fetch('/api/openai-usage/summary?' + params);
        const data = await response.json();

        State.data = data;

        // Populate filter dropdowns
        populateFilterDropdowns(data);

        // Update UI
        updateSummaryCards(data.summary || {});
        updateCharts(data);
        applyFilters();

        return data;

    } catch (err) {
        console.error('Error loading dashboard data:', err);
        showErrorState();
        throw err;
    }
}

function getDateParams() {
    const range = document.getElementById('dateRangeSelect').value;
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    let startDate = null;

    if (range === 'today') {
        startDate = new Date(now);
    } else if (range === '7days') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6); // รวมวันนี้ + ย้อน 6 วัน = 7 วัน
    } else if (range === '30days') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 29);
    } else if (range === 'all') {
        startDate = new Date(0);
    }

    if (startDate) {
        startDate.setHours(0, 0, 0, 0);
    }

    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate.toISOString());
    params.append('endDate', endDate.toISOString());
    return params;
}

// ==================== Summary Cards ====================
function updateSummaryCards(summary) {
    const totalCalls = summary.totalCalls || 0;
    const totalTokens = summary.totalTokens || 0;
    const totalCostUSD = summary.totalCostUSD || 0;
    const avgCostPerCall = totalCalls > 0 ? totalCostUSD / totalCalls : 0;

    animateValue('totalCalls', 0, totalCalls, 800, formatNumber);
    animateValue('totalTokens', 0, totalTokens, 800, formatNumber);

    document.getElementById('totalCost').textContent = '$' + formatCost(totalCostUSD);
    document.getElementById('totalCostTHB').textContent = '~฿' + formatNumber(Math.round(totalCostUSD * THB_RATE));

    document.getElementById('avgCostPerCall').textContent = '$' + avgCostPerCall.toFixed(4);
    document.getElementById('avgCostPerCallTHB').textContent = '~฿' + (avgCostPerCall * THB_RATE).toFixed(2);

    // Token breakdown (if available)
    if (summary.totalInputTokens !== undefined) {
        document.getElementById('inputTokens').textContent = formatNumber(summary.totalInputTokens);
        document.getElementById('outputTokens').textContent = formatNumber(summary.totalOutputTokens || 0);
    }
}

function animateValue(elementId, start, end, duration, formatter) {
    const element = document.getElementById(elementId);
    if (!element) return;
    if (end === 0) {
        element.textContent = formatter(end);
        return;
    }

    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + range * easeProgress);

        element.textContent = formatter(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// ==================== Charts ====================
function updateCharts(data) {
    updateDailyChart(data.daily || []);
    updatePieChart(data.byModel || []);
}

function updateDailyChart(dailyData) {
    const canvas = document.getElementById('dailyUsageChart');
    const ctx = canvas.getContext('2d');

    // Sort by date
    const sorted = [...dailyData].sort((a, b) => new Date(a._id) - new Date(b._id));

    const labels = sorted.map(d => formatShortDate(d._id));
    const callsData = sorted.map(d => d.calls || 0);
    const costData = sorted.map(d => d.cost || 0);

    // Destroy existing chart
    if (State.charts.daily) {
        State.charts.daily.destroy();
    }

    State.charts.daily = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Calls',
                    data: callsData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Cost ($)',
                    data: costData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 12 },
                    bodyFont: { size: 11 },
                    callbacks: {
                        label: function (context) {
                            if (context.dataset.label === 'Cost ($)') {
                                return `Cost: $${context.parsed.y.toFixed(4)}`;
                            }
                            return `Calls: ${formatNumber(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        font: { size: 10 },
                        callback: val => formatNumber(val)
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: {
                        font: { size: 10 },
                        callback: val => '$' + val.toFixed(2)
                    }
                }
            }
        }
    });
}

function updatePieChart(modelData) {
    const canvas = document.getElementById('modelPieChart');
    const ctx = canvas.getContext('2d');

    // Sort by cost and take top 5
    const sorted = [...modelData].sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0)).slice(0, 6);

    const labels = sorted.map(m => m.model);
    const data = sorted.map(m => m.costUSD || 0);

    const colors = [
        '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'
    ];

    // Destroy existing chart
    if (State.charts.pie) {
        State.charts.pie.destroy();
    }

    State.charts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        boxWidth: 10,
                        padding: 8,
                        font: { size: 10 },
                        generateLabels: function (chart) {
                            const data = chart.data;
                            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                            return data.labels.map((label, i) => {
                                const value = data.datasets[0].data[i];
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return {
                                    text: `${label} (${percentage}%)`,
                                    fillStyle: colors[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed;
                            return `$${value.toFixed(4)} (~฿${(value * THB_RATE).toFixed(2)})`;
                        }
                    }
                }
            }
        }
    });
}

// ==================== Filter Dropdowns ====================
function populateFilterDropdowns(data) {
    // Bots
    const botSelect = document.getElementById('filterBot');
    botSelect.innerHTML = '<option value="">ทั้งหมด</option>';
    (data.byBot || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.botId || '';
        opt.textContent = b.name || b.botId || '-';
        botSelect.appendChild(opt);
    });

    // Models
    const modelSelect = document.getElementById('filterModel');
    modelSelect.innerHTML = '<option value="">ทั้งหมด</option>';
    (data.byModel || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.model || '';
        opt.textContent = m.model || '-';
        modelSelect.appendChild(opt);
    });

    // Keys
    const keySelect = document.getElementById('filterKey');
    keySelect.innerHTML = '<option value="">ทั้งหมด</option>';
    (data.byKey || []).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.keyId || 'env';
        opt.textContent = k.name || 'Environment Variable';
        keySelect.appendChild(opt);
    });
}

// ==================== Filtering & Sorting ====================
function applyFilters() {
    State.filters = {
        bot: document.getElementById('filterBot').value,
        model: document.getElementById('filterModel').value,
        platform: document.getElementById('filterPlatform').value,
        key: document.getElementById('filterKey').value,
        search: document.getElementById('searchInput').value.toLowerCase()
    };

    // Update filtered summary if filters are active
    updateFilteredSummary();
    renderTable();
}

function clearFilters() {
    document.getElementById('filterBot').value = '';
    document.getElementById('filterModel').value = '';
    document.getElementById('filterPlatform').value = '';
    document.getElementById('filterKey').value = '';
    document.getElementById('searchInput').value = '';
    applyFilters();
}

function updateFilteredSummary() {
    // If any filter is active, recalculate summary
    const hasFilters = Object.values(State.filters).some(v => v !== '');

    if (!hasFilters && State.data) {
        updateSummaryCards(State.data.summary || {});
    }
    // For filtered view, summary would need to be recalculated from filtered data
    // This would require additional logic based on view mode
}

// ==================== Table Rendering ====================
function renderTable() {
    if (!State.data) return;

    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');

    if (State.viewMode === 'grouped') {
        renderGroupedTable(tableHeader, tableBody);
    } else {
        renderDetailedTable(tableHeader, tableBody);
    }
}

function renderGroupedTable(tableHeader, tableBody) {
    // Headers
    tableHeader.innerHTML = `
        <tr>
            <th class="sortable" data-sort="name">Bot/Page</th>
            <th class="sortable" data-sort="platform">Platform</th>
            <th class="sortable text-end" data-sort="calls">Calls</th>
            <th class="sortable text-end" data-sort="tokens">Tokens</th>
            <th class="sortable text-end" data-sort="cost">Cost (USD)</th>
            <th class="sortable text-end" data-sort="avgCost">ต้นทุน/ครั้ง</th>
            <th class="text-center" style="width: 50px;"></th>
        </tr>
    `;

    // Add sort click handlers
    tableHeader.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Get filtered bot data
    let items = [...(State.data.byBot || [])];

    // Apply filters
    items = items.filter(item => {
        if (State.filters.platform && item.platform !== State.filters.platform) return false;
        if (State.filters.search) {
            const name = (item.name || item.botId || '').toLowerCase();
            if (!name.includes(State.filters.search)) return false;
        }
        return true;
    });

    // Sort
    items = sortData(items);

    // Update count
    document.getElementById('resultCount').textContent = formatNumber(items.length);

    // Render rows
    if (items.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fas fa-inbox d-block"></i>
                    <p class="mb-0">ไม่พบข้อมูล</p>
                </td>
            </tr>
        `;
        return;
    }

    const maxCost = Math.max(...items.map(i => i.costUSD || 0));

    let html = '';
    items.forEach((item, index) => {
        const avgCostUSD = item.calls > 0 ? (item.costUSD / item.calls) : 0;
        const avgCostTHB = avgCostUSD * THB_RATE;
        const totalCostTHB = (item.costUSD || 0) * THB_RATE;
        const costPercent = maxCost > 0 ? ((item.costUSD || 0) / maxCost * 100) : 0;

        html += `
            <tr class="expandable" data-bot-id="${escapeHtml(item.botId || '')}" data-index="${index}">
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <i class="${getPlatformIcon(item.platform)} text-muted"></i>
                        <span class="fw-medium">${escapeHtml(item.name || item.botId || '-')}</span>
                    </div>
                </td>
                <td>
                    <span class="platform-badge ${item.platform || ''}">${capitalize(item.platform || '-')}</span>
                </td>
                <td class="text-end">${formatNumber(item.calls)}</td>
                <td class="text-end">${formatNumber(item.tokens)}</td>
                <td class="text-end">
                    <div class="cost-display">$${formatCost(item.costUSD)} <span class="cost-sub">(฿${totalCostTHB.toFixed(2)})</span></div>
                    <div class="cost-bar"><div class="cost-bar-fill primary" style="width: ${costPercent}%"></div></div>
                </td>
                <td class="text-end">
                    <span class="text-info fw-semibold">$${avgCostUSD.toFixed(4)}</span>
                    <span class="cost-sub">(฿${avgCostTHB.toFixed(2)})</span>
                </td>
                <td class="text-center">
                    <i class="fas fa-chevron-right expand-icon"></i>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;

    // Add click handlers for expandable rows
    tableBody.querySelectorAll('.expandable').forEach(row => {
        row.addEventListener('click', () => toggleRowExpand(row));
    });
}

function renderDetailedTable(tableHeader, tableBody) {
    // Headers for detailed view
    tableHeader.innerHTML = `
        <tr>
            <th class="sortable" data-sort="timestamp">เวลา</th>
            <th class="sortable" data-sort="model">Model</th>
            <th class="sortable" data-sort="bot">Bot</th>
            <th class="sortable" data-sort="platform">Platform</th>
            <th class="sortable text-end" data-sort="input">Input</th>
            <th class="sortable text-end" data-sort="output">Output</th>
            <th class="sortable text-end" data-sort="total">Total</th>
            <th class="sortable text-end" data-sort="cost">Cost</th>
        </tr>
    `;

    // Add sort handlers
    tableHeader.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Load detailed logs
    loadDetailedLogs();
}

async function loadDetailedLogs() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                <span class="ms-2 text-muted">กำลังโหลดบันทึก...</span>
            </td>
        </tr>
    `;

    try {
        const params = getDateParams();
        params.append('limit', 100);

        if (State.filters.platform) params.append('platform', State.filters.platform);
        if (State.filters.bot) params.append('botId', State.filters.bot);

        const response = await fetch('/api/openai-usage?' + params);
        const data = await response.json();

        const logs = data.logs || [];

        // Build bot name map
        const botNameMap = {};
        if (State.data && State.data.byBot) {
            State.data.byBot.forEach(b => {
                if (b.botId) botNameMap[b.botId] = b.name || b.botId;
            });
        }

        // Apply additional filters
        let filtered = logs.filter(log => {
            if (State.filters.model && log.model !== State.filters.model) return false;
            if (State.filters.search) {
                const botName = (botNameMap[log.botId] || log.botId || '').toLowerCase();
                const model = (log.model || '').toLowerCase();
                if (!botName.includes(State.filters.search) && !model.includes(State.filters.search)) {
                    return false;
                }
            }
            return true;
        });

        document.getElementById('resultCount').textContent = formatNumber(filtered.length);

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        <i class="fas fa-inbox d-block"></i>
                        <p class="mb-0">ไม่พบบันทึก</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtered.forEach(log => {
            const botName = botNameMap[log.botId] || log.botId || '-';
            const costTHB = (log.estimatedCostUSD || 0) * THB_RATE;

            html += `
                <tr>
                    <td>${formatDateTime(log.timestamp)}</td>
                    <td><span class="model-badge ${getModelClass(log.model)}">${escapeHtml(log.model || '-')}</span></td>
                    <td>${escapeHtml(botName)}</td>
                    <td><span class="platform-badge ${log.platform || ''}">${capitalize(log.platform || '-')}</span></td>
                    <td class="text-end">${formatNumber(log.promptTokens || 0)}</td>
                    <td class="text-end">${formatNumber(log.completionTokens || 0)}</td>
                    <td class="text-end fw-medium">${formatNumber(log.totalTokens || 0)}</td>
                    <td class="text-end">
                        <span class="cost-display">$${formatCost(log.estimatedCostUSD || 0)}</span>
                        <span class="cost-sub">(฿${costTHB.toFixed(2)})</span>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

    } catch (err) {
        console.error('Error loading detailed logs:', err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-circle me-2"></i>เกิดข้อผิดพลาด
                </td>
            </tr>
        `;
    }
}

// ==================== Row Expansion ====================
async function toggleRowExpand(row) {
    const botId = row.dataset.botId;
    const isExpanded = row.classList.contains('expanded');

    // Remove any existing expanded detail rows
    document.querySelectorAll('.expanded-detail-row').forEach(r => r.remove());
    document.querySelectorAll('.expanded').forEach(r => r.classList.remove('expanded'));

    if (isExpanded) {
        return; // Just close
    }

    row.classList.add('expanded');

    // Create detail row
    const detailRow = document.createElement('tr');
    detailRow.className = 'expanded-detail-row';
    detailRow.innerHTML = `
        <td colspan="7">
            <div class="expanded-row-content">
                <div class="text-center py-3">
                    <div class="spinner-border spinner-border-sm text-primary"></div>
                    <span class="ms-2 text-muted">กำลังโหลดรายละเอียด...</span>
                </div>
            </div>
        </td>
    `;

    row.after(detailRow);

    // Load detail data
    try {
        const params = getDateParams();
        const response = await fetch(`/api/openai-usage/by-bot/${encodeURIComponent(botId)}?${params}`);
        const data = await response.json();

        const totals = data.totals || {};
        const avgCostPerCall = totals.totalCalls > 0 ? (totals.totalCost / totals.totalCalls) : 0;

        let html = `
            <div class="expanded-row-content">
                <div class="detail-grid">
                    <div class="detail-card">
                        <div class="detail-card-title">
                            <i class="fas fa-microchip text-primary"></i>
                            โมเดลที่ใช้
                        </div>
                        <ul class="detail-list">
        `;

        (data.byModel || []).forEach(m => {
            const avgCost = m.count > 0 ? (m.estimatedCost / m.count) : 0;
            html += `
                <li>
                    <span><span class="model-badge ${getModelClass(m.model)}">${escapeHtml(m.model)}</span></span>
                    <span>
                        <strong>${formatNumber(m.count)}</strong> calls • 
                        <span class="text-info">$${avgCost.toFixed(4)}</span>/call
                    </span>
                </li>
            `;
        });

        html += `
                        </ul>
                    </div>
                    <div class="detail-card">
                        <div class="detail-card-title">
                            <i class="fas fa-key text-warning"></i>
                            API Keys
                        </div>
                        <ul class="detail-list">
        `;

        (data.byKey || []).forEach(k => {
            html += `
                <li>
                    <span><i class="fas fa-key text-muted me-1"></i>${escapeHtml(k.keyName)}</span>
                    <span><strong>${formatNumber(k.count)}</strong> calls • $${formatCost(k.estimatedCost)}</span>
                </li>
            `;
        });

        html += `
                        </ul>
                    </div>
                    <div class="detail-card">
                        <div class="detail-card-title">
                            <i class="fas fa-clock text-success"></i>
                            บันทึกล่าสุด
                        </div>
                        <ul class="detail-list">
        `;

        (data.recentLogs || []).slice(0, 5).forEach(l => {
            html += `
                <li>
                    <span>${formatDateTime(l.timestamp)}</span>
                    <span>${formatNumber(l.totalTokens)} tokens • $${formatCost(l.estimatedCost)}</span>
                </li>
            `;
        });

        html += `
                        </ul>
                    </div>
                </div>
            </div>
        `;

        detailRow.querySelector('td').innerHTML = html;

    } catch (err) {
        console.error('Error loading bot details:', err);
        detailRow.querySelector('td').innerHTML = `
            <div class="expanded-row-content">
                <div class="text-center text-danger py-3">
                    <i class="fas fa-exclamation-circle me-2"></i>ไม่สามารถโหลดข้อมูลได้
                </div>
            </div>
        `;
    }
}

// ==================== Sorting ====================
function handleSort(column) {
    if (State.sortColumn === column) {
        State.sortDirection = State.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        State.sortColumn = column;
        State.sortDirection = 'desc';
    }

    // Update header classes
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === column) {
            th.classList.add(State.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    renderTable();
}

function sortData(items) {
    const col = State.sortColumn;
    const dir = State.sortDirection === 'asc' ? 1 : -1;

    return items.sort((a, b) => {
        let valA, valB;

        switch (col) {
            case 'name':
                valA = (a.name || a.botId || '').toLowerCase();
                valB = (b.name || b.botId || '').toLowerCase();
                return valA.localeCompare(valB) * dir;
            case 'platform':
                valA = a.platform || '';
                valB = b.platform || '';
                return valA.localeCompare(valB) * dir;
            case 'calls':
                return ((a.calls || 0) - (b.calls || 0)) * dir;
            case 'tokens':
                return ((a.tokens || 0) - (b.tokens || 0)) * dir;
            case 'cost':
                return ((a.costUSD || 0) - (b.costUSD || 0)) * dir;
            case 'avgCost':
                valA = a.calls > 0 ? a.costUSD / a.calls : 0;
                valB = b.calls > 0 ? b.costUSD / b.calls : 0;
                return (valA - valB) * dir;
            default:
                return 0;
        }
    });
}

// ==================== Export ====================
function exportToCSV() {
    if (!State.data) return;

    let csv = 'Date,Calls,Tokens,Input Tokens,Output Tokens,Cost USD,Cost THB\n';

    const daily = State.data.daily || [];
    daily.forEach(d => {
        const costTHB = (d.cost || 0) * THB_RATE;
        csv += `${d._id || d.date},${d.calls || 0},${d.tokens || 0},${d.inputTokens || 0},${d.outputTokens || 0},${(d.cost || 0).toFixed(4)},${costTHB.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ==================== UI Helpers ====================
function showLoadingState() {
    document.getElementById('tableBody').innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">กำลังโหลด...</span>
                </div>
                <p class="text-muted mt-2 mb-0">กำลังโหลดข้อมูล...</p>
            </td>
        </tr>
    `;
}

function showErrorState() {
    document.getElementById('tableBody').innerHTML = `
        <tr>
            <td colspan="8" class="text-center text-danger py-5">
                <i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                <p class="mb-0">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
            </td>
        </tr>
    `;
}

function closeExpandedPanel() {
    document.getElementById('expandedPanel').style.display = 'none';
}

// ==================== Utilities ====================
function formatNumber(num) {
    return new Intl.NumberFormat('th-TH').format(num || 0);
}

function formatCost(cost) {
    return (cost || 0).toFixed(4);
}

function formatShortDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getPlatformIcon(platform) {
    if (platform === 'line') return 'fab fa-line';
    if (platform === 'facebook') return 'fab fa-facebook-messenger';
    return 'fas fa-robot';
}

function getModelClass(model) {
    if (!model) return '';
    if (model.includes('gpt-4')) return 'gpt-4';
    if (model.includes('gpt-3')) return 'gpt-3';
    return '';
}

function capitalize(str) {
    if (!str || str === '-') return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
