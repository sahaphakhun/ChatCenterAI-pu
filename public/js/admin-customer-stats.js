/* ================================================================
   Admin Customer Stats - Core Logic
   ================================================================ */

(function () {
  'use strict';

  // ============ State ============
  const state = {
    pages: [],
    stats: null,
    filters: {
      pageKey: '',
      startDate: '',
      endDate: '',
      quickDate: 'today'
    },
    chartMode: 'all', // 'all', 'buyers', 'nonBuyers'
    isLoading: false
  };

  // ============ DOM Elements ============
  const els = {};

  // ============ Initialization ============
  function init() {
    cacheElements();
    bindEvents();
    setDefaultDates();
    loadPages();
    loadStats();
  }

  function cacheElements() {
    els.summaryCards = document.getElementById('statsSummaryCards');
    els.pageSelect = document.getElementById('statsPageSelect');
    els.startDate = document.getElementById('statsStartDate');
    els.endDate = document.getElementById('statsEndDate');
    els.refreshBtn = document.getElementById('statsRefreshBtn');
    els.hourlyChart = document.getElementById('statsHourlyChart');
    els.salesSection = document.getElementById('statsSalesSection');
    els.conversionSection = document.getElementById('statsConversionSection');
    els.followUpSection = document.getElementById('statsFollowUpSection');
    els.paymentSection = document.getElementById('statsPaymentSection');
    els.topProducts = document.getElementById('statsTopProducts');
    els.topCustomers = document.getElementById('statsTopCustomers');
  }

  function bindEvents() {
    els.pageSelect?.addEventListener('change', handlePageChange);
    els.startDate?.addEventListener('change', handleDateChange);
    els.endDate?.addEventListener('change', handleDateChange);
    els.refreshBtn?.addEventListener('click', () => loadStats());

    // Quick date buttons
    document.querySelectorAll('.stats-quick-date-btn').forEach(btn => {
      btn.addEventListener('click', () => handleQuickDate(btn.dataset.range));
    });

    // Chart mode buttons
    document.querySelectorAll('.stats-chart-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => handleChartModeChange(btn.dataset.mode));
    });
  }

  function setDefaultDates() {
    const today = new Date();
    const todayStr = formatDateForInput(today);
    state.filters.startDate = todayStr;
    state.filters.endDate = todayStr;
    els.startDate.value = todayStr;
    els.endDate.value = todayStr;
  }

  // ============ Event Handlers ============
  function handlePageChange(e) {
    state.filters.pageKey = e.target.value;
    loadStats();
  }

  function handleDateChange() {
    state.filters.startDate = els.startDate.value;
    state.filters.endDate = els.endDate.value;
    state.filters.quickDate = '';
    updateQuickDateButtons();
    loadStats();
  }

  function handleQuickDate(range) {
    state.filters.quickDate = range;
    const today = new Date();
    let startDate = new Date();

    if (range === 'today') {
      startDate = today;
    } else if (range === '7days') {
      startDate.setDate(today.getDate() - 6);
    } else if (range === '30days') {
      startDate.setDate(today.getDate() - 29);
    }

    state.filters.startDate = formatDateForInput(startDate);
    state.filters.endDate = formatDateForInput(today);
    els.startDate.value = state.filters.startDate;
    els.endDate.value = state.filters.endDate;
    updateQuickDateButtons();
    loadStats();
  }

  function updateQuickDateButtons() {
    document.querySelectorAll('.stats-quick-date-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === state.filters.quickDate);
    });
  }

  function handleChartModeChange(mode) {
    if (state.chartMode === mode) return;
    state.chartMode = mode;
    document.querySelectorAll('.stats-chart-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    renderHourlyChart();
  }

  // ============ Data Loading ============
  async function loadPages() {
    try {
      const res = await fetch('/admin/orders/pages');
      const data = await res.json();
      if (data.success && data.pages) {
        state.pages = data.pages;
        renderPageSelect();
      }
    } catch (e) {
      console.error('Load pages error:', e);
    }
  }

  async function loadStats() {
    if (state.isLoading) return;
    state.isLoading = true;
    showLoading();

    try {
      const params = new URLSearchParams();
      if (state.filters.pageKey) params.set('pageKey', state.filters.pageKey);
      if (state.filters.startDate) params.set('startDate', state.filters.startDate);
      if (state.filters.endDate) params.set('endDate', state.filters.endDate);

      const res = await fetch(`/admin/customer-stats/data?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        state.stats = data.data;
        renderAll();
      } else {
        showError('ไม่สามารถโหลดข้อมูลได้');
      }
    } catch (e) {
      console.error('Load stats error:', e);
      showError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      state.isLoading = false;
    }
  }

  // ============ Rendering ============
  function renderAll() {
    renderSummaryCards();
    renderHourlyChart();
    renderSalesStats();
    renderConversionStats();
    renderFollowUpStats();
    renderPaymentMethods();
    renderTopProducts();
    renderTopCustomers();
  }

  function renderPageSelect() {
    if (!els.pageSelect) return;
    els.pageSelect.innerHTML = '<option value="">ทุกเพจ/บอท</option>' +
      state.pages.map(page => {
        const icon = page.platform === 'facebook' ? '📘' : '💚';
        const label = page.name || page.pageKey || 'Unknown';
        return `<option value="${escapeHtml(page.pageKey)}">${icon} ${escapeHtml(label)}</option>`;
      }).join('');
  }

  function renderSummaryCards() {
    if (!els.summaryCards || !state.stats) return;
    const { overview, sales } = state.stats;

    els.summaryCards.innerHTML = `
      <div class="stats-summary-card">
        <div class="stats-summary-icon icon-primary">
          <i class="fas fa-comments"></i>
        </div>
        <div class="stats-summary-content">
          <div class="stats-summary-value">${formatNumber(overview?.totalActiveUsers || 0)}</div>
          <div class="stats-summary-label">คนทักมาทั้งหมด</div>
        </div>
      </div>
      <div class="stats-summary-card">
        <div class="stats-summary-icon icon-success">
          <i class="fas fa-user-plus"></i>
        </div>
        <div class="stats-summary-content">
          <div class="stats-summary-value">${formatNumber(overview?.newUsers || 0)}</div>
          <div class="stats-summary-label">คนทักมาใหม่</div>
        </div>
      </div>
      <div class="stats-summary-card">
        <div class="stats-summary-icon icon-warning">
          <i class="fas fa-shopping-bag"></i>
        </div>
        <div class="stats-summary-content">
          <div class="stats-summary-value">${formatNumber(sales?.totalOrders || 0)}</div>
          <div class="stats-summary-label">ออเดอร์ทั้งหมด</div>
        </div>
      </div>
      <div class="stats-summary-card">
        <div class="stats-summary-icon icon-info">
          <i class="fas fa-baht-sign"></i>
        </div>
        <div class="stats-summary-content">
          <div class="stats-summary-value">฿${formatNumber(sales?.totalSales || 0)}</div>
          <div class="stats-summary-label">ยอดขายรวม</div>
        </div>
      </div>
    `;
  }

  function renderHourlyChart() {
    if (!els.hourlyChart || !state.stats) return;

    // Support both old (array) and new (object) format
    const hourlyMessagesData = state.stats.hourlyMessages || {};
    let hourlyData;
    if (Array.isArray(hourlyMessagesData)) {
      // Old format - single array
      hourlyData = hourlyMessagesData;
    } else {
      // New format - object with all, buyers, nonBuyers
      hourlyData = hourlyMessagesData[state.chartMode] || hourlyMessagesData.all || Array(24).fill(0);
    }

    const maxValue = Math.max(...hourlyData, 1);
    const peakHour = hourlyData.indexOf(maxValue);

    // Determine bar color based on mode
    const modeColors = {
      all: '',
      buyers: ' is-buyers',
      nonBuyers: ' is-non-buyers'
    };
    const modeClass = modeColors[state.chartMode] || '';

    let html = '';
    for (let i = 0; i < 24; i++) {
      const value = hourlyData[i] || 0;
      const height = Math.max((value / maxValue) * 100, 2);
      const isPeak = i === peakHour && value > 0;
      const label = i.toString().padStart(2, '0');

      html += `
        <div class="chart-bar-wrapper">
          <div class="chart-bar">
            <div class="chart-bar-fill${isPeak ? ' is-peak' : ''}${modeClass}" style="height: ${height}%">
              <div class="chart-bar-tooltip">${label}:00 - ${formatNumber(value)} คน</div>
            </div>
          </div>
          <div class="chart-bar-label">${label}</div>
        </div>
      `;
    }
    els.hourlyChart.innerHTML = html;
  }

  function renderSalesStats() {
    if (!els.salesSection || !state.stats) return;
    const { sales } = state.stats;

    els.salesSection.innerHTML = `
      <div class="stats-item-grid">
        <div class="stats-item">
          <div class="stats-item-value text-success">${formatNumber(sales?.uniqueBuyers || 0)}</div>
          <div class="stats-item-label">คนซื้อ (unique)</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value">${formatNumber(sales?.totalOrders || 0)}</div>
          <div class="stats-item-label">ออเดอร์ทั้งหมด</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value text-warning">
            <span class="stats-status-dot pending"></span>${formatNumber(sales?.pendingOrders || 0)}
          </div>
          <div class="stats-item-label">รอดำเนินการ</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value text-primary">
            <span class="stats-status-dot confirmed"></span>${formatNumber(sales?.confirmedOrders || 0)}
          </div>
          <div class="stats-item-label">ยืนยันแล้ว</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value text-info">
            <span class="stats-status-dot shipped"></span>${formatNumber(sales?.shippedOrders || 0)}
          </div>
          <div class="stats-item-label">จัดส่งแล้ว</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value text-success">
            <span class="stats-status-dot completed"></span>${formatNumber(sales?.completedOrders || 0)}
          </div>
          <div class="stats-item-label">เสร็จสิ้น</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value text-danger">
            <span class="stats-status-dot cancelled"></span>${formatNumber(sales?.cancelledOrders || 0)}
          </div>
          <div class="stats-item-label">ยกเลิก</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value">฿${formatNumber(sales?.totalShipping || 0)}</div>
          <div class="stats-item-label">ค่าส่งรวม</div>
        </div>
      </div>
    `;
  }

  function renderConversionStats() {
    if (!els.conversionSection || !state.stats) return;
    const { conversion } = state.stats;

    const conversionRate = conversion?.conversionRate || 0;
    const confirmRate = conversion?.orderConfirmationRate || 0;
    const completionRate = conversion?.orderCompletionRate || 0;

    els.conversionSection.innerHTML = `
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">Conversion Rate (คนซื้อ/คนทัก)</span>
          <span class="stats-progress-value">${conversionRate.toFixed(1)}%</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill success" style="width: ${Math.min(conversionRate, 100)}%"></div>
        </div>
      </div>
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">Order Confirmation Rate</span>
          <span class="stats-progress-value">${confirmRate.toFixed(1)}%</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill primary" style="width: ${Math.min(confirmRate, 100)}%"></div>
        </div>
      </div>
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">Order Completion Rate</span>
          <span class="stats-progress-value">${completionRate.toFixed(1)}%</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill info" style="width: ${Math.min(completionRate, 100)}%"></div>
        </div>
      </div>
      <div class="stats-item-grid" style="margin-top: 1rem;">
        <div class="stats-item">
          <div class="stats-item-value">฿${formatNumber(conversion?.avgOrderValue || 0)}</div>
          <div class="stats-item-label">มูลค่าเฉลี่ย/ออเดอร์</div>
        </div>
        <div class="stats-item">
          <div class="stats-item-value">฿${formatNumber(conversion?.avgCustomerValue || 0)}</div>
          <div class="stats-item-label">มูลค่าเฉลี่ย/ลูกค้า</div>
        </div>
      </div>
    `;
  }

  function renderFollowUpStats() {
    if (!els.followUpSection || !state.stats) return;
    const { followUp } = state.stats;
    const total = (followUp?.active || 0) + (followUp?.completed || 0) +
      (followUp?.canceled || 0) + (followUp?.failed || 0);

    if (total === 0) {
      els.followUpSection.innerHTML = `
        <div class="stats-empty">
          <i class="fas fa-user-clock"></i>
          <p>ไม่มีข้อมูลการติดตาม</p>
        </div>
      `;
      return;
    }

    const activeRate = total > 0 ? ((followUp?.active || 0) / total * 100) : 0;
    const completedRate = total > 0 ? ((followUp?.completed || 0) / total * 100) : 0;
    const canceledRate = total > 0 ? ((followUp?.canceled || 0) / total * 100) : 0;
    const failedRate = total > 0 ? ((followUp?.failed || 0) / total * 100) : 0;

    els.followUpSection.innerHTML = `
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">กำลังติดตาม</span>
          <span class="stats-progress-value">${followUp?.active || 0} (${activeRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill primary" style="width: ${activeRate}%"></div>
        </div>
      </div>
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">สำเร็จ</span>
          <span class="stats-progress-value">${followUp?.completed || 0} (${completedRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill success" style="width: ${completedRate}%"></div>
        </div>
      </div>
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">ยกเลิก</span>
          <span class="stats-progress-value">${followUp?.canceled || 0} (${canceledRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill warning" style="width: ${canceledRate}%"></div>
        </div>
      </div>
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">ล้มเหลว</span>
          <span class="stats-progress-value">${followUp?.failed || 0} (${failedRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill danger" style="width: ${failedRate}%"></div>
        </div>
      </div>
    `;
  }

  function renderPaymentMethods() {
    if (!els.paymentSection || !state.stats) return;
    const { paymentMethods } = state.stats;
    const cod = paymentMethods?.cod || 0;
    const transfer = paymentMethods?.transfer || 0;
    const other = paymentMethods?.other || 0;
    const total = cod + transfer + other;

    if (total === 0) {
      els.paymentSection.innerHTML = `
        <div class="stats-empty">
          <i class="fas fa-credit-card"></i>
          <p>ไม่มีข้อมูลการชำระเงิน</p>
        </div>
      `;
      return;
    }

    const codRate = (cod / total * 100);
    const transferRate = (transfer / total * 100);
    const otherRate = (other / total * 100);

    els.paymentSection.innerHTML = `
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">เก็บเงินปลายทาง (COD)</span>
          <span class="stats-progress-value">${cod} (${codRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill warning" style="width: ${codRate}%"></div>
        </div>
      </div>
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">โอนเงิน</span>
          <span class="stats-progress-value">${transfer} (${transferRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill success" style="width: ${transferRate}%"></div>
        </div>
      </div>
      ${other > 0 ? `
      <div class="stats-progress-item">
        <div class="stats-progress-header">
          <span class="stats-progress-label">อื่นๆ</span>
          <span class="stats-progress-value">${other} (${otherRate.toFixed(1)}%)</span>
        </div>
        <div class="stats-progress-bar">
          <div class="stats-progress-fill info" style="width: ${otherRate}%"></div>
        </div>
      </div>
      ` : ''}
    `;
  }

  function renderTopProducts() {
    if (!els.topProducts || !state.stats) return;
    const products = state.stats.topProducts || [];

    if (products.length === 0) {
      els.topProducts.innerHTML = `
        <div class="stats-empty">
          <i class="fas fa-star"></i>
          <p>ไม่มีข้อมูลสินค้า</p>
        </div>
      `;
      return;
    }

    els.topProducts.innerHTML = `
      <div class="stats-ranking-list">
        ${products.map((p, i) => `
          <div class="stats-ranking-item">
            <div class="stats-ranking-rank rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
            <div class="stats-ranking-info">
              <div class="stats-ranking-name">${escapeHtml(p.name || 'ไม่ระบุชื่อ')}</div>
              <div class="stats-ranking-sub">ขายได้ ${formatNumber(p.quantity || 0)} ชิ้น</div>
            </div>
            <div class="stats-ranking-value">฿${formatNumber(p.revenue || 0)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTopCustomers() {
    if (!els.topCustomers || !state.stats) return;
    const customers = state.stats.topCustomers || [];

    if (customers.length === 0) {
      els.topCustomers.innerHTML = `
        <div class="stats-empty">
          <i class="fas fa-crown"></i>
          <p>ไม่มีข้อมูลลูกค้า</p>
        </div>
      `;
      return;
    }

    els.topCustomers.innerHTML = `
      <div class="stats-ranking-list">
        ${customers.map((c, i) => `
          <div class="stats-ranking-item">
            <div class="stats-ranking-rank rank-${i < 3 ? i + 1 : 'other'}">${i + 1}</div>
            <div class="stats-ranking-info">
              <div class="stats-ranking-name">${escapeHtml(c.name || c.userId?.substring(0, 12) || 'ไม่ระบุ')}</div>
              <div class="stats-ranking-sub">${formatNumber(c.orderCount || 0)} ออเดอร์</div>
            </div>
            <div class="stats-ranking-value">฿${formatNumber(c.totalSpent || 0)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ============ UI Helpers ============
  function showLoading() {
    const sections = [els.salesSection, els.conversionSection, els.followUpSection,
    els.paymentSection, els.topProducts, els.topCustomers];
    sections.forEach(el => {
      if (el) el.innerHTML = '<div class="stats-loading"><div class="stats-spinner"></div></div>';
    });
  }

  function showError(message) {
    const sections = [els.salesSection, els.conversionSection, els.followUpSection,
    els.paymentSection, els.topProducts, els.topCustomers];
    sections.forEach(el => {
      if (el) el.innerHTML = `<div class="stats-empty"><i class="fas fa-exclamation-triangle"></i><p>${escapeHtml(message)}</p></div>`;
    });
  }

  // ============ Utilities ============
  function formatNumber(num) {
    if (typeof num !== 'number') num = parseFloat(num) || 0;
    return num.toLocaleString('th-TH');
  }

  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============ Init on DOM Ready ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.CustomerStats = { state, loadStats };
})();
