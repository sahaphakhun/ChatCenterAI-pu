/* ================================================================
   Admin Orders v2 - Core Logic
   ================================================================ */

(function () {
  'use strict';

  // ============ State ============
  const state = {
    orders: [],
    filteredOrders: [],
    selectedIds: new Set(),
    pagination: { page: 1, limit: 50, total: 0, pages: 1 },
    summary: { totalOrders: 0, totalAmount: 0, totalShipping: 0 },
    statusCounts: {},
    filters: {
      status: 'all',
      search: '',
      pageKey: '',
      startDate: '',
      endDate: '',
      quickDate: ''
    },
    sort: { column: 'extractedAt', direction: 'desc' },
    pages: [],
    loading: false,
    detailOrderId: null
  };

  // ============ Status Config ============
  const STATUS_CONFIG = {
    all: { label: 'ทั้งหมด', icon: 'fa-list' },
    pending: { label: 'รอดำเนินการ', color: '#DFA94B', icon: 'fa-clock' },
    confirmed: { label: 'ยืนยันแล้ว', color: '#4A6FA5', icon: 'fa-check-circle' },
    shipped: { label: 'จัดส่งแล้ว', color: '#3D7FC1', icon: 'fa-truck' },
    completed: { label: 'เสร็จสิ้น', color: '#2D8F6F', icon: 'fa-check-double' },
    cancelled: { label: 'ยกเลิก', color: '#D2555A', icon: 'fa-times-circle' }
  };

  // ============ DOM Elements ============
  const els = {};

  // ============ Init ============
  function init() {
    cacheElements();
    bindEvents();
    restoreFilters();
    loadPages();
    loadOrders();
  }

  function cacheElements() {
    els.summaryCards = document.getElementById('ordersSummaryCards');
    els.statusPills = document.getElementById('ordersStatusPills');
    els.tableBody = document.getElementById('ordersTableBody');
    els.pagination = document.getElementById('ordersPagination');
    els.paginationInfo = document.getElementById('ordersPaginationInfo');
    els.searchInput = document.getElementById('ordersSearchInput');
    els.pageSelect = document.getElementById('ordersPageSelect');
    els.startDate = document.getElementById('ordersStartDate');
    els.endDate = document.getElementById('ordersEndDate');
    els.bulkBar = document.getElementById('ordersBulkBar');
    els.bulkCount = document.getElementById('ordersBulkCount');
    els.selectAll = document.getElementById('ordersSelectAll');
    els.detailOverlay = document.getElementById('ordersDetailOverlay');
    els.detailPanel = document.getElementById('ordersDetailPanel');
    els.exportBtn = document.getElementById('ordersExportBtn');
    els.detailPrint = document.getElementById('ordersDetailPrint');
  }

  function bindEvents() {
    // Sort headers
    document.querySelectorAll('.orders-table th.sortable').forEach(th => {
      th.addEventListener('click', () => handleSortClick(th.dataset.sort));
    });

    // Search
    if (els.searchInput) {
      els.searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Page Select
    if (els.pageSelect) {
      els.pageSelect.addEventListener('change', handlePageSelect);
    }

    // Date Range
    if (els.startDate) els.startDate.addEventListener('change', handleDateChange);
    if (els.endDate) els.endDate.addEventListener('change', handleDateChange);

    // Quick Date Buttons
    document.querySelectorAll('.orders-quick-date-btn').forEach(btn => {
      btn.addEventListener('click', handleQuickDate);
    });

    // Select All
    if (els.selectAll) {
      els.selectAll.addEventListener('change', handleSelectAll);
    }

    // Bulk Actions
    document.getElementById('ordersBulkCancel')?.addEventListener('click', clearSelection);
    document.getElementById('ordersBulkExport')?.addEventListener('click', handleBulkExport);

    // Detail Panel Close
    els.detailOverlay?.addEventListener('click', (e) => {
      if (e.target === els.detailOverlay) closeDetail();
    });
    document.getElementById('ordersDetailClose')?.addEventListener('click', closeDetail);

    // Export
    if (els.exportBtn) {
      els.exportBtn.addEventListener('click', handleExport);
    }

    if (els.detailPrint) {
      els.detailPrint.addEventListener('click', handleDetailPrint);
    }

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.detailOrderId) {
        closeDetail();
      }
    });
  }

  // ============ Data Loading ============
  async function loadOrders() {
    if (state.loading) return;
    state.loading = true;
    showLoading();

    try {
      const params = buildQueryParams();
      const response = await fetch(`/admin/orders/data?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        state.orders = data.orders || [];
        state.pagination = data.pagination || state.pagination;
        state.summary = data.summary || state.summary;
        state.statusCounts = data.statusCounts || {};

        renderSummary();
        renderStatusPills();
        renderTable();
        renderPagination();
      }
    } catch (error) {
      console.error('[Orders] Load error:', error);
      showError('ไม่สามารถโหลดข้อมูลออเดอร์ได้');
    } finally {
      state.loading = false;
    }
  }

  async function loadPages() {
    try {
      const response = await fetch('/admin/orders/pages');
      const data = await response.json();

      if (data.success && data.pages) {
        state.pages = data.pages;
        renderPageSelect();
      }
    } catch (error) {
      console.error('[Orders] Load pages error:', error);
    }
  }

  function buildQueryParams() {
    const params = new URLSearchParams();
    params.set('page', state.pagination.page);
    params.set('limit', state.pagination.limit);
    if (state.sort?.column) {
      params.set('sortBy', state.sort.column);
      params.set('sortDir', state.sort.direction);
    }

    if (state.filters.status && state.filters.status !== 'all') {
      params.set('status', state.filters.status);
    }
    if (state.filters.search) {
      params.set('search', state.filters.search);
    }
    if (state.filters.pageKey) {
      params.set('pageKey', state.filters.pageKey);
    }
    if (state.filters.startDate) {
      params.set('startDate', state.filters.startDate);
    }
    if (state.filters.endDate) {
      params.set('endDate', state.filters.endDate);
    }

    return params;
  }

  // ============ Render Functions ============
  function renderSummary() {
    if (!els.summaryCards) return;

    const { totalOrders, totalAmount, totalShipping } = state.summary;
    const avgOrder = totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0;
    const completedCount = state.statusCounts.completed || 0;
    const completionRate = totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;

    els.summaryCards.innerHTML = `
      <div class="orders-summary-card">
        <div class="orders-summary-icon icon-primary"><i class="fas fa-shopping-bag"></i></div>
        <div class="orders-summary-content">
          <div class="orders-summary-label">ออเดอร์ทั้งหมด</div>
          <div class="orders-summary-value">${totalOrders.toLocaleString()}</div>
        </div>
      </div>
      <div class="orders-summary-card">
        <div class="orders-summary-icon icon-success"><i class="fas fa-coins"></i></div>
        <div class="orders-summary-content">
          <div class="orders-summary-label">ยอดรวม</div>
          <div class="orders-summary-value">฿${totalAmount.toLocaleString()}</div>
        </div>
      </div>
      <div class="orders-summary-card">
        <div class="orders-summary-icon icon-info"><i class="fas fa-truck"></i></div>
        <div class="orders-summary-content">
          <div class="orders-summary-label">ค่าส่งรวม</div>
          <div class="orders-summary-value">฿${totalShipping.toLocaleString()}</div>
        </div>
      </div>
      <div class="orders-summary-card">
        <div class="orders-summary-icon icon-warning"><i class="fas fa-chart-line"></i></div>
        <div class="orders-summary-content">
          <div class="orders-summary-label">เฉลี่ยต่อออเดอร์</div>
          <div class="orders-summary-value">฿${avgOrder.toLocaleString()}</div>
        </div>
      </div>
      <div class="orders-summary-card">
        <div class="orders-summary-icon icon-success"><i class="fas fa-percentage"></i></div>
        <div class="orders-summary-content">
          <div class="orders-summary-label">สำเร็จแล้ว</div>
          <div class="orders-summary-value">${completionRate}%</div>
        </div>
      </div>
    `;
  }

  function renderStatusPills() {
    if (!els.statusPills) return;

    const statuses = ['all', 'pending', 'confirmed', 'shipped', 'completed', 'cancelled'];
    const total = Object.values(state.statusCounts).reduce((a, b) => a + b, 0);

    els.statusPills.innerHTML = statuses.map(status => {
      const config = STATUS_CONFIG[status];
      const count = status === 'all' ? total : (state.statusCounts[status] || 0);
      const isActive = state.filters.status === status;

      return `
        <button class="orders-status-pill ${isActive ? 'active' : ''}" 
                data-status="${status}" 
                onclick="window.OrdersV2.setStatus('${status}')">
          <span class="pill-label">
            <span class="pill-dot"></span>
            ${config.label}
          </span>
          <span class="pill-count">${count}</span>
        </button>
      `;
    }).join('');
  }

  function renderTable() {
    if (!els.tableBody) return;

    if (state.orders.length === 0) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="orders-empty-state">
              <div class="orders-empty-icon"><i class="fas fa-inbox"></i></div>
              <div class="orders-empty-title">ไม่พบออเดอร์</div>
              <div class="orders-empty-text">ลองเปลี่ยนตัวกรองหรือค้นหาใหม่</div>
            </div>
          </td>
        </tr>
      `;
      updateSortIndicators();
      return;
    }

    els.tableBody.innerHTML = state.orders.map(order => {
      const isSelected = state.selectedIds.has(order.id);
      const date = order.extractedAt ? formatDate(order.extractedAt) : '-';
      const items = order.items || [];
      const itemsPreview = items.slice(0, 2).map(i => i.product || i.shippingName || 'สินค้า').join(', ');
      const itemsMore = items.length > 2 ? ` +${items.length - 2}` : '';
      const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-order-id="${order.id}">
          <td>
            <input type="checkbox" class="orders-checkbox" 
                   ${isSelected ? 'checked' : ''} 
                   onchange="window.OrdersV2.toggleSelect('${order.id}')">
          </td>
          <td>
            ${order.orderCode ? `<div class="orders-order-code" style="font-family:monospace;font-size:0.75rem;color:#666;margin-bottom:2px">${escapeHtml(order.orderCode)}</div>` : ''}
            ${date}
          </td>
	          <td>
	            <div class="orders-customer-info">
	              <div class="orders-customer-name">${escapeHtml(order.recipientName || order.customerName || order.displayName || '-')}</div>
	              <div class="orders-customer-phone">${escapeHtml(order.phone || '-')}</div>
	            </div>
	          </td>
          <td>
            <div class="orders-items-preview">
              <div class="orders-items-text">${escapeHtml(itemsPreview)}${itemsMore}</div>
              <div class="orders-items-count">${items.length} รายการ</div>
            </div>
          </td>
          <td>
            <div class="orders-amount">฿${(order.totalAmount || 0).toLocaleString()}</div>
          </td>
          <td>
            <span class="orders-status-badge status-${order.status}">${statusConfig.label}</span>
            ${order.trackingNumber ? `<span title="${escapeHtml(order.trackingNumber)}" style="margin-left:4px;font-size:0.7rem;color:#2D8F6F;"><i class="fas fa-truck"></i></span>` : ''}
          </td>
          <td>
            <div class="orders-actions">
              <button class="orders-action-btn" title="ดูรายละเอียด" onclick="window.OrdersV2.openDetail('${order.id}')">
                <i class="fas fa-eye"></i>
              </button>
              <button class="orders-action-btn btn-print" title="พิมพ์ใบปะหน้า" onclick="window.OrdersV2.printLabel('${order.id}')">
                <i class="fas fa-print"></i>
              </button>
              <button class="orders-action-btn btn-chat" title="ไปยังแชท" onclick="window.OrdersV2.goToChat('${order.userId}')">
                <i class="fas fa-comment"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    updateSelectAllState();
    updateSortIndicators();
  }

  function renderPagination() {
    if (!els.pagination) return;

    const { page, pages, total } = state.pagination;
    const start = (page - 1) * state.pagination.limit + 1;
    const end = Math.min(page * state.pagination.limit, total);

    if (els.paginationInfo) {
      els.paginationInfo.textContent = `แสดง ${start}-${end} จาก ${total} รายการ`;
    }

    let paginationHtml = '';

    // Previous
    paginationHtml += `
      <button class="orders-page-btn" ${page <= 1 ? 'disabled' : ''} onclick="window.OrdersV2.goToPage(${page - 1})">
        <i class="fas fa-chevron-left"></i>
      </button>
    `;

    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
    let endPage = Math.min(pages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      paginationHtml += `<button class="orders-page-btn" onclick="window.OrdersV2.goToPage(1)">1</button>`;
      if (startPage > 2) paginationHtml += `<span class="orders-page-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      paginationHtml += `
        <button class="orders-page-btn ${i === page ? 'active' : ''}" onclick="window.OrdersV2.goToPage(${i})">${i}</button>
      `;
    }

    if (endPage < pages) {
      if (endPage < pages - 1) paginationHtml += `<span class="orders-page-ellipsis">...</span>`;
      paginationHtml += `<button class="orders-page-btn" onclick="window.OrdersV2.goToPage(${pages})">${pages}</button>`;
    }

    // Next
    paginationHtml += `
      <button class="orders-page-btn" ${page >= pages ? 'disabled' : ''} onclick="window.OrdersV2.goToPage(${page + 1})">
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    els.pagination.querySelector('.orders-pagination-controls').innerHTML = paginationHtml;
  }

  function renderPageSelect() {
    if (!els.pageSelect) return;

    let options = '<option value="">ทุกเพจ/บอท</option>';
    state.pages.forEach(page => {
      const label = page.name || page.pageKey || 'Unknown';
      options += `<option value="${page.pageKey}">${escapeHtml(label)}</option>`;
    });

    els.pageSelect.innerHTML = options;
    if (state.filters.pageKey) {
      els.pageSelect.value = state.filters.pageKey;
    }
  }

  // ============ Event Handlers ============
  function handleSearch(e) {
    state.filters.search = e.target.value.trim();
    state.pagination.page = 1;
    saveFilters();
    loadOrders();
  }

  function handlePageSelect(e) {
    state.filters.pageKey = e.target.value;
    state.pagination.page = 1;
    saveFilters();
    loadOrders();
  }

  function handleDateChange() {
    state.filters.startDate = els.startDate?.value || '';
    state.filters.endDate = els.endDate?.value || '';
    state.filters.quickDate = '';
    document.querySelectorAll('.orders-quick-date-btn').forEach(btn => btn.classList.remove('active'));
    state.pagination.page = 1;
    saveFilters();
    loadOrders();
  }

  function handleQuickDate(e) {
    const btn = e.currentTarget;
    const range = btn.dataset.range;

    document.querySelectorAll('.orders-quick-date-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const today = new Date();
    let startDate = '';
    let endDate = formatDateInput(today);

    if (range === 'today') {
      startDate = endDate;
    } else if (range === '7days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      startDate = formatDateInput(d);
    } else if (range === '30days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      startDate = formatDateInput(d);
    }

    state.filters.startDate = startDate;
    state.filters.endDate = endDate;
    state.filters.quickDate = range;

    if (els.startDate) els.startDate.value = startDate;
    if (els.endDate) els.endDate.value = endDate;

    state.pagination.page = 1;
    saveFilters();
    loadOrders();
  }

  function handleSelectAll(e) {
    const checked = e.target.checked;
    if (checked) {
      state.orders.forEach(order => state.selectedIds.add(order.id));
    } else {
      state.selectedIds.clear();
    }
    renderTable();
    updateBulkBar();
  }

  function handleBulkExport() {
    const ids = Array.from(state.selectedIds);
    if (ids.length === 0) return;

    // Backend expects selectedIds as comma-separated string
    const params = new URLSearchParams();
    params.set('selectedIds', ids.join(','));
    window.location.href = `/admin/orders/export?${params.toString()}`;
  }

  function handleExport() {
    // If there are selected orders, export only those
    if (state.selectedIds.size > 0) {
      const ids = Array.from(state.selectedIds);
      // Backend expects selectedIds as comma-separated string
      const params = new URLSearchParams();
      params.set('selectedIds', ids.join(','));
      window.location.href = `/admin/orders/export?${params.toString()}`;
    } else {
      // Export all orders matching current filters
      const params = buildQueryParams();
      window.location.href = `/admin/orders/export?${params.toString()}`;
    }
  }

  function handleSortClick(column) {
    if (!column) return;
    if (state.sort.column === column) {
      state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.column = column;
      state.sort.direction = 'asc';
    }
    state.pagination.page = 1;
    updateSortIndicators();
    loadOrders();
  }

  function updateSortIndicators() {
    document.querySelectorAll('.orders-table th.sortable').forEach(th => {
      const column = th.dataset.sort;
      const icon = th.querySelector('.sort-icon');
      if (column === state.sort.column) {
        th.classList.add('sorted');
        if (icon) {
          icon.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
          icon.classList.add(state.sort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
        }
      } else {
        th.classList.remove('sorted');
        if (icon) {
          icon.classList.remove('fa-sort-up', 'fa-sort-down');
          icon.classList.add('fa-sort');
        }
      }
    });
  }

  function handleDetailPrint() {
    if (!state.detailOrderId) {
      showToast('กรุณาเลือกออเดอร์ก่อนพิมพ์', 'warning');
      return;
    }
    printLabel(state.detailOrderId);
  }

  // ============ Selection ============
  function toggleSelect(orderId) {
    if (state.selectedIds.has(orderId)) {
      state.selectedIds.delete(orderId);
    } else {
      state.selectedIds.add(orderId);
    }
    renderTable();
    updateBulkBar();
  }

  function clearSelection() {
    state.selectedIds.clear();
    if (els.selectAll) els.selectAll.checked = false;
    renderTable();
    updateBulkBar();
  }

  function updateSelectAllState() {
    if (!els.selectAll) return;
    const allSelected = state.orders.length > 0 && state.orders.every(o => state.selectedIds.has(o.id));
    const someSelected = state.orders.some(o => state.selectedIds.has(o.id));
    els.selectAll.checked = allSelected;
    els.selectAll.indeterminate = someSelected && !allSelected;
  }

  function updateBulkBar() {
    if (!els.bulkBar) return;
    const count = state.selectedIds.size;
    if (count > 0) {
      els.bulkBar.classList.add('visible');
      if (els.bulkCount) els.bulkCount.textContent = `เลือก ${count} รายการ`;
    } else {
      els.bulkBar.classList.remove('visible');
    }
  }

  // ============ Status ============
  function setStatus(status) {
    state.filters.status = status;
    state.pagination.page = 1;
    saveFilters();
    loadOrders();
  }

  async function updateStatus(orderId, newStatus) {
    try {
      const response = await fetch(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (data.success) {
        showToast('อัปเดตสถานะเรียบร้อย', 'success');
        loadOrders();
      } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (error) {
      console.error('[Orders] Update status error:', error);
      showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
    }
  }

  async function bulkUpdateStatus(newStatus) {
    const ids = Array.from(state.selectedIds);
    if (ids.length === 0) return;

    try {
      const response = await fetch('/admin/orders/bulk/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids, status: newStatus })
      });

      const data = await response.json();
      if (data.success) {
        showToast(`อัปเดต ${data.modifiedCount} ออเดอร์เรียบร้อย`, 'success');
        clearSelection();
        loadOrders();
      } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (error) {
      console.error('[Orders] Bulk update error:', error);
      showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
    }
  }

  // ============ Detail Panel ============
  function openDetail(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    state.detailOrderId = orderId;
    renderDetailPanel(order);
    loadCarriersForDropdown(order.trackingCarrier);

    if (els.detailOverlay) {
      els.detailOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDetail() {
    state.detailOrderId = null;
    if (els.detailOverlay) {
      els.detailOverlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  function renderDetailPanel(order) {
    const body = document.getElementById('ordersDetailBody');
    if (!body) return;

    const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
    const items = order.items || [];
    const date = order.extractedAt ? formatDate(order.extractedAt, true) : '-';

    body.innerHTML = `
      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-user"></i> ข้อมูลลูกค้า</div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">ชื่อผู้รับ</div>
          <div class="orders-detail-value">${escapeHtml(order.recipientName || order.customerName || '-')}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">โทรศัพท์</div>
          <div class="orders-detail-value">${escapeHtml(order.phone || '-')}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">อีเมล</div>
          <div class="orders-detail-value">${escapeHtml(order.email || '-')}</div>
        </div>
      </div>

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-map-marker-alt"></i> ที่อยู่จัดส่ง</div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">ที่อยู่</div>
          <div class="orders-detail-value">${escapeHtml(order.shippingAddress) || '-'}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">ตำบล/แขวง</div>
          <div class="orders-detail-value">${escapeHtml(order.addressSubDistrict) || '-'}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">อำเภอ/เขต</div>
          <div class="orders-detail-value">${escapeHtml(order.addressDistrict) || '-'}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">จังหวัด</div>
          <div class="orders-detail-value">${escapeHtml(order.addressProvince) || '-'}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">รหัสไปรษณีย์</div>
          <div class="orders-detail-value">${escapeHtml(order.addressPostalCode || '-')}</div>
        </div>
      </div>

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-box"></i> รายการสินค้า</div>
        ${items.map(item => `
          <div class="orders-detail-row">
            <div class="orders-detail-value" style="flex:1">
              ${escapeHtml(item.product || item.shippingName || 'สินค้า')}
              ${item.color ? `<span style="color:var(--text-light);"> (${escapeHtml(item.color)})</span>` : ''}
            </div>
            <div style="text-align:right;">x${item.quantity || 1}</div>
            <div style="text-align:right;min-width:80px;">฿${(item.price || 0).toLocaleString()}</div>
          </div>
        `).join('') || '<div class="orders-detail-value">-</div>'}
      </div>

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-receipt"></i> การชำระเงิน</div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">ยอดรวม</div>
          <div class="orders-detail-value"><strong>฿${(order.totalAmount || 0).toLocaleString()}</strong></div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">ค่าส่ง</div>
          <div class="orders-detail-value">฿${(order.shippingCost || 0).toLocaleString()}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">วิธีชำระ</div>
          <div class="orders-detail-value">${escapeHtml(order.paymentMethod || '-')}</div>
        </div>
      </div>

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-info-circle"></i> สถานะ</div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">สถานะ</div>
          <div class="orders-detail-value">
            <span class="orders-status-badge status-${order.status}">${statusConfig.label}</span>
          </div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">วันที่</div>
          <div class="orders-detail-value">${date}</div>
        </div>
        <div class="orders-detail-row">
          <div class="orders-detail-label">เพจ</div>
          <div class="orders-detail-value">${escapeHtml(order.pageName || '-')}</div>
        </div>
      </div>

      <div class="orders-detail-section" id="trackingSection">
        <div class="orders-detail-section-title"><i class="fas fa-shipping-fast"></i> เลขพัสดุ / Tracking</div>
        ${order.trackingNumber ? `
          <div class="orders-detail-row" style="background:#f0fdf4;border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
            <div style="flex:1;">
              <div style="font-size:0.8rem;color:#666;margin-bottom:4px;">เลขพัสดุปัจจุบัน</div>
              <div style="font-family:monospace;font-size:1rem;font-weight:600;color:#166534;letter-spacing:0.5px;">${escapeHtml(order.trackingNumber)}</div>
              ${order.trackingCarrier ? `<div style="font-size:0.8rem;color:#666;margin-top:4px;">🚚 ${escapeHtml(order.trackingCarrier)}</div>` : ''}
            </div>
          </div>
        ` : ''}
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <select id="trackingCarrierSelect" style="flex:0 0 auto;min-width:140px;padding:0.5rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;background:#fff;">
              <option value="">-- เลือกขนส่ง --</option>
            </select>
            <button class="orders-btn orders-btn-outline" style="padding:0.4rem 0.6rem;font-size:0.8rem;white-space:nowrap;" onclick="window.OrdersV2.toggleAddCarrier()" title="เพิ่มขนส่งใหม่">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <div id="addCarrierForm" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;margin-bottom:0.25rem;">
            <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.5rem;color:#475569;">เพิ่มขนส่งใหม่</div>
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
              <input type="text" id="newCarrierName" placeholder="ชื่อขนส่ง เช่น Kerry Express" style="padding:0.4rem 0.6rem;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;">
              <input type="text" id="newCarrierUrl" placeholder="URL ตรวจสอบ เช่น https://track.Kerry.co.th/?tracking={tracking}" style="padding:0.4rem 0.6rem;border:1px solid #ddd;border-radius:6px;font-size:0.8rem;color:#666;">
              <div style="font-size:0.7rem;color:#94a3b8;">ใช้ {tracking} แทนตำแหน่งเลขพัสดุใน URL</div>
              <div style="display:flex;gap:0.4rem;">
                <button class="orders-btn orders-btn-primary" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="window.OrdersV2.addCarrier()">
                  <i class="fas fa-check"></i> เพิ่ม
                </button>
                <button class="orders-btn orders-btn-outline" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="window.OrdersV2.toggleAddCarrier()">
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
          <input type="text" id="trackingNumberInput" placeholder="กรอกเลขพัสดุ..." value="${escapeHtml(order.trackingNumber || '')}" style="padding:0.5rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;font-family:monospace;letter-spacing:0.5px;">
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:#555;cursor:pointer;">
            <input type="checkbox" id="trackingNotifyCustomer" checked> แจ้งลูกค้าทันที
          </label>
          <button class="orders-btn orders-btn-primary" style="align-self:flex-start;" onclick="window.OrdersV2.submitTracking('${order.id}')">
            <i class="fas fa-paper-plane"></i> ${order.trackingNumber ? 'อัปเดตเลขพัสดุ' : 'บันทึกและแจ้งลูกค้า'}
          </button>
        </div>
      </div>

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-sticky-note"></i> หมายเหตุ</div>
        <textarea class="orders-notes-textarea" id="ordersDetailNotes" placeholder="เพิ่มหมายเหตุ...">${escapeHtml(order.notes || '')}</textarea>
        <button class="orders-btn orders-btn-secondary" style="margin-top:0.5rem;" onclick="window.OrdersV2.saveNotes('${order.id}')">
          <i class="fas fa-save"></i> บันทึกหมายเหตุ
        </button>
      </div>

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-exchange-alt"></i> เปลี่ยนสถานะ</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          ${['pending', 'confirmed', 'shipped', 'completed', 'cancelled'].map(s => {
      const cfg = STATUS_CONFIG[s];
      const isActive = order.status === s;
      return `
              <button class="orders-btn ${isActive ? 'orders-btn-primary' : 'orders-btn-outline'}" 
                      onclick="window.OrdersV2.updateStatus('${order.id}', '${s}')">
                ${cfg.label}
              </button>
            `;
    }).join('')}
        </div>
      </div>
    `;

    // Update title
    const titleEl = document.getElementById('ordersDetailTitle');
    if (titleEl) {
      titleEl.textContent = order.orderCode ? `Order ${order.orderCode}` : `Order #${order.id.slice(-8).toUpperCase()}`;
    }
  }

  async function saveNotes(orderId) {
    const textarea = document.getElementById('ordersDetailNotes');
    if (!textarea) return;

    try {
      const response = await fetch(`/admin/orders/${orderId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: textarea.value })
      });

      const data = await response.json();
      if (data.success) {
        showToast('บันทึกหมายเหตุเรียบร้อย', 'success');
        // Update local state
        const order = state.orders.find(o => o.id === orderId);
        if (order) order.notes = textarea.value;
      } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (error) {
      console.error('[Orders] Save notes error:', error);
      showToast('ไม่สามารถบันทึกหมายเหตุได้', 'error');
    }
  }

  // ============ Tracking ============
  async function loadCarriersForDropdown(selectedCarrier) {
    const select = document.getElementById('trackingCarrierSelect');
    if (!select) return;

    try {
      const response = await fetch('/admin/shipping-carriers');
      const data = await response.json();
      if (!data.success) return;

      select.innerHTML = '<option value="">-- เลือกขนส่ง --</option>';
      (data.carriers || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        if (selectedCarrier && c.name === selectedCarrier) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('[Orders] Load carriers error:', err);
    }
  }

  function toggleAddCarrier() {
    const form = document.getElementById('addCarrierForm');
    if (!form) return;
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }

  async function addCarrier() {
    const nameInput = document.getElementById('newCarrierName');
    const urlInput = document.getElementById('newCarrierUrl');
    const name = nameInput?.value?.trim();
    if (!name) {
      showToast('กรุณาระบุชื่อขนส่ง', 'error');
      return;
    }

    try {
      const response = await fetch('/admin/shipping-carriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, trackingUrl: urlInput?.value || '' })
      });
      const data = await response.json();
      if (data.success) {
        showToast(`เพิ่มขนส่ง "${name}" เรียบร้อย`, 'success');
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        toggleAddCarrier();
        // Reload dropdown and select the new carrier
        await loadCarriersForDropdown(name);
      } else {
        showToast(data.error || 'เพิ่มขนส่งไม่สำเร็จ', 'error');
      }
    } catch (err) {
      console.error('[Orders] Add carrier error:', err);
      showToast('เพิ่มขนส่งไม่สำเร็จ', 'error');
    }
  }

  async function submitTracking(orderId) {
    const trackingInput = document.getElementById('trackingNumberInput');
    const carrierSelect = document.getElementById('trackingCarrierSelect');
    const notifyCheckbox = document.getElementById('trackingNotifyCustomer');

    const trackingNumber = trackingInput?.value?.trim();
    if (!trackingNumber) {
      showToast('กรุณากรอกเลขพัสดุ', 'error');
      return;
    }

    const carrier = carrierSelect?.value || '';
    const notifyCustomer = notifyCheckbox?.checked !== false;

    try {
      const submitBtn = document.querySelector('#trackingSection .orders-btn-primary:last-of-type');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
      }

      const response = await fetch(`/admin/orders/${orderId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber, carrier, notifyCustomer })
      });

      const data = await response.json();
      if (data.success) {
        const notifyText = data.notificationSent ? ' + แจ้งลูกค้าแล้ว' : '';
        showToast(`บันทึกเลขพัสดุเรียบร้อย${notifyText}`, 'success');
        // Reload orders to reflect changes
        await loadOrders();
        // Reopen detail with refreshed data
        const refreshedOrder = state.orders.find(o => o.id === orderId);
        if (refreshedOrder) {
          renderDetailPanel(refreshedOrder);
          loadCarriersForDropdown(refreshedOrder.trackingCarrier);
        }
      } else {
        showToast(data.error || 'บันทึกเลขพัสดุไม่สำเร็จ', 'error');
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> บันทึกและแจ้งลูกค้า';
      }
    } catch (err) {
      console.error('[Orders] Submit tracking error:', err);
      showToast('บันทึกเลขพัสดุไม่สำเร็จ', 'error');
    }
  }

  // ============ Actions ============
  function printLabel(orderId) {
    window.open(`/admin/orders/${orderId}/print-label`, '_blank', 'width=450,height=600');
  }

  function goToChat(userId) {
    if (userId) {
      window.location.href = `/admin/chat?user=${userId}`;
    }
  }

  function goToPage(page) {
    if (page < 1 || page > state.pagination.pages) return;
    state.pagination.page = page;
    loadOrders();
  }

  // ============ Filters Persistence ============
  function saveFilters() {
    try {
      localStorage.setItem('ordersV2Filters', JSON.stringify(state.filters));
    } catch (e) { }
  }

  function restoreFilters() {
    try {
      const saved = localStorage.getItem('ordersV2Filters');
      if (saved) {
        const filters = JSON.parse(saved);
        state.filters = { ...state.filters, ...filters };

        // Apply to inputs
        if (els.searchInput) els.searchInput.value = state.filters.search || '';
        if (els.startDate) els.startDate.value = state.filters.startDate || '';
        if (els.endDate) els.endDate.value = state.filters.endDate || '';

        // Quick date active
        if (state.filters.quickDate) {
          document.querySelector(`.orders-quick-date-btn[data-range="${state.filters.quickDate}"]`)?.classList.add('active');
        }
      }
    } catch (e) { }
  }

  // ============ Utilities ============
  function showLoading() {
    if (els.tableBody) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="orders-loading">
              <div class="orders-loading-spinner"></div>
              <div style="margin-top:1rem;">กำลังโหลดข้อมูล...</div>
            </div>
          </td>
        </tr>
      `;
    }
  }

  function showError(message) {
    if (els.tableBody) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="orders-empty-state">
              <div class="orders-empty-icon"><i class="fas fa-exclamation-triangle"></i></div>
              <div class="orders-empty-title">เกิดข้อผิดพลาด</div>
              <div class="orders-empty-text">${escapeHtml(message)}</div>
            </div>
          </td>
        </tr>
      `;
    }
  }

  function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `orders-toast orders-toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i> ${escapeHtml(message)}`;
    toast.style.cssText = `
      position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
      background: ${type === 'success' ? '#2D8F6F' : type === 'error' ? '#D2555A' : '#4A6FA5'};
      color: #fff; padding: 0.75rem 1.25rem; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;
      display: flex; align-items: center; gap: 0.5rem;
      animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  function formatDate(dateStr, full = false) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear() + 543; // พ.ศ.
    if (full) {
      const hour = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      return `${day}/${month}/${year} ${hour}:${min}`;
    }
    return `${day}/${month}`;
  }

  function formatDateInput(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ============ Public API ============
  window.OrdersV2 = {
    init,
    setStatus,
    updateStatus,
    bulkUpdateStatus,
    toggleSelect,
    openDetail,
    closeDetail,
    printLabel,
    goToChat,
    goToPage,
    saveNotes,
    submitTracking,
    toggleAddCarrier,
    addCarrier,
    showToast,
    showError
  };

  // Auto init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
