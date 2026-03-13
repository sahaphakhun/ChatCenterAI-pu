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
    summary: {
      totalOrders: 0,
      totalAmount: 0,
      totalAmountConfirmed: 0,
      totalShipping: 0,
      confirmedOrders: 0
    },
    statusCounts: {},
    filters: {
      status: 'all',
      search: '',
      pageKeys: [],
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
    els.pageDropdownBtn = document.getElementById('ordersPageBtnToggle');
    els.pageBtnText = document.getElementById('ordersPageBtnText');
    els.pageMenu = document.getElementById('ordersPageMenu');
    els.pageList = document.getElementById('ordersPageList');
    els.pageSearch = document.getElementById('ordersPageSearch');
    els.pageSelectAll = document.getElementById('ordersPageSelectAll');
    els.pageApplyBtn = document.getElementById('ordersPageApplyBtn');
    els.pageSelectedCount = document.getElementById('ordersPageSelectedCount');
    els.startDate = document.getElementById('ordersStartDate');
    els.endDate = document.getElementById('ordersEndDate');
    els.bulkBar = document.getElementById('ordersBulkBar');
    els.bulkCount = document.getElementById('ordersBulkCount');
    els.selectAll = document.getElementById('ordersSelectAll');
    els.detailOverlay = document.getElementById('ordersDetailOverlay');
    els.detailPanel = document.getElementById('ordersDetailPanel');
    els.exportBtn = document.getElementById('ordersExportBtn');
    els.exportFormat = document.getElementById('ordersExportFormat');
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

    // Page Dropdown
    if (els.pageDropdownBtn) {
      els.pageDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.pageMenu.classList.toggle('show');
      });
      document.addEventListener('click', (e) => {
        if (els.pageMenu && els.pageMenu.classList.contains('show') && !e.target.closest('#ordersPageDropdown')) {
          els.pageMenu.classList.remove('show');
          renderPageDropdownText(); // Revert if closed
        }
      });
    }

    if (els.pageSearch) {
      els.pageSearch.addEventListener('input', debounce((e) => {
        const text = e.target.value.toLowerCase();
        document.querySelectorAll('.orders-page-item').forEach(el => {
          if (el.classList.contains('select-all')) return;
          const name = el.innerText.toLowerCase();
          el.style.display = name.includes(text) ? 'flex' : 'none';
        });
      }, 200));
    }

    if (els.pageSelectAll) {
      els.pageSelectAll.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('#ordersPageList input[type="checkbox"]').forEach(cb => {
          if (cb.closest('.orders-page-item').style.display !== 'none') {
            cb.checked = checked;
          }
        });
        updatePageSelectedCount();
      });
    }

    if (els.pageApplyBtn) {
      els.pageApplyBtn.addEventListener('click', () => {
        const selected = Array.from(document.querySelectorAll('#ordersPageList input[type="checkbox"]:checked')).map(cb => cb.value);
        state.filters.pageKeys = selected;
        state.filters.pageKey = selected.length > 0 ? selected.join(',') : '';
        els.pageMenu.classList.remove('show');
        state.pagination.page = 1;
        saveFilters();
        loadOrders();
        renderPageDropdownText();
      });
    }

    // Delegate checkbox clicks
    if (els.pageList) {
      els.pageList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') updatePageSelectedCount();
      });
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
    document.getElementById('ordersBulkDelete')?.addEventListener('click', handleBulkDelete);

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
    if (state.filters.pageKeys && state.filters.pageKeys.length > 0) {
      params.set('pageKey', state.filters.pageKeys.join(','));
    } else if (state.filters.pageKey) {
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

    const {
      totalOrders,
      totalAmount,
      totalAmountConfirmed,
      totalShipping,
      confirmedOrders
    } = state.summary;
    const avgOrder = totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0;
    const confirmedCount = Number.isFinite(Number(confirmedOrders))
      ? Number(confirmedOrders)
      : (state.statusCounts.confirmed || 0);
    const confirmedRate = totalOrders > 0 ? Math.round((confirmedCount / totalOrders) * 100) : 0;

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
          <div class="orders-summary-value-group">
            <div class="orders-summary-value-row is-draft">
              <span class="orders-summary-inline-label">ร่าง</span>
              <strong>฿${(totalAmount || 0).toLocaleString()}</strong>
            </div>
            <div class="orders-summary-value-row is-confirmed">
              <span class="orders-summary-inline-label">ยืนยันแล้ว</span>
              <strong>฿${(totalAmountConfirmed || 0).toLocaleString()}</strong>
            </div>
          </div>
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
          <div class="orders-summary-label">ยืนยันแล้ว</div>
          <div class="orders-summary-value">${confirmedRate}%</div>
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
            ${order.orderCode ? `<div class="orders-order-code">${escapeHtml(order.orderCode)}</div>` : ''}
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
            ${order.trackingNumber ? `<span title="${escapeHtml(order.trackingNumber)}" class="orders-tracking-indicator"><i class="fas fa-truck"></i></span>` : ''}
          </td>
          <td>
            <div class="orders-actions">
              <button class="orders-action-btn" title="ดูรายละเอียด" onclick="window.OrdersV2.openDetail('${order.id}')">
                <i class="fas fa-eye"></i>
              </button>
              <button class="orders-action-btn btn-print" title="พิมพ์ใบปะหน้า" onclick="window.OrdersV2.printLabel('${order.id}')">
                <i class="fas fa-print"></i>
              </button>
              <button class="orders-action-btn btn-shipping" title="จัดการขนส่ง" onclick="event.stopPropagation(); window.OrdersV2.openQuickTracking('${order.id}', this)">
                <i class="fas fa-truck"></i>
              </button>
              <button class="orders-action-btn btn-chat" title="ไปยังแชท" onclick="window.OrdersV2.goToChat('${order.userId}')">
                <i class="fas fa-comment"></i>
              </button>
              <button class="orders-action-btn btn-delete" title="ลบออเดอร์" onclick="window.OrdersV2.deleteOrder('${order.id}')">
                <i class="fas fa-trash-alt"></i>
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
    if (!els.pageList) return;

    let html = '';
    state.pages.forEach(page => {
      const label = page.name || page.pageKey || 'Unknown';
      html += `
        <label class="orders-page-item">
          <input type="checkbox" value="${page.pageKey}">
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    });

    els.pageList.innerHTML = html;

    if (state.filters.pageKey && (!state.filters.pageKeys || state.filters.pageKeys.length === 0)) {
      state.filters.pageKeys = state.filters.pageKey.split(',').filter(Boolean);
    }

    renderPageDropdownText();
  }

  function updatePageSelectedCount() {
    if (!els.pageSelectedCount) return;
    const count = document.querySelectorAll('#ordersPageList input[type="checkbox"]:checked').length;
    els.pageSelectedCount.textContent = count > 0 ? `เลือก ${count} เพจ` : 'ทุกเพจ/บอท';

    // Update select all state
    const allVisible = Array.from(document.querySelectorAll('#ordersPageList input[type="checkbox"]'))
      .filter(cb => cb.closest('.orders-page-item').style.display !== 'none');
    const checkedVisible = allVisible.filter(cb => cb.checked);
    if (els.pageSelectAll) {
      els.pageSelectAll.checked = checkedVisible.length === allVisible.length && allVisible.length > 0;
      els.pageSelectAll.indeterminate = checkedVisible.length > 0 && checkedVisible.length < allVisible.length;
    }
  }

  function renderPageDropdownText() {
    if (!els.pageBtnText) return;
    const selected = state.filters.pageKeys || [];
    if (selected.length === 0) {
      els.pageBtnText.textContent = 'ทุกเพจ/บอท';
    } else if (selected.length === 1) {
      const page = state.pages.find(p => p.pageKey === selected[0]);
      els.pageBtnText.textContent = page ? (page.name || page.pageKey) : '1 เพจ';
    } else {
      els.pageBtnText.textContent = `${selected.length} เพจ`;
    }

    if (els.pageList) {
      document.querySelectorAll('#ordersPageList input[type="checkbox"]').forEach(cb => {
        cb.checked = selected.includes(cb.value);
      });
      updatePageSelectedCount();
    }
  }

  // ============ Event Handlers ============
  function handleSearch(e) {
    state.filters.search = e.target.value.trim();
    state.pagination.page = 1;
    saveFilters();
    loadOrders();
  }

  // Removed handlePageSelect

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
    window.location.href = buildExportUrl(params);
  }

  async function handleBulkDelete() {
    const ids = Array.from(state.selectedIds);
    if (ids.length === 0) return;

    const confirmDelete = window.confirm(`ต้องการลบออเดอร์ที่เลือก ${ids.length} รายการถาวรหรือไม่? การลบไม่สามารถกู้คืนได้`);
    if (!confirmDelete) return;

    try {
      const response = await fetch('/admin/orders/bulk/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids })
      });
      const data = await response.json();

      if (data.success) {
        if (state.detailOrderId && ids.includes(state.detailOrderId)) {
          closeDetail();
        }
        clearSelection();
        showToast(`ลบออเดอร์ ${data.deletedCount || 0} รายการเรียบร้อย`, 'success');
        loadOrders();
      } else {
        showToast(data.error || 'ไม่สามารถลบออเดอร์ได้', 'error');
      }
    } catch (error) {
      console.error('[Orders] Bulk delete error:', error);
      showToast('เกิดข้อผิดพลาดในการลบออเดอร์', 'error');
    }
  }

  function handleExport() {
    // If there are selected orders, export only those
    if (state.selectedIds.size > 0) {
      const ids = Array.from(state.selectedIds);
      // Backend expects selectedIds as comma-separated string
      const params = new URLSearchParams();
      params.set('selectedIds', ids.join(','));
      window.location.href = buildExportUrl(params);
    } else {
      // Export all orders matching current filters
      const params = buildQueryParams();
      window.location.href = buildExportUrl(params);
    }
  }

  function getExportFormat() {
    const value = String(els.exportFormat?.value || '').trim().toLowerCase();
    return value === 'kex' ? 'kex' : 'myorder';
  }

  function buildExportUrl(params = new URLSearchParams()) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('exportFormat', getExportFormat());
    return `/admin/orders/export?${nextParams.toString()}`;
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
          <div class="orders-detail-row orders-tracking-current">
            <div style="flex:1;">
              <div class="orders-tracking-current-label">เลขพัสดุปัจจุบัน</div>
              <div class="orders-tracking-current-number">${escapeHtml(order.trackingNumber)}</div>
              ${order.trackingCarrier ? `<div class="orders-tracking-current-carrier">🚚 ${escapeHtml(order.trackingCarrier)}</div>` : ''}
            </div>
          </div>
        ` : ''}
        <div class="orders-tracking-form">
          <div class="orders-tracking-row">
            <select id="trackingCarrierSelect" class="orders-tracking-select">
              <option value="">-- เลือกขนส่ง --</option>
            </select>
            <button class="orders-btn orders-btn-outline orders-btn-inline" onclick="window.OrdersV2.toggleAddCarrier()" title="เพิ่มขนส่งใหม่">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <div id="addCarrierForm" class="orders-add-carrier-form" style="display:none;">
            <div class="orders-add-carrier-title">เพิ่มขนส่งใหม่</div>
            <div class="orders-add-carrier-fields">
              <input type="text" id="newCarrierName" placeholder="ชื่อขนส่ง เช่น Kerry Express" class="orders-tracking-input">
              <input type="text" id="newCarrierUrl" placeholder="URL ตรวจสอบ เช่น https://track.example.com/{tracking}" class="orders-tracking-input orders-tracking-input-muted">
              <div class="orders-add-carrier-hint">ใช้ {tracking} แทนตำแหน่งเลขพัสดุใน URL</div>
              <div class="orders-add-carrier-actions">
                <button class="orders-btn orders-btn-primary orders-btn-inline" onclick="window.OrdersV2.addCarrier()">
                  <i class="fas fa-check"></i> เพิ่ม
                </button>
                <button class="orders-btn orders-btn-outline orders-btn-inline" onclick="window.OrdersV2.toggleAddCarrier()">
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
          <input type="text" id="trackingNumberInput" placeholder="กรอกเลขพัสดุ..." value="${escapeHtml(order.trackingNumber || '')}" class="orders-tracking-input orders-tracking-code">
          <label class="orders-tracking-notify">
            <input type="checkbox" id="trackingNotifyCustomer" checked> แจ้งลูกค้าทันที
          </label>
          <button class="orders-btn orders-btn-primary" id="trackingSubmitBtn" onclick="window.OrdersV2.submitTracking('${order.id}')">
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

      <div class="orders-detail-section">
        <div class="orders-detail-section-title"><i class="fas fa-trash-alt"></i> ลบออเดอร์</div>
        <button class="orders-btn orders-btn-danger" onclick="window.OrdersV2.deleteOrder('${order.id}')">
          <i class="fas fa-trash-alt"></i> ลบออเดอร์นี้
        </button>
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

  async function loadCarriersForDropdown(selectedCarrier) {
    const select = document.getElementById('trackingCarrierSelect');
    if (!select) return;

    try {
      const response = await fetch('/admin/shipping-carriers');
      const data = await response.json();
      if (!data.success) return;

      select.innerHTML = '<option value="">-- เลือกขนส่ง --</option>';
      (data.carriers || []).forEach((carrier) => {
        const option = document.createElement('option');
        option.value = carrier.name;
        option.textContent = carrier.name;
        if (selectedCarrier && carrier.name === selectedCarrier) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    } catch (error) {
      console.error('[Orders] Load carriers error:', error);
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
      if (!data.success) {
        throw new Error(data.error || 'เพิ่มขนส่งไม่สำเร็จ');
      }

      showToast(`เพิ่มขนส่ง "${name}" เรียบร้อย`, 'success');
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';
      toggleAddCarrier();
      await loadCarriersForDropdown(name);
    } catch (error) {
      console.error('[Orders] Add carrier error:', error);
      showToast(error.message || 'เพิ่มขนส่งไม่สำเร็จ', 'error');
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
    const submitBtn = document.getElementById('trackingSubmitBtn');

    try {
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
      if (!data.success) {
        throw new Error(data.error || 'บันทึกเลขพัสดุไม่สำเร็จ');
      }

      const notifyText = data.notificationSent ? ' + แจ้งลูกค้าแล้ว' : '';
      showToast(`บันทึกเลขพัสดุเรียบร้อย${notifyText}`, 'success');
      await loadOrders();

      const refreshedOrder = state.orders.find((order) => order.id === orderId);
      if (refreshedOrder) {
        renderDetailPanel(refreshedOrder);
        loadCarriersForDropdown(refreshedOrder.trackingCarrier);
      }
    } catch (error) {
      console.error('[Orders] Submit tracking error:', error);
      showToast(error.message || 'บันทึกเลขพัสดุไม่สำเร็จ', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> บันทึกและแจ้งลูกค้า';
      }
    }
  }

  let activeQuickTrackingPopover = null;

  function closeQuickTracking() {
    if (activeQuickTrackingPopover) {
      activeQuickTrackingPopover.remove();
      activeQuickTrackingPopover = null;
    }
    document.removeEventListener('click', handleQuickTrackingOutsideClick);
  }

  async function openQuickTracking(orderId, anchorEl) {
    closeQuickTracking();

    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !anchorEl) return;

    const popover = document.createElement('div');
    popover.className = 'quick-tracking-popover';
    popover.innerHTML = `
      <div class="qt-header">
        <span class="qt-title"><i class="fas fa-truck"></i> จัดการขนส่ง</span>
        <button class="qt-close" onclick="window.OrdersV2.closeQuickTracking()"><i class="fas fa-times"></i></button>
      </div>
      <div class="qt-body">
        <div class="qt-field">
          <label class="qt-label">ขนส่ง</label>
          <select class="qt-select" id="qtCarrierSelect">
            <option value="">-- เลือกขนส่ง --</option>
          </select>
        </div>
        <div class="qt-field">
          <label class="qt-label">เลขพัสดุ</label>
          <input type="text" class="qt-input" id="qtTrackingInput" placeholder="กรอกเลขแทรค..." value="${escapeHtml(order.trackingNumber || '')}">
        </div>
        <div class="qt-field qt-checkbox-field">
          <input type="checkbox" id="qtNotifyCustomer" checked>
          <label for="qtNotifyCustomer">แจ้งลูกค้าทาง LINE/FB/IG/WA</label>
        </div>
        <button class="qt-submit" id="qtSubmitBtn" onclick="window.OrdersV2.submitQuickTracking('${orderId}')">
          <i class="fas fa-paper-plane"></i> บันทึกเลขพัสดุ
        </button>
      </div>
    `;

    document.body.appendChild(popover);
    activeQuickTrackingPopover = popover;

    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 280;
    let left = rect.right - popoverWidth;
    let top = rect.bottom + 6;

    if (left < 8) left = 8;
    if (top + 300 > window.innerHeight) {
      top = rect.top - 6;
      popover.style.transform = 'translateY(-100%)';
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    try {
      const response = await fetch('/admin/shipping-carriers');
      const data = await response.json();
      if (data.success) {
        const select = popover.querySelector('#qtCarrierSelect');
        (data.carriers || []).forEach((carrier) => {
          const option = document.createElement('option');
          option.value = carrier.name;
          option.textContent = carrier.name;
          if (order.trackingCarrier && carrier.name === order.trackingCarrier) {
            option.selected = true;
          }
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('[Orders] Load carriers for quick tracking:', error);
    }

    setTimeout(() => {
      popover.querySelector('#qtTrackingInput')?.focus();
      document.addEventListener('click', handleQuickTrackingOutsideClick);
    }, 10);
  }

  function handleQuickTrackingOutsideClick(event) {
    if (
      activeQuickTrackingPopover &&
      !activeQuickTrackingPopover.contains(event.target) &&
      !event.target.closest('.btn-shipping')
    ) {
      closeQuickTracking();
    }
  }

  async function submitQuickTracking(orderId) {
    const popover = activeQuickTrackingPopover;
    if (!popover) return;

    const trackingInput = popover.querySelector('#qtTrackingInput');
    const carrierSelect = popover.querySelector('#qtCarrierSelect');
    const notifyCheckbox = popover.querySelector('#qtNotifyCustomer');
    const submitBtn = popover.querySelector('#qtSubmitBtn');

    const trackingNumber = trackingInput?.value?.trim();
    if (!trackingNumber) {
      showToast('กรุณากรอกเลขพัสดุ', 'error');
      trackingInput?.focus();
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
      }

      const response = await fetch(`/admin/orders/${orderId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber,
          carrier: carrierSelect?.value || '',
          notifyCustomer: notifyCheckbox?.checked !== false,
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'บันทึกเลขพัสดุไม่สำเร็จ');
      }

      const notifyText = data.notificationSent ? ' + แจ้งลูกค้าแล้ว' : '';
      showToast(`บันทึกเลขพัสดุเรียบร้อย${notifyText}`, 'success');
      closeQuickTracking();
      await loadOrders();
    } catch (error) {
      console.error('[Orders] Quick tracking error:', error);
      showToast(error.message || 'บันทึกเลขพัสดุไม่สำเร็จ', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> บันทึกเลขพัสดุ';
      }
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

  async function deleteOrder(orderId) {
    if (!orderId) return;
    const confirmDelete = window.confirm('ต้องการลบออเดอร์นี้ถาวรหรือไม่? การลบไม่สามารถกู้คืนได้');
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/admin/orders/${orderId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        state.selectedIds.delete(orderId);
        if (state.detailOrderId === orderId) {
          closeDetail();
        }
        showToast('ลบออเดอร์เรียบร้อย', 'success');
        loadOrders();
      } else {
        showToast(data.error || 'ไม่สามารถลบออเดอร์ได้', 'error');
      }
    } catch (error) {
      console.error('[Orders] Delete order error:', error);
      showToast('เกิดข้อผิดพลาดในการลบออเดอร์', 'error');
    }
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
      let filters = saved ? JSON.parse(saved) : {};

      const urlParams = new URLSearchParams(window.location.search);
      const urlPageKey = urlParams.get('pageKey');
      if (urlPageKey) {
        filters.pageKey = urlPageKey;
        filters.pageKeys = urlPageKey.split(',').filter(Boolean);
      }

      state.filters = { ...state.filters, ...filters };

      // Apply to inputs
      if (els.searchInput) els.searchInput.value = state.filters.search || '';
      if (els.startDate) els.startDate.value = state.filters.startDate || '';
      if (els.endDate) els.endDate.value = state.filters.endDate || '';

      // Quick date active
      if (state.filters.quickDate) {
        document.querySelector(`.orders-quick-date-btn[data-range="${state.filters.quickDate}"]`)?.classList.add('active');
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
    loadCarriersForDropdown,
    toggleAddCarrier,
    addCarrier,
    submitTracking,
    openQuickTracking,
    closeQuickTracking,
    submitQuickTracking,
    printLabel,
    goToChat,
    goToPage,
    deleteOrder,
    saveNotes,
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
