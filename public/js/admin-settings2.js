// Admin Settings v2 Script
// Wires up the new settings page, bot modals, and form actions.

(function () {
    let passcodeCache = [];
    let passcodeSectionInitialized = false;

    // ---------- Alert / Toast helpers ----------
    const ALERT_ICON_MAP = {
        success: 'circle-check',
        danger: 'triangle-exclamation',
        warning: 'circle-exclamation',
        info: 'circle-info'
    };

    const ALERT_CLASS_MAP = {
        success: 'alert-toast-success',
        danger: 'alert-toast-danger',
        warning: 'alert-toast-warning',
        info: 'alert-toast-info'
    };

    function ensureAlertToastContainer() {
        let container = document.getElementById('alertToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'alertToastContainer';
            container.className = 'alert-toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
        }
        return container;
    }

    function createAlertToastElement(type, message) {
        const normalizedType = ALERT_CLASS_MAP[type] ? type : 'info';
        const toast = document.createElement('div');
        toast.className = `alert-toast ${ALERT_CLASS_MAP[normalizedType]}`;
        toast.setAttribute('role', 'alert');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'alert-toast-icon';
        iconSpan.innerHTML = `<i class="fas fa-${ALERT_ICON_MAP[normalizedType] || ALERT_ICON_MAP.info}"></i>`;

        const content = document.createElement('div');
        content.className = 'alert-toast-content';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'alert-toast-message';
        messageDiv.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'alert-toast-close';
        closeBtn.setAttribute('aria-label', 'ปิดการแจ้งเตือน');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';

        content.appendChild(messageDiv);
        content.appendChild(closeBtn);

        toast.appendChild(iconSpan);
        toast.appendChild(content);

        return { toast, closeBtn };
    }

    function showAlert(message, type = 'info') {
        const container = ensureAlertToastContainer();
        const { toast, closeBtn } = createAlertToastElement(type, message);

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        const hideToast = () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 220);
        };

        const timeoutId = setTimeout(hideToast, 5000);
        closeBtn.addEventListener('click', () => {
            clearTimeout(timeoutId);
            hideToast();
        });
    }

    window.showAlert = showAlert;

    // ---------- Settings fetch / save ----------
    async function fetchSettings() {
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) {
                throw new Error('ไม่สามารถโหลดการตั้งค่าได้');
            }
            return await response.json();
        } catch (error) {
            console.error('fetchSettings error:', error);
            showAlert('โหลดการตั้งค่าไม่สำเร็จ', 'danger');
            return {};
        }
    }

    function applySettings(settings = {}) {
        const chatDelay = document.getElementById('chatDelaySeconds');
        if (chatDelay) {
            chatDelay.value = settings.chatDelaySeconds ?? 0;
            updateRangeDisplay(chatDelay, 'chatDelayDisplay');
        }

        const maxQueue = document.getElementById('maxQueueMessages');
        if (maxQueue) {
            maxQueue.value = settings.maxQueueMessages ?? 10;
            updateRangeDisplay(maxQueue, 'maxQueueDisplay');
        }

        const mergeToggle = document.getElementById('enableMessageMerging');
        if (mergeToggle) mergeToggle.checked = settings.enableMessageMerging ?? true;

        const tokenToggle = document.getElementById('showTokenUsage');
        if (tokenToggle) tokenToggle.checked = settings.showTokenUsage ?? false;

        const audioResponse = document.getElementById('audioAttachmentResponse');
        if (audioResponse) audioResponse.value = settings.audioAttachmentResponse || '';

        const aiEnabled = document.getElementById('aiEnabled');
        if (aiEnabled) aiEnabled.checked = settings.aiEnabled ?? true;

        const chatHistory = document.getElementById('enableChatHistory');
        if (chatHistory) chatHistory.checked = settings.enableChatHistory ?? true;

        const aiHistoryLimit = document.getElementById('aiHistoryLimit');
        if (aiHistoryLimit) aiHistoryLimit.value = settings.aiHistoryLimit ?? 20;

        const adminNoti = document.getElementById('enableAdminNotifications');
        if (adminNoti) adminNoti.checked = settings.enableAdminNotifications ?? true;

        const systemMode = document.getElementById('systemMode');
        if (systemMode) systemMode.value = settings.systemMode || 'production';

        const filterToggle = document.getElementById('enableMessageFiltering');
        if (filterToggle) filterToggle.checked = settings.enableMessageFiltering ?? false;

        const strictToggle = document.getElementById('enableStrictFiltering');
        if (strictToggle) strictToggle.checked = settings.enableStrictFiltering ?? false;

        const hiddenWords = document.getElementById('hiddenWords');
        if (hiddenWords) hiddenWords.value = settings.hiddenWords || '';

        const replacementText = document.getElementById('replacementText');
        if (replacementText) replacementText.value = settings.replacementText || '[ข้อความถูกซ่อน]';

        updateHiddenWordsCount();
    }

    async function saveChatSettings(event) {
        if (event) event.preventDefault();

        const payload = {
            chatDelaySeconds: parseInt(document.getElementById('chatDelaySeconds')?.value || '0', 10),
            maxQueueMessages: parseInt(document.getElementById('maxQueueMessages')?.value || '10', 10),
            enableMessageMerging: Boolean(document.getElementById('enableMessageMerging')?.checked),
            showTokenUsage: Boolean(document.getElementById('showTokenUsage')?.checked),
            audioAttachmentResponse: document.getElementById('audioAttachmentResponse')?.value || ''
        };

        try {
            const response = await fetch('/api/settings/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error();
            showAlert('บันทึกการตั้งค่าแชทเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('saveChatSettings error:', error);
            showAlert('บันทึกการตั้งค่าแชทไม่สำเร็จ', 'danger');
        }
    }

    async function saveSystemSettings(event) {
        if (event) event.preventDefault();

        const historyLimitValue = parseInt(document.getElementById('aiHistoryLimit')?.value || '20', 10);
        if (Number.isNaN(historyLimitValue) || historyLimitValue < 1 || historyLimitValue > 100) {
            showAlert('จำนวนประวัติแชทต้องอยู่ระหว่าง 1-100 ข้อความ', 'danger');
            return;
        }

        const payload = {
            aiEnabled: Boolean(document.getElementById('aiEnabled')?.checked),
            enableChatHistory: Boolean(document.getElementById('enableChatHistory')?.checked),
            aiHistoryLimit: historyLimitValue,
            enableAdminNotifications: Boolean(document.getElementById('enableAdminNotifications')?.checked),
            systemMode: document.getElementById('systemMode')?.value || 'production'
        };

        try {
            const response = await fetch('/api/settings/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error();
            showAlert('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('saveSystemSettings error:', error);
            showAlert('บันทึกการตั้งค่าระบบไม่สำเร็จ', 'danger');
        }
    }

    async function saveFilterSettings(event) {
        if (event) event.preventDefault();

        const payload = {
            enableMessageFiltering: Boolean(document.getElementById('enableMessageFiltering')?.checked),
            enableStrictFiltering: Boolean(document.getElementById('enableStrictFiltering')?.checked),
            hiddenWords: document.getElementById('hiddenWords')?.value || '',
            replacementText: document.getElementById('replacementText')?.value || ''
        };

        try {
            const response = await fetch('/api/settings/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error();
            showAlert('บันทึกการตั้งค่าความปลอดภัยเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('saveFilterSettings error:', error);
            showAlert('บันทึกการตั้งค่าความปลอดภัยไม่สำเร็จ', 'danger');
        }
    }

    // ---------- Bots ----------
    function loadBotLists() {
        if (window.botManagement && typeof window.botManagement.loadLineBotSettings === 'function') {
            window.botManagement.loadLineBotSettings();
        }
        if (window.botManagement && typeof window.botManagement.loadFacebookBotSettings === 'function') {
            window.botManagement.loadFacebookBotSettings();
        }
    }

    function setupBotButtons() {
        const bm = window.botManagement || {};

        document.querySelectorAll('[data-bs-target="#addLineBotModal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof bm.addNewLineBot === 'function') {
                    bm.addNewLineBot();
                }
            });
        });

        document.querySelectorAll('[data-bs-target="#addFacebookBotModal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof bm.addNewFacebookBot === 'function') {
                    bm.addNewFacebookBot();
                }
            });
        });

        const saveLineBotBtn = document.getElementById('saveLineBotBtn');
        if (saveLineBotBtn) {
            saveLineBotBtn.addEventListener('click', () => {
                if (typeof bm.saveLineBot === 'function') bm.saveLineBot();
            });
        }

        const saveFacebookBotBtn = document.getElementById('saveFacebookBotBtn');
        if (saveFacebookBotBtn) {
            saveFacebookBotBtn.addEventListener('click', () => {
                if (typeof bm.saveFacebookBot === 'function') bm.saveFacebookBot();
            });
        }

        const deleteFacebookBotBtn = document.getElementById('deleteFacebookBotBtn');
        if (deleteFacebookBotBtn) {
            deleteFacebookBotBtn.addEventListener('click', () => {
                const botId = document.getElementById('facebookBotId')?.value;
                if (botId && typeof bm.deleteFacebookBot === 'function') {
                    bm.deleteFacebookBot(botId);
                }
            });
        }
    }

    // ---------- Tabs / UI helpers ----------
    function switchTab(tabName) {
        document.querySelectorAll('.tab-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(section => {
            section.classList.toggle('active', section.id === `tab-${tabName}`);
        });
    }

    function setupTabNavigation() {
        document.querySelectorAll('.tab-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab) switchTab(tab);
            });
        });
    }

    function updateRangeDisplay(inputEl, displayId) {
        if (!inputEl) return;
        const display = document.getElementById(displayId);
        if (display) display.textContent = inputEl.value;
    }

    function setupRangeDisplays() {
        const chatDelay = document.getElementById('chatDelaySeconds');
        if (chatDelay) {
            updateRangeDisplay(chatDelay, 'chatDelayDisplay');
            chatDelay.addEventListener('input', () => updateRangeDisplay(chatDelay, 'chatDelayDisplay'));
        }

        const maxQueue = document.getElementById('maxQueueMessages');
        if (maxQueue) {
            updateRangeDisplay(maxQueue, 'maxQueueDisplay');
            maxQueue.addEventListener('input', () => updateRangeDisplay(maxQueue, 'maxQueueDisplay'));
        }
    }

    // ---------- Filter helpers ----------
    function updateHiddenWordsCount() {
        const hiddenWordsElement = document.getElementById('hiddenWords');
        const hiddenWordsCountElement = document.getElementById('hiddenWordsCount');

        if (!hiddenWordsElement || !hiddenWordsCountElement) return;

        const words = hiddenWordsElement.value.split('\n').filter(word => word.trim() !== '');
        hiddenWordsCountElement.textContent = words.length;
    }

    async function testFiltering() {
        const testMessage = document.getElementById('testMessage');
        if (!testMessage || !testMessage.value.trim()) {
            showAlert('กรุณาใส่ข้อความที่ต้องการทดสอบ', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/filter/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: testMessage.value })
            });

            if (response.ok) {
                const result = await response.json();
                const testResult = document.getElementById('testResult');
                if (testResult) {
                    testResult.innerHTML = `
                        <strong>ผลการทดสอบ:</strong><br>
                        <strong>ข้อความต้นฉบับ:</strong> ${testMessage.value}<br>
                        <strong>ข้อความหลังกรอง:</strong> ${result.filteredMessage}<br>
                        <strong>คำที่ถูกซ่อน:</strong> ${result.hiddenWords.length > 0 ? result.hiddenWords.join(', ') : 'ไม่มี'}
                    `;
                    testResult.style.display = 'block';
                }
            } else {
                showAlert('ไม่สามารถทดสอบการกรองได้', 'danger');
            }
        } catch (error) {
            console.error('Error testing filter:', error);
            showAlert('เกิดข้อผิดพลาดในการทดสอบการกรอง', 'danger');
        }
    }

    window.testFiltering = testFiltering;
    window.updateHiddenWordsCount = updateHiddenWordsCount;

    // ---------- Passcode management ----------
    function isSuperadminUser() {
        return Boolean(window.adminAuth && window.adminAuth.user && window.adminAuth.user.role === 'superadmin');
    }

    function isPasscodeFeatureEnabledClient() {
        return Boolean(window.adminAuth && window.adminAuth.requirePasscode);
    }

    function initializePasscodeManagement() {
        const section = document.getElementById('passcodeSection');
        if (!section) return;

        if (!isSuperadminUser() || !isPasscodeFeatureEnabledClient()) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        if (!passcodeSectionInitialized) {
            setupPasscodeEventBindings();
            passcodeSectionInitialized = true;
        }

        refreshPasscodeList();
    }

    function setupPasscodeEventBindings() {
        const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
        const createContainer = document.getElementById('passcodeCreateContainer');
        const createForm = document.getElementById('createPasscodeForm');
        const generateBtn = document.getElementById('generatePasscodeBtn');
        const tableBody = document.getElementById('passcodeTableBody');

        if (toggleBtn && createContainer) {
            toggleBtn.addEventListener('click', () => {
                const isVisible = createContainer.style.display !== 'none';
                createContainer.style.display = isVisible ? 'none' : 'block';
                toggleBtn.innerHTML = isVisible
                    ? '<i class="fas fa-plus"></i><span>สร้างรหัสใหม่</span>'
                    : '<i class="fas fa-times"></i><span>ยกเลิก</span>';
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                const input = document.getElementById('newPasscodeValue');
                if (input) {
                    input.value = generateRandomPasscode();
                    input.focus();
                    input.select();
                }
            });
        }

        if (createForm) {
            createForm.addEventListener('submit', handleCreatePasscode);
        }

        if (tableBody) {
            tableBody.addEventListener('click', handlePasscodeTableClick);
        }
    }

    function generateRandomPasscode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const length = 8;
        let value = '';
        for (let i = 0; i < length; i++) {
            const index = Math.floor(Math.random() * alphabet.length);
            value += alphabet[index];
        }
        return value.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    }

    async function refreshPasscodeList() {
        const section = document.getElementById('passcodeSection');
        if (!section || !isSuperadminUser()) return;

        try {
            const response = await fetch('/api/admin-passcodes');
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
            const payload = await response.json();
            passcodeCache = Array.isArray(payload.passcodes) ? payload.passcodes : [];
            renderPasscodeTable();
            setPasscodeMessage(null, '');
        } catch (error) {
            console.error('[Passcode] load error:', error);
            setPasscodeMessage('error', error.message || 'ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
        }
    }

    function handlePasscodeTableClick(event) {
        const target = event.target.closest('button[data-action]');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const id = target.getAttribute('data-id');
        if (!id) return;

        if (action === 'toggle') {
            togglePasscodeStatus(id, target);
        } else if (action === 'delete') {
            deletePasscode(id, target);
        }
    }

    async function togglePasscodeStatus(id, triggerBtn) {
        const passcode = passcodeCache.find(item => item.id === id);
        if (!passcode) return;

        const willActivate = !passcode.isActive;
        const confirmationMessage = willActivate
            ? 'ต้องการเปิดใช้งานรหัสนี้หรือไม่?'
            : 'การปิดรหัสจะทำให้ทีมงานที่ใช้รหัสนี้ไม่สามารถล็อกอินใหม่ได้ ต้องการดำเนินการต่อหรือไม่?';
        if (!confirm(confirmationMessage)) return;

        setButtonLoading(triggerBtn, true);

        try {
            const response = await fetch(`/api/admin-passcodes/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: willActivate })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'ปรับสถานะรหัสไม่สำเร็จ');
            }

            const updated = payload.passcode;
            passcodeCache = passcodeCache.map(item => item.id === id ? updated : item);
            renderPasscodeTable();
            setPasscodeMessage('success', 'อัปเดตรหัสเรียบร้อยแล้ว');
        } catch (error) {
            console.error('[Passcode] toggle error:', error);
            setPasscodeMessage('error', error.message || 'ปรับสถานะรหัสไม่สำเร็จ');
        } finally {
            setButtonLoading(triggerBtn, false);
        }
    }

    async function deletePasscode(id, triggerBtn) {
        if (window.adminAuth && window.adminAuth.user && window.adminAuth.user.codeId === id) {
            setPasscodeMessage('error', 'ไม่สามารถลบรหัสที่คุณกำลังใช้งานอยู่ได้');
            return;
        }

        if (!confirm('ต้องการลบรหัสนี้หรือไม่? เมื่อยืนยันแล้วจะไม่สามารถเรียกคืนได้')) {
            return;
        }

        setButtonLoading(triggerBtn, true);

        try {
            const response = await fetch(`/api/admin-passcodes/${id}`, { method: 'DELETE' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'ลบรหัสไม่สำเร็จ');
            }

            passcodeCache = passcodeCache.filter(item => item.id !== id);
            renderPasscodeTable();
            setPasscodeMessage('success', 'ลบรหัสเรียบร้อยแล้ว');
        } catch (error) {
            console.error('[Passcode] delete error:', error);
            setPasscodeMessage('error', error.message || 'ลบรหัสไม่สำเร็จ');
        } finally {
            setButtonLoading(triggerBtn, false);
        }
    }

    async function handleCreatePasscode(event) {
        event.preventDefault();

        const labelInput = document.getElementById('newPasscodeLabel');
        const passcodeInput = document.getElementById('newPasscodeValue');
        const submitBtn = document.getElementById('createPasscodeSubmitBtn');

        if (!labelInput || !passcodeInput || !submitBtn) return;

        const label = (labelInput.value || '').trim();
        const passcode = (passcodeInput.value || '').trim();

        if (!label || !passcode) {
            setPasscodeMessage('error', 'กรุณากรอกชื่อรหัสและรหัสผ่านให้ครบถ้วน');
            return;
        }

        setCreatePasscodeLoading(true);

        try {
            const response = await fetch('/api/admin-passcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, passcode })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'ไม่สามารถสร้างรหัสใหม่ได้');
            }

            passcodeCache.unshift(payload.passcode);
            renderPasscodeTable();
            labelInput.value = '';
            passcodeInput.value = '';
            setPasscodeMessage('success', 'สร้างรหัสใหม่เรียบร้อยแล้ว');

            const createContainer = document.getElementById('passcodeCreateContainer');
            const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
            if (createContainer && toggleBtn) {
                createContainer.style.display = 'none';
                toggleBtn.innerHTML = '<i class="fas fa-plus"></i><span>สร้างรหัสใหม่</span>';
            }
        } catch (error) {
            console.error('[Passcode] create error:', error);
            setPasscodeMessage('error', error.message || 'ไม่สามารถสร้างรหัสใหม่ได้');
        } finally {
            setCreatePasscodeLoading(false);
        }
    }

    function renderPasscodeTable() {
        const tbody = document.getElementById('passcodeTableBody');
        const emptyState = document.getElementById('passcodeEmptyState');
        if (!tbody) return;

        Array.from(tbody.querySelectorAll('tr[data-passcode-id]')).forEach(row => row.remove());

        if (!passcodeCache.length) {
            if (emptyState) emptyState.style.display = '';
            const badge = document.getElementById('passcodeStatusBadge');
            if (badge) badge.innerHTML = '<i class="fas fa-lock me-1"></i>ยังไม่มีรหัสทีมงาน';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        const badge = document.getElementById('passcodeStatusBadge');
        if (badge) {
            const activeCount = passcodeCache.filter(item => item.isActive !== false).length;
            badge.innerHTML = `<i class="fas fa-lock me-1"></i>รหัสใช้งาน ${activeCount}/${passcodeCache.length}`;
        }

        passcodeCache.forEach(item => {
            const row = document.createElement('tr');
            row.setAttribute('data-passcode-id', item.id);
            if (window.adminAuth && window.adminAuth.user && window.adminAuth.user.codeId === item.id) {
                row.classList.add('table-active');
            }

            const statusBadge = item.isActive
                ? '<span class="badge bg-success-subtle text-success-emphasis"><i class="fas fa-check-circle me-1"></i>เปิดใช้งาน</span>'
                : '<span class="badge bg-secondary-subtle text-secondary-emphasis"><i class="fas fa-pause-circle me-1"></i>ปิดชั่วคราว</span>';

            row.innerHTML = `
                <td><strong>${escapeHtml(item.label || '-')}</strong></td>
                <td>${statusBadge}</td>
                <td>${formatPasscodeTimestamp(item.lastUsedAt)}</td>
                <td>${typeof item.usageCount === 'number' ? item.usageCount : 0}</td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button type="button" class="btn btn-outline-secondary" data-action="toggle" data-id="${item.id}">
                            <i class="fas ${item.isActive ? 'fa-toggle-off' : 'fa-toggle-on'} me-1"></i>${item.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                        <button type="button" class="btn btn-outline-danger" data-action="delete" data-id="${item.id}">
                            <i class="fas fa-trash-alt me-1"></i>ลบ
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });
    }

    function setCreatePasscodeLoading(isLoading) {
        const submitBtn = document.getElementById('createPasscodeSubmitBtn');
        const inputs = document.querySelectorAll('#createPasscodeForm input, #createPasscodeForm button');

        if (!submitBtn) return;

        setButtonLoading(submitBtn, isLoading);
        inputs.forEach(el => {
            if (el.id !== 'createPasscodeSubmitBtn') {
                el.disabled = isLoading;
            }
        });
    }

    function setButtonLoading(button, isLoading) {
        if (!button) return;
        button.disabled = isLoading;
        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-spinner', isLoading);
            icon.classList.toggle('fa-spin', isLoading);
        }
    }

    function setPasscodeMessage(type, message) {
        const box = document.getElementById('passcodeMessageBox');
        if (!box) return;

        if (!message) {
            box.className = 'alert alert-info mt-3 d-none';
            box.textContent = '';
            return;
        }

        let alertClass = 'alert-info';
        if (type === 'success') alertClass = 'alert-success';
        else if (type === 'error') alertClass = 'alert-danger';

        box.className = `alert ${alertClass} mt-3`;
        box.textContent = message;
        box.classList.remove('d-none');
    }

    function formatPasscodeTimestamp(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ---------- Main init ----------
    async function initializeSettingsPage() {
        setupTabNavigation();
        setupRangeDisplays();
        setupBotButtons();

        const refreshBtn = document.getElementById('refreshSettingsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadBotLists();
                fetchSettings().then(applySettings);
                if (window.imageCollectionsManager && typeof window.imageCollectionsManager.refreshAll === 'function') {
                    window.imageCollectionsManager.refreshAll();
                }
            });
        }

        const chatForm = document.getElementById('chatSettingsForm');
        if (chatForm) chatForm.addEventListener('submit', saveChatSettings);

        const systemForm = document.getElementById('systemSettingsForm');
        if (systemForm) systemForm.addEventListener('submit', saveSystemSettings);

        const filterForm = document.getElementById('filterSettingsForm');
        if (filterForm) {
            filterForm.addEventListener('submit', saveFilterSettings);
        }

        const hiddenWordsElement = document.getElementById('hiddenWords');
        if (hiddenWordsElement) hiddenWordsElement.addEventListener('input', updateHiddenWordsCount);

        // Load initial data
        fetchSettings().then(applySettings);
        loadBotLists();
        if (window.imageCollectionsManager && typeof window.imageCollectionsManager.refreshAll === 'function') {
            window.imageCollectionsManager.refreshAll();
        }
        initializePasscodeManagement();
    }

    // Expose minimal hooks for other modules that check for adminSettings
    window.adminSettings = {
        setInstructionLibraryCache: () => {},
        setLineBotCache: () => {},
        setFacebookBotCache: () => {},
        showAlert
    };

    document.addEventListener('DOMContentLoaded', initializeSettingsPage);
})();
