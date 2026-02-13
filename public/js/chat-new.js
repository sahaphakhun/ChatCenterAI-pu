// Chat New UI JavaScript - Minimal & Clean Implementation

class ChatManager {
    constructor() {
        this.socket = null;
        this.currentUserId = null;
        this.users = [];
        this.allUsers = []; // เก็บข้อมูลผู้ใช้ทั้งหมดก่อนการกรอง
        this.chatHistory = {};
        this.isLoading = false;
        this.availableTags = []; // เก็บแท็กที่มีในระบบ
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };
        this.closeSidebarForMobile = () => { };
        this.mobileMediaQuery = null;
        this.updateAppHeight = this.updateAppHeight.bind(this);
        const followUpConfig = window.chatCenterFollowUpConfig || {};
        this.followUpOptions = {
            analysisEnabled: typeof followUpConfig.analysisEnabled === 'boolean' ? followUpConfig.analysisEnabled : true,
            showInChat: typeof followUpConfig.showInChat === 'boolean' ? followUpConfig.showInChat : true
        };

        // ✅ Initialize performance utilities
        this.optimizedFetch = new window.performanceUtils.OptimizedFetch();
        this.lazyLoader = new window.performanceUtils.LazyImageLoader();
        this.smartPoller = null;

        // ✅ Debounced search
        this.debouncedSearch = this.debounce(this.performSearch.bind(this), 300);

        // ✅ NEW: Quick Replies & Templates
        this.quickReplies = [];
        this.currentEditingTemplateId = null;

        // ✅ NEW: Chat Search
        this.chatSearchResults = [];
        this.currentSearchResultIndex = -1;

        // ✅ NEW: Message Selection for Forwarding
        this.selectedMessages = new Set();
        this.isSelectionMode = false;

        // ✅ NEW: Keyboard Shortcuts
        this.shortcuts = {
            'ctrl+k': () => this.openChatSearch(),
            'ctrl+shift+f': () => this.openForwardModal(),
            'ctrl+shift+s': () => this.openStatisticsModal(),
            'ctrl+shift+e': () => this.openExportModal(),
            'ctrl+/': () => this.openShortcutsModal(),
            'esc': () => this.handleEscapeKey()
        };

        this.init();
    }

    // Debounce utility
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    setupViewportHeightObserver() {
        this.updateAppHeight();

        window.addEventListener('resize', this.updateAppHeight);
        window.addEventListener('focusin', this.updateAppHeight);
        window.addEventListener('focusout', this.updateAppHeight);

        window.addEventListener('orientationchange', () => {
            window.setTimeout(this.updateAppHeight, 150);
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.updateAppHeight, { passive: true });
            window.visualViewport.addEventListener('scroll', this.updateAppHeight, { passive: true });
        }
    }

    updateAppHeight() {
        window.requestAnimationFrame(() => {
            const viewport = window.visualViewport || null;
            const height = viewport ? viewport.height : window.innerHeight;
            if (height && height > 0) {
                document.documentElement.style.setProperty('--app-height', `${height}px`);
            }

            const nav = document.querySelector('.app-navbar');
            if (nav) {
                document.documentElement.style.setProperty('--navbar-height', `${nav.offsetHeight}px`);
            }
        });
    }

    async toggleAiForCurrent() {
        if (!this.currentUserId) return;
        try {
            // อ่านสถานะปัจจุบันจาก this.users
            const user = this.users.find(u => u.userId === this.currentUserId) || {};
            let current = typeof user.aiEnabled !== 'undefined' ? !!user.aiEnabled : null;
            if (current === null) {
                const res = await fetch(`/admin/chat/user-status/${this.currentUserId}`);
                const data = await res.json();
                current = data.success ? !!data.aiEnabled : true;
            }

            const desired = !current;
            const resp = await fetch('/admin/chat/user-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.currentUserId, aiEnabled: desired })
            });
            const data = await resp.json();
            if (data.success) {
                // อัปเดตรายชื่อผู้ใช้และ header
                await this.loadUsers();
                const res2 = await fetch(`/admin/chat/user-status/${this.currentUserId}`);
                const upd = await res2.json();
                if (upd.success) {
                    const u = this.users.find(x => x.userId === this.currentUserId) || {};
                    u.aiEnabled = !!upd.aiEnabled;
                    this.updateChatHeader(u);
                }
                window.showSuccess(desired ? 'เปิด AI สำหรับผู้ใช้นี้แล้ว' : 'ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว');
            } else {
                window.showError('ไม่สามารถอัปเดตสถานะ AI ได้: ' + data.error);
            }
        } catch (err) {
            console.error('toggleAiForCurrent error', err);
            window.errorHandler.handleApiError(err);
        }
    }

    init() {
        this.setupViewportHeightObserver();
        this.initializeSocket();
        this.setupEventListeners();
        this.setupFilterListeners();
        this.setupTagModalListeners();
        this.loadUsers();
        this.loadAvailableTags();
        this.setupAutoRefresh();

        // ✅ NEW: Setup new features
        this.setupTemplateListeners();
        this.setupChatSearchListeners();
        this.setupForwardListeners();
        this.setupAssignmentListeners();
        this.setupStatisticsListeners();
        this.setupExportListeners();
        this.setupKeyboardShortcuts();
        this.setupOrderListeners();
        this.loadQuickReplies();
    }

    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('เชื่อมต่อ Socket.IO สำเร็จ');
            window.showSuccess('เชื่อมต่อสำเร็จ');
        });

        this.socket.on('disconnect', () => {
            console.log('การเชื่อมต่อ Socket.IO ถูกตัด');
            window.showWarning('การเชื่อมต่อถูกตัด');
        });

        this.socket.on('newMessage', (data) => {
            console.log('ข้อความใหม่:', data);
            this.handleNewMessage(data);
        });

        this.socket.on('followUpTagged', (data) => {
            console.log('อัปเดตสถานะติดตาม:', data);
            this.handleFollowUpTagged(data);
        });

        this.socket.on('chatCleared', (data) => {
            if (data.userId === this.currentUserId) {
                this.clearChatDisplay();
            }
            this.loadUsers();
        });

        // Listen for tag and purchase status updates
        this.socket.on('userTagsUpdated', (data) => {
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.tags = data.tags || [];
                this.applyFilters();
            }
        });

        // Order-related socket events
        this.socket.on('orderExtracted', (data) => {
            console.log('ออเดอร์ใหม่:', data);
            this.handleOrderExtracted(data);
        });

        this.socket.on('orderUpdated', (data) => {
            console.log('ออเดอร์อัปเดต:', data);
            this.handleOrderUpdated(data);
        });

        this.socket.on('orderDeleted', (data) => {
            console.log('ออเดอร์ถูกลบ:', data);
            this.handleOrderDeleted(data);
        });

        this.socket.on('userPurchaseStatusUpdated', (data) => {
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.hasPurchased = data.hasPurchased;
                this.applyFilters();
            }
        });
    }

    setupEventListeners() {
        // Message input events
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const charCount = document.getElementById('charCount');

        messageInput.addEventListener('input', (e) => {
            const count = e.target.value.length;
            charCount.textContent = count;

            if (count > 900) {
                charCount.classList.add('text-danger');
            } else {
                charCount.classList.remove('text-danger');
            }

            // ปรับขนาด textarea อัตโนมัติ
            this.autoResizeTextarea(e.target);
        });

        messageInput.addEventListener('keydown', (e) => {
            // ✅ NEW: Listen for '/' key to open template modal
            if (e.key === '/' && messageInput.value === '') {
                e.preventDefault();
                this.openTemplateModal();
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // ✅ NEW: Template button
        const templateBtn = document.getElementById('templateBtn');
        if (templateBtn) {
            templateBtn.addEventListener('click', () => {
                this.openTemplateModal();
            });
        }

        // Image modal events
        document.getElementById('downloadImage').addEventListener('click', () => {
            this.downloadImage();
        });

        document.getElementById('copyImage').addEventListener('click', () => {
            this.copyImage();
        });
    }

    setupFilterListeners() {
        // Search input
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                this.currentFilters.search = e.target.value.trim();
                this.debouncedSearch();
            });
        }

        // Filter toggle button
        const filterToggle = document.getElementById('filterToggle');
        const filterOptions = document.getElementById('filterOptions');
        if (filterToggle && filterOptions) {
            filterToggle.addEventListener('click', () => {
                const isVisible = filterOptions.style.display !== 'none';
                filterOptions.style.display = isVisible ? 'none' : 'block';
            });
        }

        // Clear filters button
        const clearFilters = document.getElementById('clearFilters');
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                this.clearAllFilters();
            });
        }

        // Status filter buttons
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                if (filter) {
                    // Toggle active class
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentFilters.status = filter;
                    this.applyFilters();
                }
            });
        });

        // Sidebar toggle for mobile
        const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        const userSidebar = document.getElementById('userSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebarCloseBtn = document.getElementById('toggleSidebar');

        const mediaQuery = window.matchMedia('(max-width: 991.98px)');
        this.mobileMediaQuery = mediaQuery;
        const isMobile = () => mediaQuery.matches;

        const setToggleAria = (isOpen) => {
            if (!sidebarToggleBtn) return;
            sidebarToggleBtn.setAttribute('aria-expanded', String(isOpen));
            sidebarToggleBtn.setAttribute('aria-label', isOpen ? 'ปิดรายการแชท' : 'เปิดรายการแชท');
        };

        const openSidebar = () => {
            if (!userSidebar || !isMobile()) return;
            userSidebar.classList.add('show');
            if (sidebarOverlay) sidebarOverlay.classList.add('show');
            document.body.classList.add('sidebar-open');
            setToggleAria(true);
        };

        const closeSidebar = () => {
            if (!userSidebar) return;
            userSidebar.classList.remove('show');
            if (sidebarOverlay) sidebarOverlay.classList.remove('show');
            document.body.classList.remove('sidebar-open');
            setToggleAria(false);
        };

        this.closeSidebarForMobile = closeSidebar;

        if (sidebarToggleBtn && userSidebar) {
            sidebarToggleBtn.setAttribute('aria-haspopup', 'true');
            setToggleAria(false);
            sidebarToggleBtn.addEventListener('click', () => {
                if (userSidebar.classList.contains('show')) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
        }

        if (sidebarOverlay && userSidebar) {
            sidebarOverlay.addEventListener('click', closeSidebar);
        }

        if (sidebarCloseBtn && userSidebar) {
            sidebarCloseBtn.addEventListener('click', closeSidebar);
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && userSidebar && userSidebar.classList.contains('show')) {
                closeSidebar();
            }
        });

        const handleViewportChange = (event) => {
            if (!event.matches) {
                closeSidebar();
            }
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(handleViewportChange);
        }
    }

    setupTagModalListeners() {
        const addTagBtn = document.getElementById('addTagBtn');
        const newTagInput = document.getElementById('newTagInput');

        if (addTagBtn && newTagInput) {
            addTagBtn.addEventListener('click', () => {
                this.addNewTag();
            });

            newTagInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addNewTag();
                }
            });
        }
    }

    autoResizeTextarea(textarea) {
        // รีเซ็ตความสูงก่อน
        textarea.style.height = 'auto';

        // คำนวณความสูงที่เหมาะสม
        const scrollHeight = textarea.scrollHeight;
        const minHeight = 48; // min-height จาก CSS
        const maxHeight = 120; // max-height จาก CSS

        // กำหนดความสูงใหม่
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        textarea.style.height = newHeight + 'px';
    }

    async loadUsers() {
        if (this.isLoading) return;

        this.isLoading = true;
        const userList = document.getElementById('userList');

        // ✅ แสดง skeleton loading
        userList.innerHTML = LoadingStateManager.createSkeleton('userItem', 5);

        try {
            // ✅ ใช้ optimized fetch พร้อม cache
            const data = await this.optimizedFetch.fetch('/admin/chat/users');

            if (data.success) {
                // เก็บข้อมูลผู้ใช้ทั้งหมด
                this.allUsers = data.users || [];

                // ใช้ filters
                this.applyFilters();

                if (this.currentUserId) {
                    const current = this.allUsers.find(u => u.userId === this.currentUserId);
                    if (current) {
                        this.updateChatHeader(current);
                    }
                }
            } else {
                console.error('ไม่สามารถโหลดรายชื่อผู้ใช้ได้:', data.error);
                userList.innerHTML = LoadingStateManager.createErrorState(
                    'ไม่สามารถโหลดข้อมูลได้',
                    'chatManager.loadUsers()'
                );
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการโหลดรายชื่อผู้ใช้:', error);
            window.errorHandler.handleApiError(error);
            userList.innerHTML = LoadingStateManager.createErrorState(
                'เกิดข้อผิดพลาดในการโหลดข้อมูล',
                'chatManager.loadUsers()'
            );
        } finally {
            this.isLoading = false;
        }
    }

    showLoadingState() {
        const userList = document.getElementById('userList');
        userList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <span>กำลังโหลด...</span>
            </div>
        `;
    }

    renderUserList() {
        const userList = document.getElementById('userList');

        if (this.users.length === 0) {
            userList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <h6>ไม่มีผู้ใช้</h6>
                    <p>ยังไม่มีผู้ใช้ในระบบ</p>
                </div>
            `;
            return;
        }

        const userHtml = this.users.map(user => {
            const isActive = user.userId === this.currentUserId;
            const hasUnread = user.unreadCount > 0;
            const displayName = user.displayName || `${user.userId.slice(0, 6)}...`;
            const showFollowUp = (user.followUp && typeof user.followUp.showInChat === 'boolean')
                ? user.followUp.showInChat
                : this.followUpOptions.showInChat;

            // ใช้ข้อมูลที่แปลงแล้วจาก backend
            let lastMsg = '';
            if (user.lastMessage) {
                // ถ้าเป็น HTML ให้แปลงเป็นข้อความธรรมดา
                if (user.lastMessage.includes('<')) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = user.lastMessage;
                    lastMsg = tempDiv.textContent || tempDiv.innerText || '';
                } else {
                    lastMsg = user.lastMessage;
                }
            }

            const aiBadge = user.aiEnabled ? `<span class="badge bg-success ms-1" style="font-size: 0.65rem;">AI</span>` : '';
            const followUpBadge = (showFollowUp && user.hasFollowUp)
                ? `<span class="badge followup-badge ms-1" style="font-size: 0.65rem;" title="${this.escapeAttribute(user.followUpReason || 'ลูกค้ายืนยันสั่งซื้อแล้ว')}">ติดตาม</span>`
                : '';

            const purchasedIcon = user.hasPurchased
                ? `<i class="fas fa-shopping-cart text-success ms-1" title="เคยซื้อแล้ว"></i>`
                : '';

            const orderBadge = user.hasOrders
                ? `<span class="user-has-order" title="มีออเดอร์ ${user.orderCount || 1} รายการ">🛒</span>`
                : '';

            // แสดงแท็ก (สูงสุด 2 tags)
            let tagsHtml = '';
            if (user.tags && user.tags.length > 0) {
                const displayTags = user.tags.slice(0, 2);
                tagsHtml = displayTags.map(tag => {
                    const colorClass = this.getTagColorClass(tag);
                    return `<span class="badge ${colorClass} ms-1" style="font-size: 0.6rem;">${this.escapeHtml(tag)}</span>`;
                }).join('');
                if (user.tags.length > 2) {
                    tagsHtml += `<span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">+${user.tags.length - 2}</span>`;
                }
            }

            const initials = displayName.charAt(0).toUpperCase();

            return `
                <div class="user-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''} ${user.hasPurchased ? 'purchased' : ''}" 
                     onclick="chatManager.selectUser('${user.userId}')">
                    <div class="user-item-content">
                        <div class="user-avatar ${user.hasPurchased ? 'purchased-avatar' : ''}">
                            ${this.escapeHtml(initials)}
                            ${user.hasPurchased ? '<i class="fas fa-check-circle purchased-check"></i>' : ''}
                        </div>
                        <div class="user-details">
                            <div class="user-name">
                                ${this.escapeHtml(displayName)}
                                ${purchasedIcon}
                                ${orderBadge}
                                ${aiBadge}
                                ${followUpBadge}
                            </div>
                            <div class="user-last-message">${this.escapeHtml(lastMsg.substring(0, 50))}${lastMsg.length > 50 ? '...' : ''}</div>
                            <div class="user-tags-row">${tagsHtml}</div>
                            <div class="user-timestamp">${this.formatTimestamp(user.lastTimestamp)}</div>
                        </div>
                        ${hasUnread ? `<div class="unread-badge">${user.unreadCount}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        userList.innerHTML = userHtml;
    }

    updateUserCount() {
        const userCount = document.getElementById('userCount');
        userCount.textContent = this.users.length;

        const filteredUserCount = document.getElementById('filteredUserCount');
        if (filteredUserCount) {
            filteredUserCount.textContent = this.users.length;
        }
    }

    // ========== Filter & Search Methods ==========

    performSearch() {
        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.allUsers];

        // Apply search filter
        if (this.currentFilters.search) {
            const searchLower = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(user => {
                const name = (user.displayName || '').toLowerCase();
                const userId = (user.userId || '').toLowerCase();
                return name.includes(searchLower) || userId.includes(searchLower);
            });
        }

        // Apply status filter
        if (this.currentFilters.status === 'unread') {
            filtered = filtered.filter(user => user.unreadCount > 0);
        } else if (this.currentFilters.status === 'followup') {
            filtered = filtered.filter(user => user.hasFollowUp);
        } else if (this.currentFilters.status === 'purchased') {
            filtered = filtered.filter(user => user.hasPurchased);
        }

        // Apply tag filters (OR logic)
        if (this.currentFilters.tags.length > 0) {
            filtered = filtered.filter(user => {
                if (!user.tags || user.tags.length === 0) return false;
                return this.currentFilters.tags.some(tag => user.tags.includes(tag));
            });
        }

        this.users = filtered;
        this.renderUserList();
        this.updateUserCount();
        this.updateFilterBadge();
    }

    clearAllFilters() {
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };

        // Reset UI
        const userSearch = document.getElementById('userSearch');
        if (userSearch) userSearch.value = '';

        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === 'all') {
                btn.classList.add('active');
            }
        });

        // Clear tag filters
        const tagFilterBtns = document.querySelectorAll('.tag-filter-btn');
        tagFilterBtns.forEach(btn => btn.classList.remove('active'));

        this.applyFilters();
    }

    updateFilterBadge() {
        const badge = document.getElementById('filterActiveBadge');
        if (!badge) return;

        let activeCount = 0;
        if (this.currentFilters.status !== 'all') activeCount++;
        if (this.currentFilters.tags.length > 0) activeCount += this.currentFilters.tags.length;
        if (this.currentFilters.search) activeCount++;

        if (activeCount > 0) {
            badge.textContent = activeCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    toggleTagFilter(tag) {
        const index = this.currentFilters.tags.indexOf(tag);
        if (index > -1) {
            this.currentFilters.tags.splice(index, 1);
        } else {
            this.currentFilters.tags.push(tag);
        }
        this.applyFilters();
    }

    // ========== Tag Management Methods ==========

    async loadAvailableTags() {
        try {
            const response = await fetch('/admin/chat/available-tags');
            const data = await response.json();

            if (data.success) {
                this.availableTags = data.tags || [];
                this.renderTagFilters();
            }
        } catch (error) {
            console.error('Error loading available tags:', error);
        }
    }

    renderTagFilters() {
        const tagFilters = document.getElementById('tagFilters');
        if (!tagFilters) return;

        if (this.availableTags.length === 0) {
            tagFilters.innerHTML = '<span class="text-muted small">ไม่มีแท็กในระบบ</span>';
            return;
        }

        const html = this.availableTags.slice(0, 10).map(tagInfo => {
            const isActive = this.currentFilters.tags.includes(tagInfo.tag);
            const colorClass = this.getTagColorClass(tagInfo.tag);
            return `
                <button class="btn btn-sm btn-outline-secondary tag-filter-btn ${isActive ? 'active' : ''}" 
                        data-tag="${this.escapeAttribute(tagInfo.tag)}"
                        onclick="chatManager.toggleTagFilter('${this.escapeAttribute(tagInfo.tag)}')">
                    <i class="fas fa-tag"></i> ${this.escapeHtml(tagInfo.tag)} (${tagInfo.count})
                </button>
            `;
        }).join('');

        tagFilters.innerHTML = html;
    }

    async openTagModal(userId) {
        const user = this.allUsers.find(u => u.userId === userId);
        if (!user) return;

        this.currentUserId = userId;

        // Update modal content
        const modalUserName = document.getElementById('tagModalUserName');
        if (modalUserName) {
            modalUserName.textContent = user.displayName || userId;
        }

        // Load current tags
        try {
            const response = await fetch(`/admin/chat/tags/${userId}`);
            const data = await response.json();

            if (data.success) {
                this.renderCurrentTags(data.tags || []);
            }
        } catch (error) {
            console.error('Error loading user tags:', error);
        }

        // Load popular tags
        this.renderPopularTags();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('tagModal'));
        modal.show();
    }

    renderCurrentTags(tags) {
        const container = document.getElementById('currentTags');
        if (!container) return;

        if (tags.length === 0) {
            container.innerHTML = '<span class="text-muted small">ยังไม่มีแท็ก</span>';
            return;
        }

        const html = tags.map(tag => {
            const colorClass = this.getTagColorClass(tag);
            return `
                <span class="badge ${colorClass} tag-pill">
                    ${this.escapeHtml(tag)}
                    <i class="fas fa-times ms-1 cursor-pointer" 
                       onclick="chatManager.removeTag('${this.escapeAttribute(tag)}')"></i>
                </span>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderPopularTags() {
        const container = document.getElementById('popularTags');
        if (!container) return;

        if (this.availableTags.length === 0) {
            container.innerHTML = '<span class="text-muted small">ไม่มีแท็กที่ใช้บ่อย</span>';
            return;
        }

        const html = this.availableTags.slice(0, 8).map(tagInfo => {
            const colorClass = this.getTagColorClass(tagInfo.tag);
            return `
                <button class="btn btn-sm ${colorClass} tag-suggestion"
                        onclick="chatManager.quickAddTag('${this.escapeAttribute(tagInfo.tag)}')">
                    <i class="fas fa-plus-circle me-1"></i>${this.escapeHtml(tagInfo.tag)}
                </button>
            `;
        }).join('');

        container.innerHTML = html;
    }

    async addNewTag() {
        const input = document.getElementById('newTagInput');
        if (!input) return;

        const tagName = input.value.trim();
        if (!tagName) return;

        await this.quickAddTag(tagName);
        input.value = '';
    }

    async quickAddTag(tagName) {
        if (!this.currentUserId) return;

        try {
            // Get current tags
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`);
            const data = await response.json();

            if (!data.success) {
                this.showToast('ไม่สามารถโหลดแท็กได้', 'error');
                return;
            }

            const currentTags = data.tags || [];
            if (currentTags.includes(tagName)) {
                this.showToast('มีแท็กนี้อยู่แล้ว', 'warning');
                return;
            }

            const newTags = [...currentTags, tagName];
            await this.saveTags(newTags);
        } catch (error) {
            console.error('Error adding tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async removeTag(tagName) {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`);
            const data = await response.json();

            if (!data.success) return;

            const currentTags = data.tags || [];
            const newTags = currentTags.filter(t => t !== tagName);
            await this.saveTags(newTags);
        } catch (error) {
            console.error('Error removing tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async saveTags(tags) {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags })
            });

            const data = await response.json();
            if (data.success) {
                this.renderCurrentTags(data.tags || []);
                this.loadUsers(); // Refresh user list
                this.loadAvailableTags(); // Refresh available tags
                this.showToast('บันทึกแท็กเรียบร้อย', 'success');
            } else {
                this.showToast('ไม่สามารถบันทึกแท็กได้', 'error');
            }
        } catch (error) {
            console.error('Error saving tags:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async togglePurchaseStatus(userId) {
        const user = this.allUsers.find(u => u.userId === userId);
        if (!user) return;

        const newStatus = !user.hasPurchased;

        try {
            const response = await fetch(`/admin/chat/purchase-status/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hasPurchased: newStatus })
            });

            const data = await response.json();
            if (data.success) {
                user.hasPurchased = newStatus;
                this.applyFilters();
                if (this.currentUserId === userId) {
                    this.updateChatHeader(user);
                }
                this.showToast(
                    newStatus ? 'ทำเครื่องหมายว่าเคยซื้อแล้ว' : 'ยกเลิกเครื่องหมายการซื้อ',
                    'success'
                );
            } else {
                this.showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
            }
        } catch (error) {
            console.error('Error toggling purchase status:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    getTagColorClass(tag) {
        // สุ่มสีตามชื่อแท็ก (consistent)
        const colors = [
            'bg-primary', 'bg-success', 'bg-info', 'bg-warning',
            'bg-danger', 'bg-secondary', 'bg-dark'
        ];
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    async selectUser(userId) {
        if (this.currentUserId === userId) return;

        this.currentUserId = userId;

        // Update UI: toggle active state using data attribute selector
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });
        const currentItem = document.querySelector(`.user-item[onclick*="${userId}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
        }

        const mobileQuery = this.mobileMediaQuery || window.matchMedia('(max-width: 991.98px)');
        if (mobileQuery.matches) {
            this.closeSidebarForMobile();
        }

        // Update chat header
        const user = this.users.find(u => u.userId === userId);
        if (user) {
            // ดึงสถานะล่าสุดจากเซิร์ฟเวอร์ก่อนแสดง
            try {
                const res = await fetch(`/admin/chat/user-status/${userId}`);
                const data = await res.json();
                if (data.success) user.aiEnabled = !!data.aiEnabled;
            } catch (_) { }
            this.updateChatHeader(user);
        }

        // Show message input
        document.getElementById('messageInputContainer').style.display = 'block';

        // Load chat history
        await this.loadChatHistory(userId);

        // Load orders for current user
        await this.renderOrderSidebar();
    }

    updateChatHeader(user) {
        const chatHeader = document.getElementById('chatHeader');

        const aiOn = !!user.aiEnabled;
        const aiBtnClass = aiOn ? 'btn-outline-success' : 'btn-outline-secondary';
        const aiIcon = aiOn ? 'fa-toggle-on text-success' : 'fa-toggle-off text-secondary';
        const aiLabel = aiOn ? 'AI กำลังเปิด' : 'AI ปิดอยู่';
        const displayName = user.displayName || `${user.userId.slice(0, 6)}...`;
        const initials = displayName.charAt(0).toUpperCase();
        const messageCount = Number.isFinite(user.messageCount) ? user.messageCount : 0;
        const updatedLabel = user.followUpUpdatedAt ? this.formatTimestamp(user.followUpUpdatedAt) : '';
        const showFollowUp = (user.followUp && typeof user.followUp.showInChat === 'boolean')
            ? user.followUp.showInChat
            : this.followUpOptions.showInChat;
        const shouldShowFollowUp = showFollowUp && user.hasFollowUp;

        // Purchase status
        const purchasedBtnClass = user.hasPurchased ? 'btn-success' : 'btn-outline-secondary';
        const purchasedIcon = user.hasPurchased ? 'fa-check-circle' : 'fa-shopping-cart';
        const purchasedText = user.hasPurchased ? 'เคยซื้อแล้ว' : 'ยังไม่ซื้อ';

        // Tags display
        let tagsHtml = '';
        if (user.tags && user.tags.length > 0) {
            tagsHtml = `<div class="user-tags mt-1">`;
            user.tags.slice(0, 5).forEach(tag => {
                const colorClass = this.getTagColorClass(tag);
                tagsHtml += `<span class="badge ${colorClass} me-1" style="font-size: 0.7rem;">${this.escapeHtml(tag)}</span>`;
            });
            if (user.tags.length > 5) {
                tagsHtml += `<span class="badge bg-secondary me-1" style="font-size: 0.7rem;">+${user.tags.length - 5}</span>`;
            }
            tagsHtml += `</div>`;
        }

        const followUpInfo = shouldShowFollowUp ? `
            <div class="followup-info mt-1">
                <span class="badge followup-badge me-2">ติดตามลูกค้า</span>
                <small class="text-muted">
                    ${this.escapeHtml(user.followUpReason || 'ลูกค้ายืนยันสั่งซื้อแล้ว')}
                    ${updatedLabel ? '• อัปเดต ' + updatedLabel : ''}
                </small>
            </div>
        ` : '';

        chatHeader.innerHTML = `
            <div class="header-content">
                <div class="user-info">
                    <div class="user-avatar ${user.hasPurchased ? 'purchased-avatar' : ''}">
                        ${this.escapeHtml(initials)}
                        ${user.hasPurchased ? '<i class="fas fa-check-circle purchased-check"></i>' : ''}
                    </div>
                    <div class="user-details">
                        <h6 class="mb-0">${this.escapeHtml(displayName)}</h6>
                        <small class="text-muted">${messageCount} ข้อความ • <span id="aiStatusLabel">${aiLabel}</span></small>
                        ${tagsHtml}
                        ${followUpInfo}
                    </div>
                </div>
                <div class="header-actions" id="headerActions">
                    <button class="btn btn-sm ${purchasedBtnClass} me-2" 
                            onclick="chatManager.togglePurchaseStatus('${user.userId}')" 
                            title="สลับสถานะการซื้อ">
                        <i class="fas ${purchasedIcon} me-1"></i>${purchasedText}
                    </button>
                    <button class="btn btn-sm btn-outline-primary me-2" 
                            onclick="chatManager.openTagModal('${user.userId}')" 
                            title="จัดการแท็ก">
                        <i class="fas fa-tags me-1"></i>แท็ก
                    </button>
                    <button class="btn btn-sm ${aiBtnClass} me-2" id="toggleAiBtn" title="สลับสถานะ AI">
                        <i class="fas ${aiIcon} me-1"></i><span id="toggleAiText">${aiOn ? 'ปิด AI' : 'เปิด AI'}</span>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="chatManager.clearUserChat()">
                        <i class="fas fa-trash me-1"></i>ล้าง
                    </button>
                </div>
            </div>
        `;
        // bind toggle
        setTimeout(() => {
            const btn = document.getElementById('toggleAiBtn');
            if (btn) {
                btn.addEventListener('click', async () => {
                    await this.toggleAiForCurrent();
                });
            }
        }, 0);
    }

    async loadChatHistory(userId) {
        try {
            const response = await fetch(`/admin/chat/history/${userId}`);
            const data = await response.json();

            if (data.success) {
                this.chatHistory[userId] = data.messages;
                this.renderChatHistory(userId);
            } else {
                console.error('ไม่สามารถโหลดประวัติการสนทนาได้:', data.error);
                this.showToast('ไม่สามารถโหลดประวัติการสนทนาได้', 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการโหลดประวัติการสนทนา:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดประวัติ', 'error');
        }
    }

    renderChatHistory(userId) {
        const container = document.getElementById('messagesContainer');
        const messages = this.chatHistory[userId] || [];

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h6>ไม่มีประวัติการสนทนา</h6>
                    <p>เริ่มการสนทนาโดยการส่งข้อความ</p>
                </div>
            `;
            return;
        }

        const chatHtml = messages.map(message => {
            const messageClass = message.role === 'user' ? 'user' :
                message.source === 'admin_chat' ? 'admin' : 'assistant';
            const senderLabel = message.role === 'user' ? 'ผู้ใช้' :
                message.source === 'admin_chat' ? 'แอดมิน' : 'AI Assistant';

            // Normalize base content
            const baseContent = (message && (message.content ?? message.text ?? message.message)) || '';

            // Process message content
            let displayContent = baseContent;
            if (message.role !== 'user' && displayContent.includes('<reply>')) {
                const replyMatch = displayContent.match(/<reply>(.*?)<\/reply>/s);
                if (replyMatch) {
                    displayContent = replyMatch[1].trim();
                }
            }

            // ใช้ข้อมูลที่แปลงแล้วจาก backend
            if (message.displayContent) {
                // ถ้ามี displayContent ที่แปลงแล้ว ให้จัดรูปแบบเพิ่มเติมก่อนแสดง
                displayContent = this.formatDisplayContent(message.displayContent);
            } else {
                // fallback สำหรับข้อความเก่า
                if (message.role === 'user') {
                    const processed = this.processQueueMessage(baseContent);
                    if (processed.type === 'queue' || processed.type === 'single_image' || processed.type === 'single_text') {
                        displayContent = this.createCompactMessageHTML(processed);
                    } else {
                        const raw = typeof baseContent === 'string' ? baseContent : JSON.stringify(baseContent);
                        const safe = (raw || '').trim();
                        displayContent = safe ? `<div class="message-text">${this.escapeHtml(safe)}</div>` : '';
                    }
                } else {
                    const raw = typeof displayContent === 'string' ? displayContent : '';
                    const safe = (raw || '').trim();
                    // ใช้ escapeHtml ที่รองรับการเว้นบรรทัด
                    displayContent = safe ? `<div class="message-text">${this.escapeHtml(safe)}</div>` : '';
                }
            }

            return `
                <div class="message ${messageClass}">
                    <div class="message-header">
                        <i class="fas fa-user"></i>
                        <span>${senderLabel}</span>
                    </div>
                    <div class="message-content">
                        ${displayContent}
                    </div>
                    <div class="message-timestamp">${this.formatTimestamp(message.timestamp)}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = chatHtml;
        this.scrollToBottom();
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const messageText = messageInput.value.trim();

        if (!messageText || !this.currentUserId) return;

        try {
            const response = await fetch('/admin/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    message: messageText
                })
            });

            const data = await response.json();
            if (data.success) {
                // ถ้าเป็นคำสั่งควบคุมจากแอดมิน ให้ข้ามการ echo ฝั่ง client และรอ socket update
                if (data.skipEcho) {
                    // Clear input only
                    messageInput.value = '';
                    document.getElementById('charCount').textContent = '0';
                    this.autoResizeTextarea(messageInput);
                    this.loadUsers();
                    this.showToast(data.control ? (data.displayMessage || 'อัปเดตสถานะผู้ใช้แล้ว') : 'ส่งข้อความสำเร็จ', 'success');
                    return;
                }

                // Add new message to history
                const newMessage = {
                    content: data.control && data.displayMessage ? `[ระบบ] ${data.displayMessage}` : messageText,
                    role: 'assistant',
                    timestamp: new Date(),
                    source: 'admin_chat'
                };

                if (!this.chatHistory[this.currentUserId]) {
                    this.chatHistory[this.currentUserId] = [];
                }
                this.chatHistory[this.currentUserId].push(newMessage);

                // Update display
                this.renderChatHistory(this.currentUserId);

                // Clear input
                messageInput.value = '';
                document.getElementById('charCount').textContent = '0';
                this.autoResizeTextarea(messageInput); // รีเซ็ตขนาด textarea

                // Update user list
                this.loadUsers();

                this.showToast('ส่งข้อความสำเร็จ', 'success');
            } else {
                this.showToast('ไม่สามารถส่งข้อความได้: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการส่งข้อความ:', error);
            this.showToast('เกิดข้อผิดพลาดในการส่งข้อความ', 'error');
        }
    }

    handleNewMessage(data) {
        // Update unread count for user
        const user = this.users.find(u => u.userId === data.userId);
        if (user) {
            if (data.sender === 'user') {
                user.unreadCount = (user.unreadCount || 0) + 1;
            }
            user.lastMessage = this.normalizeContentToPreview(data.message?.content);
            user.lastTimestamp = data.timestamp || data.message?.timestamp || new Date().toISOString();

            // Update display
            this.renderUserList();

            // If it's the current user, update chat
            if (data.userId === this.currentUserId) {
                if (!this.chatHistory[this.currentUserId]) {
                    this.chatHistory[this.currentUserId] = [];
                }
                this.chatHistory[this.currentUserId].push(data.message);
                this.renderChatHistory(this.currentUserId);
            }
        }
    }

    handleFollowUpTagged(data) {
        if (!data || !data.userId) return;
        const user = this.users.find(u => u.userId === data.userId);
        if (user) {
            user.hasFollowUp = !!data.hasFollowUp;
            user.followUpReason = data.followUpReason || '';
            user.followUpUpdatedAt = data.followUpUpdatedAt || null;
            this.renderUserList();
            if (this.currentUserId === data.userId) {
                this.updateChatHeader(user);
            }
        } else if (data.hasFollowUp) {
            // โหลดใหม่กรณีผู้ใช้ยังไม่อยู่ในรายการ
            this.loadUsers();
        }

        if (this.followUpOptions.showInChat && data.hasFollowUp) {
            this.showToast('ตรวจพบลูกค้ายืนยันการสั่งซื้อ', 'info');
        }
    }

    async clearUserChat() {
        if (!this.currentUserId) return;

        if (!confirm('คุณแน่ใจหรือไม่ที่จะล้างประวัติการสนทนาของผู้ใช้นี้?')) {
            return;
        }

        try {
            const response = await fetch(`/admin/chat/clear/${this.currentUserId}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                this.clearChatDisplay();
                this.loadUsers();
                this.showToast('ล้างประวัติการสนทนาเรียบร้อยแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถล้างประวัติการสนทนาได้: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการล้างประวัติการสนทนา:', error);
            this.showToast('เกิดข้อผิดพลาดในการล้างประวัติ', 'error');
        }
    }

    clearChatDisplay() {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h5>ยินดีต้อนรับสู่ระบบแชท</h5>
                <p>เลือกผู้ใช้จากรายชื่อด้านซ้ายเพื่อเริ่มการสนทนา</p>
            </div>
        `;

        document.getElementById('messageInputContainer').style.display = 'none';

        const chatHeader = document.getElementById('chatHeader');
        chatHeader.innerHTML = `
            <div class="header-content">
                <div class="user-info">
                    <div class="user-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="user-details">
                        <h6 class="mb-0">เลือกผู้ใช้เพื่อเริ่มการสนทนา</h6>
                        <small class="text-muted">0 ข้อความ</small>
                    </div>
                </div>
            </div>
        `;

        this.currentUserId = null;
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        container.scrollTop = container.scrollHeight;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
        if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
        if (diffDays < 7) return `${diffDays} วันที่แล้ว`;

        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        if (!text) return '';

        // แปลงการเว้นบรรทัดเป็น <br> และ <p>
        const div = document.createElement('div');
        div.textContent = text;
        let html = div.innerHTML;

        // แปลง \n เป็น <br> สำหรับการเว้นบรรทัด
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    formatDisplayContent(content) {
        if (content === null || content === undefined) {
            return '';
        }

        const strContent = String(content);
        const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(strContent);

        if (hasHtmlTag) {
            // คงโครงสร้างเดิมไว้แต่ปรับการเว้นบรรทัดเพิ่มเติม
            return strContent.replace(/\n/g, '<br>');
        }

        return `<div class="message-text">${this.escapeHtml(strContent)}</div>`;
    }

    escapeAttribute(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Image handling methods
    openImageModal(imageSrc) {
        const modal = new bootstrap.Modal(document.getElementById('imageModal'));
        const modalImage = document.getElementById('modalImage');

        modalImage.src = imageSrc;
        this.currentImageSrc = imageSrc;
        modal.show();
    }

    downloadImage() {
        if (!this.currentImageSrc) return;

        const link = document.createElement('a');
        link.href = this.currentImageSrc;
        link.download = 'line_image.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast('ดาวน์โหลดรูปภาพเรียบร้อยแล้ว', 'success');
    }

    async copyImage() {
        if (!this.currentImageSrc) return;

        try {
            const response = await fetch(this.currentImageSrc);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);

            this.showToast('คัดลอกรูปภาพเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('ไม่สามารถคัดลอกรูปภาพได้:', error);
            this.showToast('ไม่สามารถคัดลอกรูปภาพได้', 'error');
        }
    }

    // Message processing methods
    normalizeContentToPreview(content) {
        try {
            // If string, try to parse JSON; otherwise return trimmed string
            if (typeof content === 'string') {
                const trimmed = content.trim();
                if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
                    const parsed = JSON.parse(trimmed);
                    const processed = this.processQueueMessage(parsed);
                    const text = (processed.textParts || []).join(' ').trim(); // ใช้ space สำหรับ preview
                    if (text) return text;
                    if (processed.imageParts && processed.imageParts.length > 0) {
                        return 'ส่งรูปภาพ';
                    }
                    return trimmed;
                }
                return trimmed;
            }
            // If array/object, reuse processor
            const processed = this.processQueueMessage(content);
            const text = (processed.textParts || []).join(' ').trim(); // ใช้ space สำหรับ preview
            if (text) return text;
            if (processed.imageParts && processed.imageParts.length > 0) {
                return 'ส่งรูปภาพ';
            }
            return '';
        } catch (_) {
            try { return JSON.stringify(content).substring(0, 100); } catch { return ''; }
        }
    }
    processQueueMessage(content) {
        // Accept string, object, or array
        let payload = content;
        try {
            if (typeof payload === 'string') {
                const trimmed = payload.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    payload = JSON.parse(trimmed);
                } else {
                    // Plain text string
                    return { textParts: [payload], imageParts: [], type: 'single_text' };
                }
            }
        } catch (e) {
            // Not JSON, treat as plain text
            return { textParts: [String(content || '')], imageParts: [], type: 'single_text' };
        }

        // If array, collect parts
        if (Array.isArray(payload)) {
            const textParts = [];
            const imageParts = [];
            payload.forEach(item => {
                const data = item && item.data ? item.data : item;
                if (!data) return;
                if (data.type === 'text' && data.text) {
                    textParts.push(data.text);
                } else if (data.type === 'image' && data.base64) {
                    imageParts.push(data);
                }
            });
            return { textParts, imageParts, type: 'queue' };
        }

        // If object with data wrapper
        if (payload && typeof payload === 'object') {
            const data = payload.data || payload;
            if (data.type === 'image' && data.base64) {
                return { textParts: [], imageParts: [data], type: 'single_image' };
            }
            if (data.type === 'text' && data.text) {
                return { textParts: [data.text], imageParts: [], type: 'single_text' };
            }
        }

        return { textParts: [], imageParts: [], type: 'unknown' };
    }

    createImageMessageHTML(imageData, index = 0) {
        let base64Data = imageData.base64;
        let mimeType = "image/jpeg";
        let imageSrc = "";

        // ตรวจสอบว่า base64 มี Data URL prefix อยู่แล้วหรือไม่
        const dataUrlMatch = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
        if (dataUrlMatch) {
            // มี prefix อยู่แล้ว ใช้ตรงๆ
            mimeType = dataUrlMatch[1];
            base64Data = dataUrlMatch[2];
            imageSrc = imageData.base64;
        } else {
            // ไม่มี prefix ต้องตรวจจับ MIME type จาก signature
            const trimmed = base64Data.trim();
            if (trimmed.startsWith("/9j/")) {
                mimeType = "image/jpeg";
            } else if (trimmed.startsWith("iVBORw0KGgo")) {
                mimeType = "image/png";
            } else if (trimmed.startsWith("R0lGOD")) {
                mimeType = "image/gif";
            } else if (trimmed.startsWith("UklGR")) {
                mimeType = "image/webp";
            }
            imageSrc = `data:${mimeType};base64,${base64Data}`;
        }

        const base64Size = Math.ceil((base64Data.length * 3) / 4);
        const sizeKB = (base64Size / 1024).toFixed(1);
        const formatName = mimeType.split("/")[1].toUpperCase();

        return `
            <div class="message-image">
                <img src="${imageSrc}" 
                     alt="รูปภาพจากผู้ใช้ ${index + 1}" 
                     onclick="chatManager.openImageModal(this.src)"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div class="image-error-fallback" style="display: none;">
                    <i class="fas fa-image text-muted"></i>
                    <div class="text-muted small">ไม่สามารถแสดงรูปภาพได้</div>
                </div>
                <div class="image-info">
                    <small class="text-muted">
                        <i class="fas fa-image me-1"></i>
                        รูปภาพ ${formatName} (${sizeKB} KB)
                    </small>
                </div>
            </div>
        `;
    }

    createCompactMessageHTML(processed) {
        let contentHtml = '';

        // Show text
        if (processed.textParts.length > 0) {
            const textContent = processed.textParts.join('\n'); // ใช้ \n แทน space เพื่อรักษาการเว้นบรรทัด
            if (textContent.trim()) {
                contentHtml += `<div class="message-text">${this.escapeHtml(textContent)}</div>`;
            }
        }

        // Show images
        if (processed.imageParts.length > 0) {
            if (processed.imageParts.length === 1) {
                contentHtml += this.createImageMessageHTML(processed.imageParts[0]);
            } else {
                contentHtml += '<div class="image-grid">';
                processed.imageParts.forEach((imageData, index) => {
                    const imageSrc = this.getImageSrc(imageData.base64);
                    contentHtml += `
                        <img src="${imageSrc}" 
                             alt="รูปภาพ ${index + 1}" 
                             onclick="chatManager.openImageModal(this.src)"
                             onerror="this.style.display='none';">
                    `;
                });
                contentHtml += '</div>';
                contentHtml += `<div class="image-info">
                    <small class="text-muted">
                        <i class="fas fa-images me-1"></i>
                        รูปภาพ ${processed.imageParts.length} รูป
                    </small>
                </div>`;
            }
        }

        return contentHtml;
    }

    // Helper function สำหรับสร้าง image src ที่รองรับ Data URL และตรวจจับ MIME type
    getImageSrc(base64Data) {
        if (!base64Data) return '';

        // ตรวจสอบว่า base64 มี Data URL prefix อยู่แล้วหรือไม่
        const dataUrlMatch = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
        if (dataUrlMatch) {
            return base64Data; // มี prefix อยู่แล้ว ใช้ตรงๆ
        }

        // ไม่มี prefix ต้องตรวจจับ MIME type จาก signature
        let mimeType = "image/jpeg";
        const trimmed = base64Data.trim();
        if (trimmed.startsWith("/9j/")) {
            mimeType = "image/jpeg";
        } else if (trimmed.startsWith("iVBORw0KGgo")) {
            mimeType = "image/png";
        } else if (trimmed.startsWith("R0lGOD")) {
            mimeType = "image/gif";
        } else if (trimmed.startsWith("UklGR")) {
            mimeType = "image/webp";
        }
        return `data:${mimeType};base64,${base64Data}`;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastBody = document.getElementById('toastBody');
        const toastHeader = toast.querySelector('.toast-header');

        toastBody.textContent = message;

        // Update toast styling based on type
        toast.className = `toast ${type}`;

        const icon = toastHeader.querySelector('i');
        icon.className = `fas ${type === 'success' ? 'fa-check-circle text-success' :
            type === 'error' ? 'fa-exclamation-circle text-danger' :
                type === 'warning' ? 'fa-exclamation-triangle text-warning' :
                    'fa-info-circle text-primary'
            } me-2`;

        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    setupAutoRefresh() {
        // ✅ ใช้ Smart Poller แทน setInterval
        this.smartPoller = new window.performanceUtils.SmartPoller(
            () => this.loadUsers(),
            30000 // 30 วินาที
        );
        this.smartPoller.start();
    }

    // ==================== NEW FEATURES ====================

    // ========== 1. Quick Replies & Templates ==========

    setupTemplateListeners() {
        // Template Modal - Save button
        const saveTemplateBtn = document.getElementById('saveTemplateBtn');
        if (saveTemplateBtn) {
            saveTemplateBtn.addEventListener('click', () => {
                this.saveTemplate();
            });
        }

        // Add Template Modal - Confirm button
        const confirmAddTemplateBtn = document.getElementById('confirmAddTemplateBtn');
        if (confirmAddTemplateBtn) {
            confirmAddTemplateBtn.addEventListener('click', () => {
                this.confirmAddTemplate();
            });
        }

        // Template search input
        const templateSearch = document.getElementById('templateSearch');
        if (templateSearch) {
            templateSearch.addEventListener('input', (e) => {
                this.filterTemplates(e.target.value);
            });
        }

        // Listen for modal close to reset form
        const addTemplateModal = document.getElementById('addTemplateModal');
        if (addTemplateModal) {
            addTemplateModal.addEventListener('hidden.bs.modal', () => {
                this.resetTemplateForm();
            });
        }
    }

    async loadQuickReplies() {
        try {
            const response = await fetch('/admin/chat/templates');
            if (!response.ok) throw new Error('Failed to load templates');

            const data = await response.json();
            this.quickReplies = data.templates || [];
            this.renderQuickReplies();
            this.renderTemplateList();
        } catch (error) {
            console.error('Error loading quick replies:', error);
            // Use default templates if server fails
            this.quickReplies = this.getDefaultTemplates();
            this.renderQuickReplies();
            this.renderTemplateList();
        }
    }

    getDefaultTemplates() {
        return [
            { id: 'welcome', title: 'ทักทาย', message: 'สวัสดีครับ! ยินดีให้บริการครับ 😊' },
            { id: 'thanks', title: 'ขอบคุณ', message: 'ขอบคุณมากครับที่ติดต่อเรา' },
            { id: 'wait', title: 'รอสักครู่', message: 'กรุณารอสักครู่นะครับ กำลังตรวจสอบข้อมูลให้' },
            { id: 'confirm', title: 'รับทราบ', message: 'รับทราบข้อมูลแล้วครับ จะดำเนินการให้เร็วที่สุด' }
        ];
    }

    renderQuickReplies() {
        const quickRepliesBar = document.getElementById('quickRepliesBar');
        if (!quickRepliesBar || !this.currentUserId) {
            return;
        }

        const scrollContainer = quickRepliesBar.querySelector('.quick-replies-scroll');
        if (!scrollContainer) return;

        // Clear existing buttons except the first one (add template button)
        const addBtn = scrollContainer.querySelector('.quick-reply-btn');
        scrollContainer.innerHTML = '';
        if (addBtn) {
            scrollContainer.appendChild(addBtn);
        }

        // Add quick reply buttons
        this.quickReplies.forEach(template => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = template.title;
            btn.onclick = () => this.useQuickReply(template.message);
            scrollContainer.appendChild(btn);
        });

        // Show the quick replies bar
        quickRepliesBar.style.display = 'flex';
    }

    useQuickReply(message) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = message;
            messageInput.focus();
            // Update character count
            const charCount = document.getElementById('charCount');
            if (charCount) {
                charCount.textContent = message.length;
            }
        }
    }

    openTemplateModal() {
        const modal = new bootstrap.Modal(document.getElementById('templateModal'));
        modal.show();
        this.renderTemplateList();
    }

    renderTemplateList() {
        const list = document.getElementById('templateList');
        if (!list) return;

        if (this.quickReplies.length === 0) {
            list.innerHTML = '<div class="text-center text-muted py-4">ยังไม่มี Template</div>';
            return;
        }

        list.innerHTML = this.quickReplies.map(template => `
            <div class="template-item" data-id="${template.id}">
                <div class="template-content">
                    <div class="template-title">${this.escapeHtml(template.title)}</div>
                    <div class="template-preview">${this.escapeHtml(template.message)}</div>
                </div>
                <div class="template-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="chatManager.editTemplate('${template.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="chatManager.deleteTemplate('${template.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    filterTemplates(searchTerm) {
        const items = document.querySelectorAll('.template-item');
        const term = searchTerm.toLowerCase();

        items.forEach(item => {
            const title = item.querySelector('.template-title').textContent.toLowerCase();
            const preview = item.querySelector('.template-preview').textContent.toLowerCase();

            if (title.includes(term) || preview.includes(term)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    openAddTemplateModal() {
        this.currentEditingTemplateId = null;
        document.getElementById('addTemplateModalLabel').textContent = 'เพิ่ม Template ใหม่';
        document.getElementById('templateTitleInput').value = '';
        document.getElementById('templateMessageInput').value = '';

        const addModal = new bootstrap.Modal(document.getElementById('addTemplateModal'));
        addModal.show();
    }

    editTemplate(templateId) {
        const template = this.quickReplies.find(t => t.id === templateId);
        if (!template) return;

        this.currentEditingTemplateId = templateId;
        document.getElementById('addTemplateModalLabel').textContent = 'แก้ไข Template';
        document.getElementById('templateTitleInput').value = template.title;
        document.getElementById('templateMessageInput').value = template.message;

        // Close template modal and open add/edit modal
        const templateModal = bootstrap.Modal.getInstance(document.getElementById('templateModal'));
        if (templateModal) templateModal.hide();

        const addModal = new bootstrap.Modal(document.getElementById('addTemplateModal'));
        addModal.show();
    }

    async deleteTemplate(templateId) {
        if (!confirm('ต้องการลบ Template นี้หรือไม่?')) return;

        try {
            const response = await fetch(`/admin/chat/templates/${templateId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.quickReplies = this.quickReplies.filter(t => t.id !== templateId);
                this.renderQuickReplies();
                this.renderTemplateList();
                window.showSuccess('ลบ Template สำเร็จ');
            } else {
                throw new Error('Failed to delete template');
            }
        } catch (error) {
            console.error('Error deleting template:', error);
            // Fallback: delete locally
            this.quickReplies = this.quickReplies.filter(t => t.id !== templateId);
            this.renderQuickReplies();
            this.renderTemplateList();
            window.showSuccess('ลบ Template สำเร็จ');
        }
    }

    async confirmAddTemplate() {
        const title = document.getElementById('templateTitleInput').value.trim();
        const message = document.getElementById('templateMessageInput').value.trim();

        if (!title || !message) {
            window.showError('กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        const templateData = {
            id: this.currentEditingTemplateId || 'template_' + Date.now(),
            title,
            message
        };

        try {
            const url = this.currentEditingTemplateId
                ? `/admin/chat/templates/${this.currentEditingTemplateId}`
                : '/admin/chat/templates';

            const response = await fetch(url, {
                method: this.currentEditingTemplateId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            });

            if (response.ok) {
                if (this.currentEditingTemplateId) {
                    const index = this.quickReplies.findIndex(t => t.id === this.currentEditingTemplateId);
                    if (index !== -1) {
                        this.quickReplies[index] = templateData;
                    }
                } else {
                    this.quickReplies.push(templateData);
                }

                this.renderQuickReplies();
                this.renderTemplateList();

                const addModal = bootstrap.Modal.getInstance(document.getElementById('addTemplateModal'));
                if (addModal) addModal.hide();

                window.showSuccess(this.currentEditingTemplateId ? 'แก้ไข Template สำเร็จ' : 'เพิ่ม Template สำเร็จ');
            } else {
                throw new Error('Failed to save template');
            }
        } catch (error) {
            console.error('Error saving template:', error);
            // Fallback: save locally
            if (this.currentEditingTemplateId) {
                const index = this.quickReplies.findIndex(t => t.id === this.currentEditingTemplateId);
                if (index !== -1) {
                    this.quickReplies[index] = templateData;
                }
            } else {
                this.quickReplies.push(templateData);
            }

            this.renderQuickReplies();
            this.renderTemplateList();

            const addModal = bootstrap.Modal.getInstance(document.getElementById('addTemplateModal'));
            if (addModal) addModal.hide();

            window.showSuccess(this.currentEditingTemplateId ? 'แก้ไข Template สำเร็จ' : 'เพิ่ม Template สำเร็จ');
        }
    }

    saveTemplate() {
        // This method is not used anymore, kept for backward compatibility
        const modal = bootstrap.Modal.getInstance(document.getElementById('templateModal'));
        if (modal) modal.hide();
    }

    resetTemplateForm() {
        this.currentEditingTemplateId = null;
        document.getElementById('templateTitleInput').value = '';
        document.getElementById('templateMessageInput').value = '';
    }

    // ========== 2. Chat Search ==========

    setupChatSearchListeners() {
        const searchChatBtn = document.getElementById('searchChatBtn');
        if (searchChatBtn) {
            searchChatBtn.addEventListener('click', () => {
                this.openChatSearch();
            });
        }

        const chatSearchInput = document.getElementById('chatSearchInput');
        if (chatSearchInput) {
            chatSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performChatSearch();
                }
            });
        }

        const prevResultBtn = document.getElementById('prevResultBtn');
        if (prevResultBtn) {
            prevResultBtn.addEventListener('click', () => {
                this.navigateChatSearchResults(-1);
            });
        }

        const nextResultBtn = document.getElementById('nextResultBtn');
        if (nextResultBtn) {
            nextResultBtn.addEventListener('click', () => {
                this.navigateChatSearchResults(1);
            });
        }
    }

    openChatSearch() {
        if (!this.currentUserId) {
            window.showError('กรุณาเลือกแชทก่อน');
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('chatSearchModal'));
        modal.show();

        // Focus on search input
        setTimeout(() => {
            const input = document.getElementById('chatSearchInput');
            if (input) input.focus();
        }, 300);
    }

    performChatSearch() {
        const searchTerm = document.getElementById('chatSearchInput').value.trim();
        if (!searchTerm) {
            window.showError('กรุณาใส่คำค้นหา');
            return;
        }

        const messages = this.chatHistory[this.currentUserId] || [];
        this.chatSearchResults = [];

        messages.forEach((msg, index) => {
            if (msg.text && msg.text.toLowerCase().includes(searchTerm.toLowerCase())) {
                this.chatSearchResults.push({ message: msg, index });
            }
        });

        const resultsCount = document.getElementById('searchResultsCount');
        if (this.chatSearchResults.length > 0) {
            this.currentSearchResultIndex = 0;
            resultsCount.textContent = `พบ ${this.chatSearchResults.length} ผลลัพธ์`;
            this.highlightSearchResult(this.currentSearchResultIndex);
            this.updateSearchNavigation();
        } else {
            resultsCount.textContent = 'ไม่พบผลลัพธ์';
            this.currentSearchResultIndex = -1;
            this.updateSearchNavigation();
        }
    }

    navigateChatSearchResults(direction) {
        if (this.chatSearchResults.length === 0) return;

        this.currentSearchResultIndex += direction;

        if (this.currentSearchResultIndex < 0) {
            this.currentSearchResultIndex = this.chatSearchResults.length - 1;
        } else if (this.currentSearchResultIndex >= this.chatSearchResults.length) {
            this.currentSearchResultIndex = 0;
        }

        this.highlightSearchResult(this.currentSearchResultIndex);
        this.updateSearchNavigation();
    }

    highlightSearchResult(resultIndex) {
        const result = this.chatSearchResults[resultIndex];
        if (!result) return;

        // Scroll to the message
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElements = messagesContainer.querySelectorAll('.message-item');

        // Remove previous highlights
        messageElements.forEach(el => el.classList.remove('search-highlight'));

        // Add highlight to current result
        if (messageElements[result.index]) {
            messageElements[result.index].classList.add('search-highlight');
            messageElements[result.index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    updateSearchNavigation() {
        const prevBtn = document.getElementById('prevResultBtn');
        const nextBtn = document.getElementById('nextResultBtn');
        const resultsCount = document.getElementById('searchResultsCount');

        if (this.chatSearchResults.length === 0) {
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
        } else {
            if (prevBtn) prevBtn.disabled = false;
            if (nextBtn) nextBtn.disabled = false;
            resultsCount.textContent = `${this.currentSearchResultIndex + 1} / ${this.chatSearchResults.length}`;
        }
    }

    // ========== 3. Message Forwarding ==========

    setupForwardListeners() {
        const forwardMessageBtn = document.getElementById('forwardMessageBtn');
        if (forwardMessageBtn) {
            forwardMessageBtn.addEventListener('click', () => {
                this.openForwardModal();
            });
        }

        const confirmForwardBtn = document.getElementById('confirmForwardBtn');
        if (confirmForwardBtn) {
            confirmForwardBtn.addEventListener('click', () => {
                this.confirmForward();
            });
        }

        const forwardUserSearch = document.getElementById('forwardUserSearch');
        if (forwardUserSearch) {
            forwardUserSearch.addEventListener('input', (e) => {
                this.filterForwardUsers(e.target.value);
            });
        }
    }

    openForwardModal() {
        if (!this.currentUserId) {
            window.showError('กรุณาเลือกแชทก่อน');
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('forwardModal'));
        modal.show();
        this.renderForwardUserList();
    }

    renderForwardUserList() {
        const list = document.getElementById('forwardUserList');
        if (!list) return;

        const otherUsers = this.allUsers.filter(u => u.userId !== this.currentUserId);

        if (otherUsers.length === 0) {
            list.innerHTML = '<div class="text-center text-muted py-4">ไม่มีผู้ใช้อื่น</div>';
            return;
        }

        list.innerHTML = otherUsers.map(user => `
            <div class="forward-user-item" data-userid="${user.userId}">
                <input type="checkbox" class="form-check-input" id="forward_${user.userId}" value="${user.userId}">
                <label class="form-check-label" for="forward_${user.userId}">
                    <div class="d-flex align-items-center">
                        <div class="user-avatar me-2">
                            ${user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                            <div>${this.escapeHtml(user.displayName || 'ไม่ทราบชื่อ')}</div>
                            <small class="text-muted">${user.userId}</small>
                        </div>
                    </div>
                </label>
            </div>
        `).join('');
    }

    filterForwardUsers(searchTerm) {
        const items = document.querySelectorAll('.forward-user-item');
        const term = searchTerm.toLowerCase();

        items.forEach(item => {
            const label = item.querySelector('label').textContent.toLowerCase();
            item.style.display = label.includes(term) ? '' : 'none';
        });
    }

    async confirmForward() {
        const selectedCheckboxes = document.querySelectorAll('#forwardUserList input[type="checkbox"]:checked');
        const targetUserIds = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (targetUserIds.length === 0) {
            window.showError('กรุณาเลือกผู้ใช้ที่จะส่งต่อข้อความ');
            return;
        }

        const messageToForward = document.getElementById('forwardMessagePreview').value.trim();
        if (!messageToForward) {
            // Get the last message from current chat
            const messages = this.chatHistory[this.currentUserId] || [];
            if (messages.length === 0) {
                window.showError('ไม่มีข้อความให้ส่งต่อ');
                return;
            }
        }

        try {
            const response = await fetch('/admin/chat/forward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromUserId: this.currentUserId,
                    toUserIds: targetUserIds,
                    message: messageToForward
                })
            });

            if (response.ok) {
                window.showSuccess(`ส่งต่อข้อความถึง ${targetUserIds.length} ผู้ใช้สำเร็จ`);
                const modal = bootstrap.Modal.getInstance(document.getElementById('forwardModal'));
                if (modal) modal.hide();
            } else {
                throw new Error('Failed to forward message');
            }
        } catch (error) {
            console.error('Error forwarding message:', error);
            window.showError('ไม่สามารถส่งต่อข้อความได้');
        }
    }

    // ========== 4. Chat Assignment ==========

    setupAssignmentListeners() {
        const assignChatBtn = document.getElementById('assignChatBtn');
        if (assignChatBtn) {
            assignChatBtn.addEventListener('click', () => {
                this.openAssignmentModal();
            });
        }

        const confirmAssignBtn = document.getElementById('confirmAssignBtn');
        if (confirmAssignBtn) {
            confirmAssignBtn.addEventListener('click', () => {
                this.confirmAssignment();
            });
        }
    }

    openAssignmentModal() {
        if (!this.currentUserId) {
            window.showError('กรุณาเลือกแชทก่อน');
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('assignmentModal'));
        modal.show();
        this.loadAdminList();
    }

    async loadAdminList() {
        const list = document.getElementById('assignAdminList');
        if (!list) return;

        try {
            const response = await fetch('/admin/users');
            if (response.ok) {
                const data = await response.json();
                const admins = data.admins || [];

                if (admins.length === 0) {
                    list.innerHTML = '<div class="text-center text-muted py-4">ไม่มีผู้ดูแลระบบ</div>';
                    return;
                }

                list.innerHTML = admins.map(admin => `
                    <div class="admin-item">
                        <input type="radio" class="form-check-input" name="assignAdmin" id="admin_${admin._id}" value="${admin._id}">
                        <label class="form-check-label" for="admin_${admin._id}">
                            <div class="d-flex align-items-center">
                                <div class="user-avatar me-2">
                                    ${admin.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div>${this.escapeHtml(admin.username)}</div>
                                    <small class="text-muted">${admin.email || ''}</small>
                                </div>
                            </div>
                        </label>
                    </div>
                `).join('');
            } else {
                throw new Error('Failed to load admins');
            }
        } catch (error) {
            console.error('Error loading admin list:', error);
            list.innerHTML = '<div class="text-center text-muted py-4">ไม่สามารถโหลดรายการผู้ดูแลได้</div>';
        }
    }

    async confirmAssignment() {
        const selectedRadio = document.querySelector('input[name="assignAdmin"]:checked');
        if (!selectedRadio) {
            window.showError('กรุณาเลือกผู้ดูแลระบบ');
            return;
        }

        const adminId = selectedRadio.value;

        try {
            const response = await fetch('/admin/chat/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    adminId: adminId
                })
            });

            if (response.ok) {
                window.showSuccess('มอบหมายแชทสำเร็จ');
                const modal = bootstrap.Modal.getInstance(document.getElementById('assignmentModal'));
                if (modal) modal.hide();
            } else {
                throw new Error('Failed to assign chat');
            }
        } catch (error) {
            console.error('Error assigning chat:', error);
            window.showError('ไม่สามารถมอบหมายแชทได้');
        }
    }

    // ========== 5. Chat Statistics ==========

    setupStatisticsListeners() {
        const showStatsBtn = document.getElementById('showStatsBtn');
        if (showStatsBtn) {
            showStatsBtn.addEventListener('click', () => {
                this.openStatisticsModal();
            });
        }
    }

    openStatisticsModal() {
        if (!this.currentUserId) {
            window.showError('กรุณาเลือกแชทก่อน');
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('statisticsModal'));
        modal.show();
        this.calculateStatistics();
    }

    calculateStatistics() {
        const messages = this.chatHistory[this.currentUserId] || [];

        const stats = {
            totalMessages: messages.length,
            userMessages: messages.filter(m => m.isUser).length,
            adminMessages: messages.filter(m => !m.isUser).length,
            firstMessageDate: messages.length > 0 ? new Date(messages[0].timestamp) : null,
            lastMessageDate: messages.length > 0 ? new Date(messages[messages.length - 1].timestamp) : null,
            avgResponseTime: this.calculateAvgResponseTime(messages),
            imagesCount: messages.filter(m => m.hasImage || (m.text && m.text.includes('data:image'))).length
        };

        this.renderStatistics(stats);
    }

    calculateAvgResponseTime(messages) {
        const responseTimes = [];

        for (let i = 1; i < messages.length; i++) {
            if (messages[i - 1].isUser && !messages[i].isUser) {
                const prevTime = new Date(messages[i - 1].timestamp);
                const currentTime = new Date(messages[i].timestamp);
                const diff = (currentTime - prevTime) / 1000 / 60; // in minutes
                responseTimes.push(diff);
            }
        }

        if (responseTimes.length === 0) return 0;

        const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        return Math.round(avg * 10) / 10; // round to 1 decimal
    }

    renderStatistics(stats) {
        const content = document.getElementById('statisticsContent');
        if (!content) return;

        const formatDate = (date) => {
            if (!date) return '-';
            return date.toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        content.innerHTML = `
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.totalMessages}</div>
                        <div class="stat-label">ข้อความทั้งหมด</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.userMessages}</div>
                        <div class="stat-label">ข้อความจากผู้ใช้</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.adminMessages}</div>
                        <div class="stat-label">ข้อความจากแอดมิน</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-image"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.imagesCount}</div>
                        <div class="stat-label">รูปภาพ</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.avgResponseTime} นาที</div>
                        <div class="stat-label">เวลาตอบกลับเฉลี่ย</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-value">${formatDate(stats.firstMessageDate)}</div>
                        <div class="stat-label">ข้อความแรก</div>
                    </div>
                </div>
            </div>
        `;
    }

    // ========== 6. Export Chat ==========

    setupExportListeners() {
        const exportChatBtn = document.getElementById('exportChatBtn');
        if (exportChatBtn) {
            exportChatBtn.addEventListener('click', () => {
                this.openExportModal();
            });
        }

        const confirmExportBtn = document.getElementById('confirmExportBtn');
        if (confirmExportBtn) {
            confirmExportBtn.addEventListener('click', () => {
                this.confirmExport();
            });
        }
    }

    openExportModal() {
        if (!this.currentUserId) {
            window.showError('กรุณาเลือกแชทก่อน');
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('exportModal'));
        modal.show();
    }

    async confirmExport() {
        const format = document.querySelector('input[name="exportFormat"]:checked');
        if (!format) {
            window.showError('กรุณาเลือกรูปแบบการส่งออก');
            return;
        }

        const exportFormat = format.value;
        const messages = this.chatHistory[this.currentUserId] || [];

        if (messages.length === 0) {
            window.showError('ไม่มีข้อความให้ส่งออก');
            return;
        }

        const user = this.users.find(u => u.userId === this.currentUserId);
        const fileName = `chat_${user ? user.displayName : this.currentUserId}_${Date.now()}`;

        try {
            switch (exportFormat) {
                case 'pdf':
                    await this.exportAsPDF(messages, fileName, user);
                    break;
                case 'text':
                    this.exportAsText(messages, fileName, user);
                    break;
                case 'json':
                    this.exportAsJSON(messages, fileName, user);
                    break;
            }

            window.showSuccess('ส่งออกแชทสำเร็จ');
            const modal = bootstrap.Modal.getInstance(document.getElementById('exportModal'));
            if (modal) modal.hide();
        } catch (error) {
            console.error('Error exporting chat:', error);
            window.showError('ไม่สามารถส่งออกแชทได้');
        }
    }

    async exportAsPDF(messages, fileName, user) {
        // For PDF export, we'll create a simple HTML version and use the browser's print function
        // In a production environment, you might want to use a library like jsPDF or pdfmake

        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Export Chat</title>');
        printWindow.document.write('<style>');
        printWindow.document.write(`
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            .message { margin: 10px 0; padding: 10px; border-radius: 8px; }
            .user { background: #e3f2fd; text-align: right; }
            .admin { background: #f5f5f5; }
            .timestamp { font-size: 0.8em; color: #666; margin-top: 5px; }
        `);
        printWindow.document.write('</style></head><body>');
        printWindow.document.write(`<h1>ประวัติการสนทนา - ${this.escapeHtml(user ? user.displayName : this.currentUserId)}</h1>`);

        messages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleString('th-TH');
            const cssClass = msg.isUser ? 'user' : 'admin';
            const sender = msg.isUser ? 'ผู้ใช้' : 'แอดมิน';

            printWindow.document.write(`
                <div class="message ${cssClass}">
                    <div><strong>${sender}:</strong> ${this.escapeHtml(msg.text || '')}</div>
                    <div class="timestamp">${time}</div>
                </div>
            `);
        });

        printWindow.document.write('</body></html>');
        printWindow.document.close();

        setTimeout(() => {
            printWindow.print();
        }, 500);
    }

    exportAsText(messages, fileName, user) {
        let text = `ประวัติการสนทนา - ${user ? user.displayName : this.currentUserId}\n`;
        text += `สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}\n`;
        text += '='.repeat(60) + '\n\n';

        messages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleString('th-TH');
            const sender = msg.isUser ? 'ผู้ใช้' : 'แอดมิน';
            text += `[${time}] ${sender}: ${msg.text || ''}\n`;
        });

        this.downloadFile(text, `${fileName}.txt`, 'text/plain');
    }

    exportAsJSON(messages, fileName, user) {
        const exportData = {
            user: {
                userId: this.currentUserId,
                displayName: user ? user.displayName : 'Unknown',
                platform: user ? user.platform : 'Unknown'
            },
            exportDate: new Date().toISOString(),
            messageCount: messages.length,
            messages: messages.map(msg => ({
                timestamp: msg.timestamp,
                sender: msg.isUser ? 'user' : 'admin',
                text: msg.text,
                hasImage: msg.hasImage || false
            }))
        };

        const json = JSON.stringify(exportData, null, 2);
        this.downloadFile(json, `${fileName}.json`, 'application/json');
    }

    downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ========== 7. Keyboard Shortcuts ==========

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Build shortcut key combination
            const keys = [];
            if (e.ctrlKey || e.metaKey) keys.push('ctrl');
            if (e.shiftKey) keys.push('shift');
            if (e.altKey) keys.push('alt');

            // Add the actual key (lowercase)
            if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key !== 'Meta') {
                keys.push(e.key.toLowerCase());
            }

            const shortcut = keys.join('+');

            // Check if this shortcut exists
            if (this.shortcuts[shortcut]) {
                e.preventDefault();
                this.shortcuts[shortcut]();
            }
        });

        // Add shortcut button in header
        const shortcutsBtn = document.getElementById('shortcutsBtn');
        if (shortcutsBtn) {
            shortcutsBtn.addEventListener('click', () => {
                this.openShortcutsModal();
            });
        }
    }

    openShortcutsModal() {
        const modal = new bootstrap.Modal(document.getElementById('shortcutsModal'));
        modal.show();
    }

    handleEscapeKey() {
        // Close any open modals
        const openModals = document.querySelectorAll('.modal.show');
        openModals.forEach(modalEl => {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        });

        // Exit selection mode if active
        if (this.isSelectionMode) {
            this.exitSelectionMode();
        }
    }

    exitSelectionMode() {
        this.isSelectionMode = false;
        this.selectedMessages.clear();
        // Update UI to reflect exit from selection mode
        const messages = document.querySelectorAll('.message-item.selected');
        messages.forEach(msg => msg.classList.remove('selected'));
    }

    // ========== 8. Order Management ==========

    async loadUserOrders(userId) {
        if (!userId) return [];

        try {
            const response = await fetch(`/admin/chat/orders/${userId}`);
            const data = await response.json();

            if (data.success) {
                return data.orders || [];
            } else {
                console.error('Error loading orders:', data.error);
                return [];
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            return [];
        }
    }

    async updateOrder(orderId, orderData) {
        try {
            const response = await fetch(`/admin/chat/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });

            const data = await response.json();

            if (data.success) {
                window.showSuccess('อัปเดตออเดอร์เรียบร้อยแล้ว');
                // Reload orders for current user
                await this.renderOrderSidebar();
                return data.order;
            } else {
                window.showError(`ไม่สามารถอัปเดตออเดอร์ได้: ${data.error}`);
                return null;
            }
        } catch (error) {
            console.error('Error updating order:', error);
            window.showError('เกิดข้อผิดพลาดในการอัปเดตออเดอร์');
            return null;
        }
    }

    async deleteOrder(orderId) {
        if (!confirm('คุณแน่ใจหรือไม่ที่จะลบออเดอร์นี้?')) {
            return;
        }

        try {
            const response = await fetch(`/admin/chat/orders/${orderId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                window.showSuccess('ลบออเดอร์เรียบร้อยแล้ว');
                // Reload orders for current user
                await this.renderOrderSidebar();
            } else {
                window.showError(`ไม่สามารถลบออเดอร์ได้: ${data.error}`);
            }
        } catch (error) {
            console.error('Error deleting order:', error);
            window.showError('เกิดข้อผิดพลาดในการลบออเดอร์');
        }
    }

    async renderOrderSidebar() {
        const orderContent = document.getElementById('orderContent');
        const orderCountBadge = document.getElementById('orderCountBadge');
        const orderEmptyState = document.getElementById('orderEmptyState');

        if (!orderContent || !this.currentUserId) {
            return;
        }

        // Show loading state
        orderContent.innerHTML = `
            <div class="order-loading">
                <div class="spinner"></div>
                กำลังโหลดออเดอร์...
            </div>
        `;

        try {
            const orders = await this.loadUserOrders(this.currentUserId);

            if (orders.length === 0) {
                orderContent.innerHTML = '';
                orderEmptyState.style.display = 'flex';
                if (orderCountBadge) orderCountBadge.textContent = '0';
                return;
            }

            orderEmptyState.style.display = 'none';
            if (orderCountBadge) orderCountBadge.textContent = orders.length;

            const ordersHTML = orders.map(order => this.renderOrderCard(order)).join('');
            orderContent.innerHTML = ordersHTML;

            // Add event listeners for order actions
            this.setupOrderEventListeners();

        } catch (error) {
            console.error('Error rendering order sidebar:', error);
            orderContent.innerHTML = `
                <div class="order-empty-state">
                    <div class="order-empty-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h6 class="order-empty-title">เกิดข้อผิดพลาด</h6>
                    <p class="order-empty-description">ไม่สามารถโหลดออเดอร์ได้</p>
                </div>
            `;
        }
    }

    renderOrderCard(order) {
        const items = order.orderData?.items || [];
        const totalAmount = order.orderData?.totalAmount || 0;

        // Build full address from address parts
        const addressParts = [];
        if (order.orderData?.shippingAddress) addressParts.push(order.orderData.shippingAddress);
        if (order.orderData?.addressSubDistrict) addressParts.push(order.orderData.addressSubDistrict);
        if (order.orderData?.addressDistrict) addressParts.push(order.orderData.addressDistrict);
        if (order.orderData?.addressProvince) addressParts.push(order.orderData.addressProvince);
        if (order.orderData?.addressPostalCode) addressParts.push(order.orderData.addressPostalCode);
        const shippingAddress = addressParts.length > 0 ? addressParts.join(' ') : 'ไม่ระบุ';

        const phone = order.orderData?.phone || 'ไม่ระบุ';
        const paymentMethod = order.orderData?.paymentMethod || 'ไม่ระบุ';
        const status = order.status || 'pending';
        const extractedAt = new Date(order.extractedAt).toLocaleDateString('th-TH');
        const notes = order.notes || '';

        const statusLabels = {
            pending: 'รอดำเนินการ',
            confirmed: 'ยืนยันแล้ว',
            shipped: 'จัดส่งแล้ว',
            completed: 'เสร็จสิ้น',
            cancelled: 'ยกเลิก'
        };

        const itemsHTML = items.map(item => `
            <div class="order-item">
                <div class="order-item-info">
                    <div class="order-item-name">${this.escapeHtml(item.product)}</div>
                    <div class="order-item-details">
                        <span>จำนวน: ${item.quantity}</span>
                        <span>ราคา: ฿${item.price.toLocaleString()}</span>
                    </div>
                </div>
                <div class="order-item-price">฿${(item.quantity * item.price).toLocaleString()}</div>
            </div>
        `).join('');

        return `
            <div class="order-card" data-order-id="${order._id}">
                <div class="order-card-header">
                    <h6 class="order-card-title">
                        <i class="fas fa-shopping-cart"></i>
                        ออเดอร์ #${order._id.toString().slice(-6)}
                    </h6>
                    <span class="order-status ${status}">${statusLabels[status]}</span>
                </div>

                <div class="order-items">
                    ${itemsHTML}
                </div>

                <div class="order-summary">
                    <div class="order-summary-row">
                        <span class="order-summary-label">ยอดรวม</span>
                        <span class="order-summary-value order-total">฿${totalAmount.toLocaleString()}</span>
                    </div>
                </div>

                <div class="order-details">
                    <div class="order-detail-row">
                        <span class="order-detail-label">ที่อยู่:</span>
                        <span class="order-detail-value">${this.escapeHtml(shippingAddress)}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">โทร:</span>
                        <span class="order-detail-value">${this.escapeHtml(phone)}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">ชำระ:</span>
                        <span class="order-detail-value">${this.escapeHtml(paymentMethod)}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">วันที่:</span>
                        <span class="order-detail-value">${extractedAt}</span>
                    </div>
                    ${notes ? `
                    <div class="order-detail-row">
                        <span class="order-detail-label">หมายเหตุ:</span>
                        <span class="order-detail-value">${this.escapeHtml(notes)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="order-actions">
                    <button class="order-action-btn edit" data-order-id="${order._id}" title="แก้ไข">
                        <i class="fas fa-edit"></i>
                        แก้ไข
                    </button>
                    <button class="order-action-btn delete" data-order-id="${order._id}" title="ลบ">
                        <i class="fas fa-trash"></i>
                        ลบ
                    </button>
                </div>
            </div>
        `;
    }

    setupOrderEventListeners() {
        // Edit order buttons
        document.querySelectorAll('.order-action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.orderId;
                this.openEditOrderModal(orderId);
            });
        });

        // Delete order buttons
        document.querySelectorAll('.order-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.orderId;
                this.deleteOrder(orderId);
            });
        });
    }

    async openEditOrderModal(orderId) {
        try {
            const orders = await this.loadUserOrders(this.currentUserId);
            const order = orders.find(o => o._id === orderId);

            if (!order) {
                window.showError('ไม่พบออเดอร์');
                return;
            }

            // Populate form
            document.getElementById('editOrderId').value = orderId;
            document.getElementById('editOrderStatus').value = order.status || 'pending';
            document.getElementById('editOrderNotes').value = order.notes || '';
            document.getElementById('editShippingAddress').value = order.orderData?.shippingAddress || '';
            document.getElementById('editPhone').value = order.orderData?.phone || '';
            document.getElementById('editPaymentMethod').value = order.orderData?.paymentMethod || 'เก็บเงินปลายทาง';

            // Populate address fields
            const addressSubDistrictInput = document.getElementById('editAddressSubDistrict');
            if (addressSubDistrictInput) {
                addressSubDistrictInput.value = order.orderData?.addressSubDistrict || '';
            }
            const addressDistrictInput = document.getElementById('editAddressDistrict');
            if (addressDistrictInput) {
                addressDistrictInput.value = order.orderData?.addressDistrict || '';
            }
            const addressProvinceInput = document.getElementById('editAddressProvince');
            if (addressProvinceInput) {
                addressProvinceInput.value = order.orderData?.addressProvince || '';
            }
            const addressPostalCodeInput = document.getElementById('editAddressPostalCode');
            if (addressPostalCodeInput) {
                addressPostalCodeInput.value = order.orderData?.addressPostalCode || '';
            }

            // Populate order items (read-only for now)
            const itemsContainer = document.getElementById('editOrderItems');
            const items = order.orderData?.items || [];
            itemsContainer.innerHTML = items.map(item => `
                <div class="order-item">
                    <div class="order-item-info">
                        <div class="order-item-name">${this.escapeHtml(item.product)}</div>
                        <div class="order-item-details">
                            <span>จำนวน: ${item.quantity}</span>
                            <span>ราคา: ฿${item.price.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="order-item-price">฿${(item.quantity * item.price).toLocaleString()}</div>
                </div>
            `).join('');

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('orderEditModal'));
            modal.show();

        } catch (error) {
            console.error('Error opening edit order modal:', error);
            window.showError('เกิดข้อผิดพลาดในการเปิดฟอร์มแก้ไข');
        }
    }

    setupOrderModalListeners() {
        // Save order button
        const saveOrderBtn = document.getElementById('saveOrderBtn');
        if (saveOrderBtn) {
            saveOrderBtn.addEventListener('click', async () => {
                await this.saveOrderChanges();
            });
        }
    }

    async saveOrderChanges() {
        const orderId = document.getElementById('editOrderId').value;
        const status = document.getElementById('editOrderStatus').value;
        const notes = document.getElementById('editOrderNotes').value;
        const shippingAddress = document.getElementById('editShippingAddress').value;
        const phone = document.getElementById('editPhone').value;
        const paymentMethod = document.getElementById('editPaymentMethod').value;

        if (!orderId) {
            window.showError('ไม่พบ ID ออเดอร์');
            return;
        }

        const saveBtn = document.getElementById('saveOrderBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>กำลังบันทึก...';
        }

        try {
            // Get current order data first
            const orders = await this.loadUserOrders(this.currentUserId);
            const currentOrder = orders.find(o => o._id === orderId);

            if (!currentOrder) {
                window.showError('ไม่พบออเดอร์');
                return;
            }

            // Update order data
            const updatedOrderData = {
                ...currentOrder.orderData,
                shippingAddress: shippingAddress || null,
                addressSubDistrict: (() => {
                    const input = document.getElementById('editAddressSubDistrict');
                    if (!input) return currentOrder.orderData?.addressSubDistrict || null;
                    const value = input.value.trim();
                    return value || null;
                })(),
                addressDistrict: (() => {
                    const input = document.getElementById('editAddressDistrict');
                    if (!input) return currentOrder.orderData?.addressDistrict || null;
                    const value = input.value.trim();
                    return value || null;
                })(),
                addressProvince: (() => {
                    const input = document.getElementById('editAddressProvince');
                    if (!input) return currentOrder.orderData?.addressProvince || null;
                    const value = input.value.trim();
                    return value || null;
                })(),
                addressPostalCode: (() => {
                    const input = document.getElementById('editAddressPostalCode');
                    if (!input) return currentOrder.orderData?.addressPostalCode || null;
                    const value = input.value.trim();
                    return value || null;
                })(),
                phone: phone || null,
                paymentMethod: paymentMethod || 'เก็บเงินปลายทาง'
            };

            const result = await this.updateOrder(orderId, {
                orderData: updatedOrderData,
                status: status,
                notes: notes
            });

            if (result) {
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('orderEditModal'));
                if (modal) modal.hide();
            }

        } catch (error) {
            console.error('Error saving order changes:', error);
            window.showError('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>บันทึก';
            }
        }
    }

    setupOrderListeners() {
        // Setup order modal listeners
        this.setupOrderModalListeners();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 9. Socket Event Handlers ==========

    handleOrderExtracted(data) {
        const { userId, orderId, orderData, isManualExtraction, extractedAt } = data;

        // Update user list to show order badge
        const user = this.allUsers.find(u => u.userId === userId);
        if (user) {
            user.hasOrders = true;
            user.orderCount = (user.orderCount || 0) + 1;
            this.applyFilters();
        }

        // If this is the current user, reload order sidebar
        if (userId === this.currentUserId) {
            this.renderOrderSidebar();
        }

        // Show notification
        if (isManualExtraction) {
            window.showSuccess('บันทึกออเดอร์สำเร็จ!');
        } else {
            window.showInfo(`พบออเดอร์ใหม่จาก ${user?.displayName || 'ลูกค้า'}`);
        }
    }

    handleOrderUpdated(data) {
        const { userId, orderId, orderData, status, notes, updatedAt } = data;

        // If this is the current user, reload order sidebar
        if (userId === this.currentUserId) {
            this.renderOrderSidebar();
        }

        // Show notification
        window.showInfo('ออเดอร์ได้รับการอัปเดต');
    }

    handleOrderDeleted(data) {
        const { userId, orderId } = data;

        // Update user list
        const user = this.allUsers.find(u => u.userId === userId);
        if (user) {
            user.orderCount = Math.max(0, (user.orderCount || 1) - 1);
            if (user.orderCount === 0) {
                user.hasOrders = false;
            }
            this.applyFilters();
        }

        // If this is the current user, reload order sidebar
        if (userId === this.currentUserId) {
            this.renderOrderSidebar();
        }

        // Show notification
        window.showInfo('ออเดอร์ถูกลบแล้ว');
    }
}

// Initialize chat manager when DOM is loaded
let chatManager;
document.addEventListener('DOMContentLoaded', function () {
    chatManager = new ChatManager();
});

// Global functions for onclick handlers
function clearUserChat() {
    if (chatManager) {
        chatManager.clearUserChat();
    }
}

function openImageModal(imageSrc) {
    if (chatManager) {
        chatManager.openImageModal(imageSrc);
    }
}

// Global function for image modal (can be called from HTML)
window.openImageModal = function (imageSrc) {
    if (chatManager) {
        chatManager.openImageModal(imageSrc);
    }
};
