// Admin Dashboard V2 - Instruction Management
(function () {
    'use strict';

    let toastContainer = document.getElementById('dashboardToastContainer');

    const ensureToastContainer = () => {
        if (!toastContainer || !document.body.contains(toastContainer)) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'app-toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    };

    const showToast = (message, type = 'info') => {
        const container = ensureToastContainer();
        const typeMap = {
            success: { icon: 'fa-check-circle', className: 'app-toast--success' },
            error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
            warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
            info: { icon: 'fa-info-circle', className: 'app-toast--info' },
        };
        const toastType = typeMap[type] ? type : 'info';
        const { icon, className } = typeMap[toastType];

        const toast = document.createElement('div');
        toast.className = `app-toast ${className}`;

        const iconEl = document.createElement('div');
        iconEl.className = 'app-toast__icon';
        iconEl.innerHTML = `<i class="fas ${icon}"></i>`;

        const body = document.createElement('div');
        body.className = 'app-toast__body';

        const title = document.createElement('div');
        title.className = 'app-toast__title';
        title.textContent = message || '';

        body.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'app-toast__close';
        closeBtn.setAttribute('aria-label', 'ปิดการแจ้งเตือน');
        closeBtn.innerHTML = '&times;';

        const removeToast = () => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 200);
        };

        closeBtn.addEventListener('click', removeToast);

        toast.appendChild(iconEl);
        toast.appendChild(body);
        toast.appendChild(closeBtn);

        container.appendChild(toast);
        setTimeout(removeToast, 3200);
    };

    // Modals
    const instructionModal = new bootstrap.Modal(document.getElementById('instructionModal'));
    const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
    const conversationStarterModalRoot = document.getElementById('conversationStarterModal');
    const conversationStarterModal = conversationStarterModalRoot
        ? new bootstrap.Modal(conversationStarterModalRoot)
        : null;

    // ===== Inline Instruction Editor =====
    const instructionSelect = document.getElementById('instructionSelect');
    const instructionEditorName = document.getElementById('instructionEditorName');
    const instructionEditorDescription = document.getElementById('instructionEditorDescription');
    const instructionEditorStatus = document.getElementById('instructionEditorStatus');
    const instructionEditorFields = document.getElementById('instructionEditorFields');
    const instructionEditorEmptyState = document.getElementById('instructionEditorEmptyState');
    const instructionEditorLoading = document.getElementById('instructionEditorLoading');
    const instructionEditorUpdatedAt = document.getElementById('instructionEditorUpdatedAt');
    const instructionDirtyAlert = document.getElementById('instructionDirtyAlert');
    const saveInstructionChangesBtn = document.getElementById('saveInstructionChangesBtn');
    const instructionCardsWrapper = document.getElementById('instructionCardsWrapper');
    const instructionCardsEmptyState = document.getElementById('instructionCardsEmptyState');
    const instructionCards = Array.from(document.querySelectorAll('.instruction-card'));
    const openStarterModalButtons = Array.from(document.querySelectorAll('.open-starter-modal'));
    const instructionStarterQuickStatus = document.getElementById('instructionStarterQuickStatus');
    const instructionStarterQuickStatusText = document.getElementById('instructionStarterQuickStatusText');

    const starterModalInstructionName = document.getElementById('starterModalInstructionName');
    const starterEnabledToggle = document.getElementById('starterEnabledToggle');
    const starterMessageCounter = document.getElementById('starterMessageCounter');
    const starterMessagesList = document.getElementById('starterMessagesList');
    const starterAddTextBtn = document.getElementById('starterAddTextBtn');
    const starterAddImageBtn = document.getElementById('starterAddImageBtn');
    const starterAddVideoBtn = document.getElementById('starterAddVideoBtn');
    const starterImageUploadInput = document.getElementById('starterImageUploadInput');
    const saveStarterConfigBtn = document.getElementById('saveStarterConfigBtn');

    const editorState = {
        currentInstructionId: '',
        initialData: null,
        isDirty: false,
    };

    const starterState = {
        instructionId: '',
        enabled: false,
        messages: [],
        loading: false,
        saving: false
    };

    const parseDatasetBoolean = (value) =>
        value === '1' || value === 'true' || value === true;

    const parseStarterCount = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
    };

    const escapeHtml = (value) =>
        String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const escapeAttr = (value) => escapeHtml(value).replace(/\n/g, '&#10;');

    const generateStarterTempId = () => `starter_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const normalizeStarterMessage = (message, index = 0) => {
        if (!message || typeof message !== 'object') return null;
        const type = typeof message.type === 'string' ? message.type.trim().toLowerCase() : '';
        const rawOrder = Number(message.order);
        const order = Number.isFinite(rawOrder) && rawOrder >= 0
            ? Math.floor(rawOrder)
            : Math.max(0, Number(index) || 0);
        const idSource = message.id || message.messageId || message.itemId;
        const id = typeof idSource === 'string' && idSource.trim()
            ? idSource.trim()
            : generateStarterTempId();

        if (type === 'text') {
            const rawText = typeof message.content === 'string'
                ? message.content
                : typeof message.text === 'string'
                    ? message.text
                    : '';
            const content = rawText.trim();
            if (!content) return null;
            return { id, type: 'text', content, order };
        }

        if (type === 'image') {
            const url = typeof message.url === 'string' ? message.url.trim() : '';
            if (!url) return null;
            const previewUrl = typeof message.previewUrl === 'string' && message.previewUrl.trim()
                ? message.previewUrl.trim()
                : typeof message.thumbUrl === 'string' && message.thumbUrl.trim()
                    ? message.thumbUrl.trim()
                    : url;
            const normalized = {
                id,
                type: 'image',
                url,
                previewUrl,
                order
            };
            const alt = typeof message.alt === 'string'
                ? message.alt.trim()
                : typeof message.caption === 'string'
                    ? message.caption.trim()
                    : '';
            if (alt) normalized.alt = alt;
            const fileName = typeof message.fileName === 'string' ? message.fileName.trim() : '';
            if (fileName) normalized.fileName = fileName;
            const assetId = message.assetId || message.id;
            if (assetId) normalized.assetId = String(assetId).trim();
            return normalized;
        }

        if (type === 'video') {
            const url = typeof message.url === 'string'
                ? message.url.trim()
                : typeof message.videoUrl === 'string'
                    ? message.videoUrl.trim()
                    : '';
            if (!url) return null;
            const previewUrl = typeof message.previewUrl === 'string' && message.previewUrl.trim()
                ? message.previewUrl.trim()
                : typeof message.thumbUrl === 'string' && message.thumbUrl.trim()
                    ? message.thumbUrl.trim()
                    : '';
            const normalized = {
                id,
                type: 'video',
                url,
                order
            };
            if (previewUrl) normalized.previewUrl = previewUrl;
            const alt = typeof message.alt === 'string'
                ? message.alt.trim()
                : typeof message.caption === 'string'
                    ? message.caption.trim()
                    : '';
            if (alt) normalized.alt = alt;
            const fileName = typeof message.fileName === 'string' ? message.fileName.trim() : '';
            if (fileName) normalized.fileName = fileName;
            const assetId = message.assetId || message.id;
            if (assetId) normalized.assetId = String(assetId).trim();
            return normalized;
        }

        return null;
    };

    const normalizeStarterConfig = (config) => {
        const enabled = !!config?.enabled;
        const rawMessages = Array.isArray(config?.messages) ? config.messages : [];
        const messages = rawMessages
            .map((message, index) => normalizeStarterMessage(message, index))
            .filter(Boolean)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((message, index) => ({
                ...message,
                order: index,
                id: message.id || generateStarterTempId()
            }));
        return { enabled, messages };
    };

    const cloneStarterMessages = (messages) =>
        (Array.isArray(messages) ? messages : []).map((message, index) => ({
            ...message,
            order: Number.isFinite(Number(message?.order)) ? Math.floor(Number(message.order)) : index
        }));

    const setEditorStatus = (message, isActive = false) => {
        if (!instructionEditorStatus) return;
        instructionEditorStatus.textContent = message;
        instructionEditorStatus.classList.toggle('active', !!isActive);
    };

    const setEditorLoading = (isLoading) => {
        if (!instructionEditorLoading) return;
        instructionEditorLoading.classList.toggle('d-none', !isLoading);
    };

    const buildStarterBadgeLabel = (enabled, messageCount) =>
        enabled ? `Starter ON (${messageCount})` : 'Starter OFF';

    const setStarterQuickStatus = (instructionId, enabled, messageCount) => {
        if (!instructionStarterQuickStatus || !instructionStarterQuickStatusText) return;
        if (!instructionId) {
            instructionStarterQuickStatus.classList.add('is-off');
            instructionStarterQuickStatus.classList.remove('is-on');
            instructionStarterQuickStatusText.textContent = 'Starter: ยังไม่ได้เลือก Instruction';
            return;
        }
        instructionStarterQuickStatus.classList.toggle('is-on', !!enabled);
        instructionStarterQuickStatus.classList.toggle('is-off', !enabled);
        instructionStarterQuickStatusText.textContent = enabled
            ? `Starter: เปิดใช้งาน (${messageCount} รายการ)`
            : 'Starter: ปิดอยู่';
    };

    const applyStarterBadgeState = (badgeEl, enabled, messageCount) => {
        if (!badgeEl) return;
        badgeEl.dataset.starterEnabled = enabled ? '1' : '0';
        badgeEl.dataset.starterCount = String(messageCount);
        badgeEl.classList.toggle('is-on', !!enabled);
        badgeEl.classList.toggle('is-off', !enabled);
        const textEl = badgeEl.querySelector('[data-starter-badge-text]');
        if (textEl) {
            textEl.textContent = buildStarterBadgeLabel(enabled, messageCount);
        } else {
            badgeEl.textContent = buildStarterBadgeLabel(enabled, messageCount);
        }
    };

    const applyStarterStatusToInstructionUI = (instructionId, starterConfig, options = {}) => {
        if (!instructionId || !starterConfig) return;
        const enabled = !!starterConfig.enabled;
        const messageCount = Array.isArray(starterConfig.messages) ? starterConfig.messages.length : 0;

        const option = instructionSelect
            ? instructionSelect.querySelector(`option[value="${instructionId}"]`)
            : null;
        if (option) {
            option.dataset.starterEnabled = enabled ? '1' : '0';
            option.dataset.starterCount = String(messageCount);
            const displayName = (options.name || option.dataset.name || '').trim() || 'ไม่มีชื่อ';
            option.dataset.name = displayName;
            if (options.updatedAt) {
                const dt = new Date(options.updatedAt);
                option.dataset.updated = Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
            }
            if (typeof options.instructionCode === 'string') {
                option.dataset.instructionCode = options.instructionCode;
            }
            option.textContent = buildInstructionSelectOptionLabel({
                instructionCode: option.dataset.instructionCode || '',
                name: displayName,
                updatedAt: option.dataset.updated || options.updatedAt || '',
                starterEnabled: enabled,
                starterCount: messageCount
            });
        }

        const card = document.querySelector(`.instruction-card[data-id="${instructionId}"]`);
        if (card) {
            const badge = card.querySelector('[data-starter-badge]');
            applyStarterBadgeState(badge, enabled, messageCount);
        }

        if (editorState.currentInstructionId === instructionId) {
            setStarterQuickStatus(instructionId, enabled, messageCount);
        }
    };

    const toggleEditorFields = (visible) => {
        if (instructionEditorFields) {
            instructionEditorFields.classList.toggle('d-none', !visible);
        }
        if (instructionEditorEmptyState) {
            instructionEditorEmptyState.classList.toggle('d-none', visible);
        }
    };

    const applyInstructionCardFilter = (instructionId) => {
        if (!instructionCardsWrapper || !instructionCardsEmptyState || instructionCards.length === 0) return;
        if (!instructionId) {
            instructionCardsWrapper.classList.add('d-none');
            instructionCardsEmptyState.classList.remove('d-none');
            instructionCards.forEach(card => card.classList.add('d-none'));
            return;
        }
        instructionCardsWrapper.classList.remove('d-none');
        instructionCardsEmptyState.classList.add('d-none');
        instructionCards.forEach(card => {
            const matches = card.dataset.id === instructionId;
            card.classList.toggle('d-none', !matches);
        });
    };

    const clearEditor = () => {
        editorState.currentInstructionId = '';
        editorState.initialData = null;
        editorState.isDirty = false;
        starterState.instructionId = '';
        starterState.enabled = false;
        starterState.messages = [];
        if (instructionSelect) {
            instructionSelect.value = '';
        }
        if (instructionEditorName) instructionEditorName.value = '';
        if (instructionEditorDescription) instructionEditorDescription.value = '';
        if (instructionEditorUpdatedAt) instructionEditorUpdatedAt.textContent = '';
        if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
        if (saveInstructionChangesBtn) saveInstructionChangesBtn.disabled = true;
        toggleEditorFields(false);
        setEditorStatus('ยังไม่ได้เลือก Instruction', false);
        setStarterQuickStatus('', false, 0);
        applyInstructionCardFilter('');
    };

    const hasEditorChanges = () => {
        if (!editorState.initialData) return false;
        const currentName = (instructionEditorName?.value || '').trim();
        const currentDescription = (instructionEditorDescription?.value || '').trim();
        return (
            currentName !== (editorState.initialData.name || '') ||
            currentDescription !== (editorState.initialData.description || '')
        );
    };

    const refreshDirtyState = () => {
        const dirty = hasEditorChanges();
        editorState.isDirty = dirty;
        if (instructionDirtyAlert) {
            instructionDirtyAlert.classList.toggle('d-none', !dirty);
        }
        if (saveInstructionChangesBtn) {
            saveInstructionChangesBtn.disabled = !dirty;
        }
        if (editorState.currentInstructionId) {
            setEditorStatus(
                dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'ข้อมูลล่าสุดบันทึกแล้ว',
                dirty
            );
        } else {
            setEditorStatus('ยังไม่ได้เลือก Instruction', false);
        }
    };

    const formatUpdatedAtText = (value) => {
        if (!instructionEditorUpdatedAt) return;
        if (!value) {
            instructionEditorUpdatedAt.textContent = '';
            return;
        }
        const updatedAt = new Date(value);
        if (Number.isNaN(updatedAt.getTime())) {
            instructionEditorUpdatedAt.textContent = '';
            return;
        }
        instructionEditorUpdatedAt.textContent = `อัปเดตล่าสุด: ${updatedAt.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    };

    const formatDateTimeTh = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const buildInstructionSelectOptionLabel = ({
        instructionCode,
        name,
        updatedAt,
        starterEnabled = false,
        starterCount = 0
    }) => {
        const code = (instructionCode || '').trim();
        const displayName = (name || '').trim() || 'ไม่มีชื่อ';
        const dateLabel = formatDateTimeTh(updatedAt);
        const codePrefix = code ? `[${code}] ` : '';
        const starterSuffix = ` • ${buildStarterBadgeLabel(!!starterEnabled, parseStarterCount(starterCount))}`;
        const dateSuffix = dateLabel ? ` — ${dateLabel}` : '';
        return `${codePrefix}${displayName}${starterSuffix}${dateSuffix}`;
    };

    const refreshInstructionOptionLabels = () => {
        if (!instructionSelect) return;
        Array.from(instructionSelect.options).forEach((option) => {
            if (!option.value) return;
            const displayName = (option.dataset.name || option.textContent || '').trim() || 'ไม่มีชื่อ';
            option.dataset.name = displayName;
            option.textContent = buildInstructionSelectOptionLabel({
                instructionCode: option.dataset.instructionCode || '',
                name: displayName,
                updatedAt: option.dataset.updated || '',
                starterEnabled: parseDatasetBoolean(option.dataset.starterEnabled),
                starterCount: parseStarterCount(option.dataset.starterCount)
            });
        });
    };

    let editorRequestToken = 0;

    clearEditor();
    refreshInstructionOptionLabels();

    const loadInstructionIntoEditor = async (instructionId) => {
        if (!instructionId) {
            clearEditor();
            return;
        }
        editorState.currentInstructionId = instructionId;
        editorState.initialData = null;
        editorState.isDirty = false;
        if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
        if (saveInstructionChangesBtn) saveInstructionChangesBtn.disabled = true;
        toggleEditorFields(false);
        setEditorStatus('กำลังโหลดข้อมูล...', true);
        setEditorLoading(true);

        const requestId = ++editorRequestToken;

        try {
            const res = await fetch(`/api/instructions-v2/${instructionId}`);
            const data = await res.json();

            if (requestId !== editorRequestToken) {
                return;
            }

            if (data.success) {
                const { instruction } = data;
                editorState.initialData = {
                    name: instruction.name || '',
                    description: instruction.description || ''
                };
                const starterConfig = normalizeStarterConfig(instruction.conversationStarter);
                if (instructionEditorName) {
                    instructionEditorName.value = editorState.initialData.name;
                }
                if (instructionEditorDescription) {
                    instructionEditorDescription.value = editorState.initialData.description;
                }
                formatUpdatedAtText(instruction.updatedAt || instruction.createdAt);
                toggleEditorFields(true);
                applyInstructionCardFilter(instructionId);
                setEditorStatus('ข้อมูลล่าสุดบันทึกแล้ว', false);
                setStarterQuickStatus(
                    instructionId,
                    starterConfig.enabled,
                    starterConfig.messages.length
                );
                editorState.isDirty = false;
                if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
                if (saveInstructionChangesBtn) saveInstructionChangesBtn.disabled = true;

                const selectedOption = instructionSelect
                    ? instructionSelect.querySelector(`option[value="${instructionId}"]`)
                    : null;
                const instructionCode = instruction.instructionId
                    || selectedOption?.dataset?.instructionCode
                    || '';
                if (selectedOption) {
                    selectedOption.dataset.name = instruction.name || 'ไม่มีชื่อ';
                }
                applyStarterStatusToInstructionUI(instructionId, starterConfig, {
                    name: instruction.name || selectedOption?.dataset?.name || 'ไม่มีชื่อ',
                    updatedAt: instruction.updatedAt || instruction.createdAt || '',
                    instructionCode
                });
            } else {
                showToast(data.error || 'ไม่สามารถโหลดข้อมูล Instruction ได้', 'error');
                clearEditor();
            }
        } catch (error) {
            console.error('Error loading instruction:', error);
            showToast('เกิดข้อผิดพลาดในการโหลด Instruction', 'error');
            clearEditor();
        } finally {
            if (requestId === editorRequestToken) {
                setEditorLoading(false);
            }
        }
    };

    if (instructionSelect && instructionEditorName && instructionEditorDescription) {
        instructionSelect.addEventListener('change', () => {
            const selectedId = instructionSelect.value;
            if (
                editorState.isDirty &&
                selectedId !== editorState.currentInstructionId &&
                !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?')
            ) {
                instructionSelect.value = editorState.currentInstructionId || '';
                return;
            }
            loadInstructionIntoEditor(selectedId);
        });

        [instructionEditorName, instructionEditorDescription].forEach((input) => {
            input.addEventListener('input', () => refreshDirtyState());
        });

        if (saveInstructionChangesBtn) {
            saveInstructionChangesBtn.addEventListener('click', async () => {
                if (!editorState.currentInstructionId) {
                    showToast('กรุณาเลือก Instruction ที่ต้องการบันทึก', 'warning');
                    return;
                }
                const name = instructionEditorName.value.trim();
                const description = instructionEditorDescription.value.trim();
                if (!name) {
                    showToast('กรุณาระบุชื่อ Instruction', 'warning');
                    return;
                }
                saveInstructionChangesBtn.disabled = true;
                saveInstructionChangesBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';
                try {
                    const res = await fetch(`/api/instructions-v2/${editorState.currentInstructionId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, description })
                    });
                    const data = await res.json();
                    if (data.success) {
                        const updatedAt = data.instruction?.updatedAt || new Date();
                        editorState.initialData = { name, description };
                        editorState.isDirty = false;
                        if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
                        setEditorStatus('บันทึกเรียบร้อยแล้ว', false);
                        showToast('บันทึกการแก้ไขแล้ว', 'success');
                        setTimeout(() => {
                            if (!editorState.isDirty) {
                                setEditorStatus('ข้อมูลล่าสุดบันทึกแล้ว', false);
                            }
                        }, 3000);
                        formatUpdatedAtText(updatedAt);
                        // Update card title/description
                        const card = document.querySelector(`.instruction-card[data-id="${editorState.currentInstructionId}"]`);
                        if (card) {
                            const titleEl = card.querySelector('.instruction-title');
                            if (titleEl) {
                                titleEl.textContent = name || 'ไม่มีชื่อ';
                            }
                            let descEl = card.querySelector('.instruction-desc');
                            if (description) {
                                if (!descEl) {
                                    const header = card.querySelector('.instruction-header .flex-grow-1');
                                    if (header) {
                                        descEl = document.createElement('p');
                                        descEl.className = 'instruction-desc';
                                        header.appendChild(descEl);
                                    }
                                }
                                if (descEl) descEl.textContent = description;
                            } else if (descEl) {
                                descEl.remove();
                            }
                        }
                        // Update select option text
                        const option = instructionSelect.querySelector(`option[value="${editorState.currentInstructionId}"]`);
                        if (option) {
                            const instructionCode = data.instruction?.instructionId || option.dataset.instructionCode || '';
                            const iso = (() => {
                                const dt = new Date(updatedAt);
                                return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
                            })();
                            option.dataset.instructionCode = instructionCode;
                            option.dataset.name = name || 'ไม่มีชื่อ';
                            if (iso) option.dataset.updated = iso;
                            option.textContent = buildInstructionSelectOptionLabel({
                                instructionCode,
                                name,
                                updatedAt,
                                starterEnabled: parseDatasetBoolean(option.dataset.starterEnabled),
                                starterCount: parseStarterCount(option.dataset.starterCount)
                            });
                        }
                    } else {
                        showToast(data.error || 'ไม่สามารถบันทึก Instruction ได้', 'error');
                    }
                } catch (error) {
                    console.error('Error saving instruction:', error);
                    showToast('เกิดข้อผิดพลาดในการบันทึก Instruction', 'error');
                } finally {
                    refreshDirtyState();
                    saveInstructionChangesBtn.innerHTML = '<i class="fas fa-save me-1"></i> บันทึกการแก้ไข';
                }
            });
        }

        window.addEventListener('beforeunload', (event) => {
            if (editorState.isDirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
    }

    // ===== Conversation Starter Modal =====
    const reindexStarterMessages = () => {
        starterState.messages = cloneStarterMessages(starterState.messages).map((message, index) => ({
            ...message,
            order: index
        }));
    };

    const updateStarterCounter = () => {
        if (!starterMessageCounter) return;
        const count = Array.isArray(starterState.messages) ? starterState.messages.length : 0;
        starterMessageCounter.textContent = `${count} รายการ`;
    };

    const renderStarterMessages = () => {
        if (!starterMessagesList) return;
        reindexStarterMessages();

        if (!starterState.messages.length) {
            starterMessagesList.innerHTML = '<div class="starter-message-empty">ยังไม่มีข้อความเริ่มต้น กดปุ่มด้านบนเพื่อเพิ่มข้อความ รูปภาพ หรือวิดีโอ</div>';
            updateStarterCounter();
            return;
        }

        const html = starterState.messages.map((message, index) => {
            const orderLabel = index + 1;
            const moveUpDisabled = index === 0 ? 'disabled' : '';
            const moveDownDisabled = index === starterState.messages.length - 1 ? 'disabled' : '';
            const isImage = message.type === 'image';
            const isVideo = message.type === 'video';
            const messageTypeClass = isImage ? 'type-image' : isVideo ? 'type-video' : 'type-text';
            const messageTypeLabel = isImage ? 'Image' : isVideo ? 'Video' : 'Text';
            const messageTypeIcon = isImage ? 'fa-image' : isVideo ? 'fa-video' : 'fa-font';

            let bodyHtml = '';
            if (isImage) {
                const preview = escapeAttr(message.previewUrl || message.url || '');
                const fullUrl = escapeHtml(message.url || '');
                const altValue = escapeAttr(message.alt || '');
                bodyHtml = `
                    <div class="starter-message-image-wrap">
                        <img src="${preview}" alt="Starter image ${orderLabel}" class="starter-message-image-thumb">
                        <div class="starter-message-image-meta">
                            <div class="starter-message-image-url">${fullUrl || '-'}</div>
                            <input type="text" class="form-control form-control-sm starter-message-alt" data-index="${index}" value="${altValue}" placeholder="คำอธิบายรูป (optional)">
                        </div>
                    </div>
                `;
            } else if (isVideo) {
                const videoUrl = escapeAttr(message.url || '');
                const videoPreviewUrl = escapeAttr(message.previewUrl || '');
                const altValue = escapeAttr(message.alt || '');
                const canPreviewVideo = videoUrl ? `
                    <video class="starter-message-video-preview" controls preload="metadata">
                        <source src="${videoUrl}">
                    </video>
                ` : '<div class="small text-muted">ยังไม่ได้ระบุ URL วิดีโอ</div>';
                bodyHtml = `
                    <div class="starter-message-image-wrap">
                        ${canPreviewVideo}
                        <div class="starter-message-image-meta">
                            <input type="text" class="form-control form-control-sm starter-message-video-url" data-index="${index}" value="${videoUrl}" placeholder="URL วิดีโอ (จำเป็น)">
                            <input type="text" class="form-control form-control-sm starter-message-video-preview-url" data-index="${index}" value="${videoPreviewUrl}" placeholder="URL รูปตัวอย่างวิดีโอ (แนะนำสำหรับ LINE)">
                            <input type="text" class="form-control form-control-sm starter-message-alt" data-index="${index}" value="${altValue}" placeholder="คำอธิบายวิดีโอ (optional)">
                        </div>
                    </div>
                `;
            } else {
                const textValue = escapeHtml(message.content || '');
                bodyHtml = `
                    <textarea class="form-control starter-message-text" rows="3" data-index="${index}" placeholder="พิมพ์ข้อความเริ่มต้น...">${textValue}</textarea>
                `;
            }

            return `
                <div class="starter-message-item" data-index="${index}">
                    <div class="starter-message-item__head">
                        <div class="starter-message-head-left">
                            <span class="starter-message-order">${orderLabel}</span>
                            <span class="starter-message-type ${messageTypeClass}">
                                <i class="fas ${messageTypeIcon}"></i> ${messageTypeLabel}
                            </span>
                        </div>
                        <div class="starter-message-actions">
                            <button type="button" class="btn btn-sm btn-outline-secondary starter-message-move" data-action="up" data-index="${index}" ${moveUpDisabled} aria-label="เลื่อนขึ้น">
                                <i class="fas fa-arrow-up"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-secondary starter-message-move" data-action="down" data-index="${index}" ${moveDownDisabled} aria-label="เลื่อนลง">
                                <i class="fas fa-arrow-down"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger starter-message-remove" data-index="${index}" aria-label="ลบข้อความ">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    ${bodyHtml}
                </div>
            `;
        }).join('');

        starterMessagesList.innerHTML = html;
        updateStarterCounter();

        starterMessagesList.querySelectorAll('textarea.starter-message-text').forEach((textarea) => {
            textarea.addEventListener('input', (event) => {
                const index = Number(event.target.getAttribute('data-index'));
                if (!Number.isFinite(index) || !starterState.messages[index]) return;
                starterState.messages[index].content = event.target.value;
            });
        });

        starterMessagesList.querySelectorAll('input.starter-message-alt').forEach((input) => {
            input.addEventListener('input', (event) => {
                const index = Number(event.target.getAttribute('data-index'));
                if (!Number.isFinite(index) || !starterState.messages[index]) return;
                starterState.messages[index].alt = event.target.value;
            });
        });

        starterMessagesList.querySelectorAll('input.starter-message-video-url').forEach((input) => {
            input.addEventListener('input', (event) => {
                const index = Number(event.target.getAttribute('data-index'));
                if (!Number.isFinite(index) || !starterState.messages[index]) return;
                starterState.messages[index].url = event.target.value;
            });
        });

        starterMessagesList.querySelectorAll('input.starter-message-video-preview-url').forEach((input) => {
            input.addEventListener('input', (event) => {
                const index = Number(event.target.getAttribute('data-index'));
                if (!Number.isFinite(index) || !starterState.messages[index]) return;
                starterState.messages[index].previewUrl = event.target.value;
            });
        });

        starterMessagesList.querySelectorAll('.starter-message-remove').forEach((button) => {
            button.addEventListener('click', () => {
                const index = Number(button.getAttribute('data-index'));
                if (!Number.isFinite(index)) return;
                starterState.messages.splice(index, 1);
                renderStarterMessages();
            });
        });

        starterMessagesList.querySelectorAll('.starter-message-move').forEach((button) => {
            button.addEventListener('click', () => {
                const index = Number(button.getAttribute('data-index'));
                const action = button.getAttribute('data-action');
                if (!Number.isFinite(index) || !starterState.messages[index]) return;

                const targetIndex = action === 'down' ? index + 1 : index - 1;
                if (targetIndex < 0 || targetIndex >= starterState.messages.length) return;

                const next = [...starterState.messages];
                const [moving] = next.splice(index, 1);
                next.splice(targetIndex, 0, moving);
                starterState.messages = next;
                renderStarterMessages();
            });
        });
    };

    const setStarterModalBusy = (busy, options = {}) => {
        starterState.loading = !!busy;
        if (starterEnabledToggle) starterEnabledToggle.disabled = !!busy;
        if (starterAddTextBtn) starterAddTextBtn.disabled = !!busy;
        if (starterAddImageBtn) starterAddImageBtn.disabled = !!busy;
        if (starterAddVideoBtn) starterAddVideoBtn.disabled = !!busy;

        if (saveStarterConfigBtn) {
            if (busy) {
                if (!saveStarterConfigBtn.dataset.defaultHtml) {
                    saveStarterConfigBtn.dataset.defaultHtml = saveStarterConfigBtn.innerHTML;
                }
                const label = options.saveLabel || 'กำลังบันทึก...';
                saveStarterConfigBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${label}`;
                saveStarterConfigBtn.disabled = true;
            } else {
                if (saveStarterConfigBtn.dataset.defaultHtml) {
                    saveStarterConfigBtn.innerHTML = saveStarterConfigBtn.dataset.defaultHtml;
                }
                saveStarterConfigBtn.disabled = false;
            }
        }
    };

    const normalizeStarterPayloadForSave = () => {
        const payloadMessages = [];
        const messages = cloneStarterMessages(starterState.messages);
        for (let index = 0; index < messages.length; index += 1) {
            const message = messages[index];
            if (!message || typeof message !== 'object') continue;
            if (message.type === 'text') {
                const content = (message.content || '').trim();
                if (!content) {
                    return { error: `ข้อความลำดับ ${index + 1} ยังว่าง กรุณากรอกข้อความก่อนบันทึก` };
                }
                payloadMessages.push({
                    id: message.id || generateStarterTempId(),
                    type: 'text',
                    content,
                    order: payloadMessages.length
                });
                continue;
            }
            if (message.type === 'image') {
                const url = (message.url || '').trim();
                if (!url) {
                    return { error: `รูปภาพลำดับ ${index + 1} ไม่มี URL` };
                }
                const nextImage = {
                    id: message.id || generateStarterTempId(),
                    type: 'image',
                    url,
                    previewUrl: (message.previewUrl || '').trim() || url,
                    order: payloadMessages.length
                };
                const alt = (message.alt || '').trim();
                if (alt) nextImage.alt = alt;
                const fileName = (message.fileName || '').trim();
                if (fileName) nextImage.fileName = fileName;
                const assetId = (message.assetId || '').trim();
                if (assetId) nextImage.assetId = assetId;
                payloadMessages.push(nextImage);
                continue;
            }
            if (message.type === 'video') {
                const url = (message.url || '').trim();
                if (!url) {
                    return { error: `วิดีโอลำดับ ${index + 1} ไม่มี URL` };
                }
                const nextVideo = {
                    id: message.id || generateStarterTempId(),
                    type: 'video',
                    url,
                    order: payloadMessages.length
                };
                const previewUrl = (message.previewUrl || '').trim();
                if (previewUrl) nextVideo.previewUrl = previewUrl;
                const alt = (message.alt || '').trim();
                if (alt) nextVideo.alt = alt;
                const fileName = (message.fileName || '').trim();
                if (fileName) nextVideo.fileName = fileName;
                const assetId = (message.assetId || '').trim();
                if (assetId) nextVideo.assetId = assetId;
                payloadMessages.push(nextVideo);
            }
        }

        const enabled = !!starterEnabledToggle?.checked;
        if (enabled && payloadMessages.length === 0) {
            return { error: 'หากเปิดใช้งาน Starter ต้องมีข้อความอย่างน้อย 1 รายการ' };
        }

        return {
            payload: {
                enabled,
                messages: payloadMessages
            }
        };
    };

    const uploadStarterImages = async (files) => {
        if (!editorState.currentInstructionId) {
            showToast('กรุณาเลือก Instruction ก่อน', 'warning');
            return;
        }
        const uploadFiles = Array.isArray(files) ? files : Array.from(files || []);
        if (!uploadFiles.length) return;

        const formData = new FormData();
        uploadFiles.forEach((file) => formData.append('images', file));

        if (starterAddImageBtn) {
            starterAddImageBtn.disabled = true;
            if (!starterAddImageBtn.dataset.defaultHtml) {
                starterAddImageBtn.dataset.defaultHtml = starterAddImageBtn.innerHTML;
            }
            starterAddImageBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังอัปโหลด...';
        }

        try {
            const response = await fetch('/api/instructions-v2/starter-assets', {
                method: 'POST',
                body: formData
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'ไม่สามารถอัปโหลดรูปภาพได้');
            }

            const uploaded = Array.isArray(result.assets) ? result.assets : [];
            if (!uploaded.length) {
                throw new Error('ไม่พบรูปภาพที่อัปโหลดสำเร็จ');
            }

            uploaded.forEach((asset) => {
                const url = typeof asset.url === 'string' ? asset.url.trim() : '';
                if (!url) return;
                starterState.messages.push({
                    id: generateStarterTempId(),
                    type: 'image',
                    url,
                    previewUrl: (asset.previewUrl || asset.thumbUrl || asset.url || '').trim() || url,
                    alt: '',
                    fileName: (asset.fileName || '').trim(),
                    assetId: (asset.assetId || asset.id || '').toString().trim(),
                    order: starterState.messages.length
                });
            });

            renderStarterMessages();
            showToast(`เพิ่มรูปภาพ ${uploaded.length} รายการแล้ว`, 'success');
        } catch (error) {
            console.error('Error uploading starter images:', error);
            showToast(error.message || 'อัปโหลดรูปภาพไม่สำเร็จ', 'error');
        } finally {
            if (starterAddImageBtn) {
                starterAddImageBtn.disabled = false;
                if (starterAddImageBtn.dataset.defaultHtml) {
                    starterAddImageBtn.innerHTML = starterAddImageBtn.dataset.defaultHtml;
                }
            }
            if (starterImageUploadInput) {
                starterImageUploadInput.value = '';
            }
        }
    };

    const openStarterModal = async (requestedInstructionId = '', triggerButton = null) => {
        const instructionId = requestedInstructionId || editorState.currentInstructionId || instructionSelect?.value || '';
        if (!instructionId) {
            showToast('กรุณาเลือก Instruction ก่อนตั้งค่าข้อความเริ่มต้น', 'warning');
            return;
        }
        if (!conversationStarterModal) return;

        if (triggerButton) {
            triggerButton.disabled = true;
            if (!triggerButton.dataset.defaultHtml) {
                triggerButton.dataset.defaultHtml = triggerButton.innerHTML;
            }
            triggerButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>';
        }

        try {
            const response = await fetch(`/api/instructions-v2/${instructionId}`);
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success || !result.instruction) {
                throw new Error(result.error || 'ไม่สามารถโหลดข้อมูลข้อความเริ่มต้นได้');
            }

            const instruction = result.instruction;
            const starterConfig = normalizeStarterConfig(instruction.conversationStarter);
            starterState.instructionId = instructionId;
            starterState.enabled = starterConfig.enabled;
            starterState.messages = cloneStarterMessages(starterConfig.messages);

            if (starterEnabledToggle) {
                starterEnabledToggle.checked = starterState.enabled;
            }
            if (starterModalInstructionName) {
                const code = instruction.instructionId ? `[${instruction.instructionId}] ` : '';
                starterModalInstructionName.textContent = `${code}${instruction.name || 'ไม่มีชื่อ'}`;
            }

            renderStarterMessages();
            conversationStarterModal.show();
        } catch (error) {
            console.error('Error opening starter modal:', error);
            showToast(error.message || 'ไม่สามารถเปิดหน้าตั้งค่าข้อความเริ่มต้นได้', 'error');
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
                if (triggerButton.dataset.defaultHtml) {
                    triggerButton.innerHTML = triggerButton.dataset.defaultHtml;
                }
            }
        }
    };

    const saveStarterConfig = async () => {
        const instructionId = editorState.currentInstructionId || starterState.instructionId;
        if (!instructionId) {
            showToast('กรุณาเลือก Instruction ก่อนบันทึก', 'warning');
            return;
        }

        const normalizedPayload = normalizeStarterPayloadForSave();
        if (normalizedPayload.error) {
            showToast(normalizedPayload.error, 'warning');
            return;
        }

        setStarterModalBusy(true);
        try {
            const response = await fetch(`/api/instructions-v2/${instructionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationStarter: normalizedPayload.payload })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success || !result.instruction) {
                throw new Error(result.error || 'ไม่สามารถบันทึกข้อความเริ่มต้นได้');
            }

            const instruction = result.instruction;
            const starterConfig = normalizeStarterConfig(instruction.conversationStarter);
            starterState.enabled = starterConfig.enabled;
            starterState.messages = cloneStarterMessages(starterConfig.messages);

            if (starterEnabledToggle) {
                starterEnabledToggle.checked = starterState.enabled;
            }
            renderStarterMessages();

            applyStarterStatusToInstructionUI(instructionId, starterConfig, {
                name: instruction.name || instructionEditorName?.value || 'ไม่มีชื่อ',
                updatedAt: instruction.updatedAt || new Date(),
                instructionCode: instruction.instructionId
                    || instructionSelect?.querySelector(`option[value="${instructionId}"]`)?.dataset?.instructionCode
                    || ''
            });
            formatUpdatedAtText(instruction.updatedAt || new Date());

            if (conversationStarterModal) {
                conversationStarterModal.hide();
            }
            showToast('บันทึกข้อความเริ่มต้นเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('Error saving starter config:', error);
            showToast(error.message || 'บันทึกข้อความเริ่มต้นไม่สำเร็จ', 'error');
        } finally {
            setStarterModalBusy(false);
        }
    };

    if (openStarterModalButtons.length > 0) {
        openStarterModalButtons.forEach((button) => {
            button.addEventListener('click', async () => {
                const targetInstructionId = (button.dataset.id || '').trim();
                if (!targetInstructionId) return;

                if (
                    editorState.isDirty &&
                    editorState.currentInstructionId &&
                    editorState.currentInstructionId !== targetInstructionId &&
                    !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?')
                ) {
                    return;
                }

                if (instructionSelect && instructionSelect.value !== targetInstructionId) {
                    instructionSelect.value = targetInstructionId;
                }

                if (editorState.currentInstructionId !== targetInstructionId) {
                    await loadInstructionIntoEditor(targetInstructionId);
                }

                await openStarterModal(targetInstructionId, button);
            });
        });
    }

    if (starterAddTextBtn) {
        starterAddTextBtn.addEventListener('click', () => {
            starterState.messages.push({
                id: generateStarterTempId(),
                type: 'text',
                content: '',
                order: starterState.messages.length
            });
            renderStarterMessages();
        });
    }

    if (starterAddImageBtn && starterImageUploadInput) {
        starterAddImageBtn.addEventListener('click', () => {
            starterImageUploadInput.click();
        });
        starterImageUploadInput.addEventListener('change', (event) => {
            uploadStarterImages(event.target.files);
        });
    }

    if (starterAddVideoBtn) {
        starterAddVideoBtn.addEventListener('click', () => {
            starterState.messages.push({
                id: generateStarterTempId(),
                type: 'video',
                url: '',
                previewUrl: '',
                alt: '',
                order: starterState.messages.length
            });
            renderStarterMessages();
        });
    }

    if (saveStarterConfigBtn) {
        saveStarterConfigBtn.addEventListener('click', saveStarterConfig);
    }

    if (starterEnabledToggle) {
        starterEnabledToggle.addEventListener('change', () => {
            starterState.enabled = !!starterEnabledToggle.checked;
        });
    }

    if (conversationStarterModalRoot) {
        conversationStarterModalRoot.addEventListener('hidden.bs.modal', () => {
            if (starterImageUploadInput) {
                starterImageUploadInput.value = '';
            }
        });
    }

    // ===== Existing Modals / Actions =====

    // Create Instruction
    document.getElementById('createInstructionBtn').addEventListener('click', () => {
        document.getElementById('instructionModalTitle').textContent = 'สร้าง Instruction';
        document.getElementById('instructionId').value = '';
        document.getElementById('instructionName').value = '';
        document.getElementById('instructionDescription').value = '';
        instructionModal.show();
    });

    // Save Instruction
    document.getElementById('saveInstructionBtn').addEventListener('click', async () => {
        const id = document.getElementById('instructionId').value;
        const name = document.getElementById('instructionName').value.trim();
        const description = document.getElementById('instructionDescription').value.trim();

        if (!name) {
            showToast('กรุณาระบุชื่อ Instruction', 'warning');
            return;
        }

        try {
            const url = id ? `/api/instructions-v2/${id}` : '/api/instructions-v2';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });

            const data = await res.json();

            if (data.success) {
                instructionModal.hide();
                showToast('บันทึก Instruction แล้ว', 'success');
                setTimeout(() => location.reload(), 350);
            } else {
                showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
            }
        } catch (err) {
            console.error('Error saving instruction:', err);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    });

    // Edit Instruction
    document.querySelectorAll('.edit-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            try {
                const res = await fetch(`/api/instructions-v2/${id}`);
                const data = await res.json();

                if (data.success) {
                    document.getElementById('instructionModalTitle').textContent = 'แก้ไข Instruction';
                    document.getElementById('instructionId').value = id;
                    document.getElementById('instructionName').value = data.instruction.name || '';
                    document.getElementById('instructionDescription').value = data.instruction.description || '';
                    instructionModal.show();
                } else {
                    showToast(data.error || 'ไม่พบ Instruction', 'error');
                }
            } catch (err) {
                console.error('Error fetching instruction:', err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    });

    // Delete Instruction
    document.querySelectorAll('.delete-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            if (!confirm('ต้องการลบ Instruction นี้หรือไม่?')) return;

            try {
                const res = await fetch(`/api/instructions-v2/${id}`, {
                    method: 'DELETE'
                });

                const data = await res.json();

                if (data.success) {
                    showToast('ลบ Instruction แล้ว', 'success');
                    setTimeout(() => location.reload(), 280);
                } else {
                    showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error('Error deleting instruction:', err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    });

    // Duplicate Instruction
    document.querySelectorAll('.duplicate-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) return;

            const existingNames = new Set(
                Array.from(document.querySelectorAll('.instruction-card .instruction-title'))
                    .map(el => (el.textContent || '').trim().toLowerCase())
                    .filter(Boolean)
            );

            let name = prompt('ชื่อ Instruction ใหม่:');
            if (name === null) return;
            name = (name || '').trim();
            if (!name) return;

            while (existingNames.has(name.toLowerCase())) {
                showToast('ชื่อ Instruction นี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น', 'warning');
                name = prompt('ชื่อซ้ำ กรุณาใส่ชื่อใหม่:', name);
                if (name === null) return;
                name = (name || '').trim();
                if (!name) return;
            }

            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

            try {
                const res = await fetch(`/api/instructions-v2/${id}/duplicate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });

                const data = await res.json();

                if (data.success) {
                    showToast('คัดลอก Instruction แล้ว', 'success');
                    setTimeout(() => location.reload(), 280);
                } else {
                    showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error('Error duplicating instruction:', err);
                showToast('เกิดข้อผิดพลาด', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        });
    });

    // Preview Instruction
    document.querySelectorAll('.preview-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            try {
                const res = await fetch(`/api/instructions-v2/${id}/preview`);
                const data = await res.json();

                if (data.success) {
                    document.getElementById('previewContent').textContent = data.preview || '(ว่างเปล่า)';
                    document.getElementById('previewDataItemCount').textContent = data.stats.dataItemCount;
                    document.getElementById('previewCharCount').textContent = data.stats.charCount;
                    document.getElementById('previewTokenCount').textContent = data.stats.tokenCount;
                    previewModal.show();
                } else {
                    showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error('Error previewing instruction:', err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    });

    // Edit Data Item - Text uses V2, Table uses V3
    document.querySelectorAll('.edit-data-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const instructionId = btn.dataset.instructionId;
            const itemId = btn.dataset.itemId;
            const itemType = btn.dataset.itemType || 'table';

            if (itemType === 'text') {
                window.location.href = `/admin/instructions-v2/${instructionId}/data-items/${itemId}/edit`;
            } else {
                window.location.href = `/admin/instructions-v3/${instructionId}/data-items/${itemId}/edit`;
            }
        });
    });

    // Delete Data Item
    document.querySelectorAll('.delete-data-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const instructionId = btn.dataset.instructionId;
            const itemId = btn.dataset.itemId;

            if (!confirm('ต้องการลบชุดข้อมูลนี้หรือไม่?')) return;

            try {
                const res = await fetch(`/api/instructions-v2/${instructionId}/data-items/${itemId}`, {
                    method: 'DELETE'
                });

                const data = await res.json();

                if (data.success) {
                    showToast('ลบข้อมูลแล้ว', 'success');
                    setTimeout(() => location.reload(), 280);
                } else {
                    showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error('Error deleting data item:', err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    });

    // Duplicate Data Item
    document.querySelectorAll('.duplicate-data-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const instructionId = btn.dataset.instructionId;
            const itemId = btn.dataset.itemId;

            try {
                const res = await fetch(`/api/instructions-v2/${instructionId}/data-items/${itemId}/duplicate`, {
                    method: 'POST'
                });

                const data = await res.json();

                if (data.success) {
                    showToast('คัดลอกข้อมูลแล้ว', 'success');
                    setTimeout(() => location.reload(), 280);
                } else {
                    showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error('Error duplicating data item:', err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    });

    // Add Data Item - Show type selection modal
    const selectDataTypeModal = new bootstrap.Modal(document.getElementById('selectDataTypeModal'));
    const newDataItemInstructionIdInput = document.getElementById('newDataItemInstructionId');

    document.querySelectorAll('.add-data-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const instructionId = btn.dataset.instructionId;
            if (!instructionId) {
                return;
            }
            // Store the instruction ID and show the selection modal
            newDataItemInstructionIdInput.value = instructionId;
            selectDataTypeModal.show();
        });
    });

    // Handle Text data item creation - Use V2 editor
    document.getElementById('createTextDataItem').addEventListener('click', () => {
        const instructionId = newDataItemInstructionIdInput.value;
        if (!instructionId) return;
        selectDataTypeModal.hide();
        window.location.href = `/admin/instructions-v2/${instructionId}/data-items/new`;
    });

    // Handle Table data item creation
    document.getElementById('createTableDataItem').addEventListener('click', () => {
        const instructionId = newDataItemInstructionIdInput.value;
        if (!instructionId) return;
        selectDataTypeModal.hide();
        // V3 editor for table type
        window.location.href = `/admin/instructions-v3/${instructionId}/data-items/new`;
    });

    // Search Instructions (filter dropdown options)
    const searchInput = document.getElementById('searchInstructions');
    if (searchInput && instructionSelect) {
        searchInput.addEventListener('input', (e) => {
            const query = (e.target.value || '').trim().toLowerCase();
            const selectedValue = instructionSelect.value;
            Array.from(instructionSelect.options).forEach((opt) => {
                if (!opt.value) {
                    opt.hidden = false;
                    opt.disabled = false;
                    return;
                }
                if (opt.value === selectedValue) {
                    opt.hidden = false;
                    opt.disabled = false;
                    return;
                }
                const text = (opt.textContent || '').toLowerCase();
                const matches = !query || text.includes(query);
                opt.hidden = !matches;
                opt.disabled = !matches;
            });
        });
    }

    // ===== Data Item Reordering =====
    const getSiblingDataItem = (itemElement, direction) => {
        let sibling = direction === 'up'
            ? itemElement.previousElementSibling
            : itemElement.nextElementSibling;
        while (sibling && !sibling.classList.contains('data-item')) {
            sibling = direction === 'up'
                ? sibling.previousElementSibling
                : sibling.nextElementSibling;
        }
        return sibling;
    };

    const updateDataItemOrderUI = (container) => {
        const orderSpans = container.querySelectorAll('.data-item-order');
        orderSpans.forEach((span, idx) => {
            span.textContent = `${idx + 1}.`;
        });
    };

    const applyDataItemOrder = (container, itemIds) => {
        const addButton = container.querySelector('.add-data-item');
        const map = {};
        container.querySelectorAll('.data-item').forEach(item => {
            map[item.dataset.itemId] = item;
        });
        itemIds.forEach(id => {
            const element = map[id];
            if (!element) return;
            if (addButton) {
                container.insertBefore(element, addButton);
            } else {
                container.appendChild(element);
            }
        });
    };

    const setInstructionReorderLoading = (instructionId, isLoading) => {
        document.querySelectorAll(`.move-data-item[data-instruction-id="${instructionId}"]`)
            .forEach(btn => {
                if (isLoading) {
                    if (!btn.dataset.originalHtml) {
                        btn.dataset.originalHtml = btn.innerHTML;
                    }
                    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                    btn.disabled = true;
                } else {
                    if (btn.dataset.originalHtml) {
                        btn.innerHTML = btn.dataset.originalHtml;
                    }
                    btn.disabled = false;
                }
            });
    };

    const persistDataItemOrder = async (instructionId, itemIds, container, fallbackOrder) => {
        setInstructionReorderLoading(instructionId, true);
        try {
            const res = await fetch(`/api/instructions-v2/${instructionId}/data-items/reorder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถสลับลำดับได้');
            }
            return true;
        } catch (err) {
            console.error('Error reordering data items:', err);
            showToast(err.message || 'ไม่สามารถสลับลำดับได้', 'error');
            if (Array.isArray(fallbackOrder) && fallbackOrder.length > 0) {
                applyDataItemOrder(container, fallbackOrder);
                updateDataItemOrderUI(container);
            }
            return false;
        } finally {
            setInstructionReorderLoading(instructionId, false);
        }
    };

    const initDataItemReorderControls = () => {
        document.querySelectorAll('.move-data-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const direction = btn.dataset.direction;
                const instructionId = btn.dataset.instructionId;
                const itemElement = btn.closest('.data-item');
                const container = btn.closest('.data-items-container');

                if (!direction || !instructionId || !itemElement || !container) return;

                const target = getSiblingDataItem(itemElement, direction);
                if (!target) return;

                const previousOrder = Array.from(container.querySelectorAll('.data-item'))
                    .map(item => item.dataset.itemId);

                if (direction === 'up') {
                    container.insertBefore(itemElement, target);
                } else {
                    container.insertBefore(itemElement, target.nextElementSibling);
                }

                updateDataItemOrderUI(container);

                const newOrder = Array.from(container.querySelectorAll('.data-item'))
                    .map(item => item.dataset.itemId);

                await persistDataItemOrder(instructionId, newOrder, container, previousOrder);
                updateDataItemOrderUI(container);
            });
        });
    };

    initDataItemReorderControls();

    // Export Button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            window.location.href = '/api/instructions-v2/export';
        });
    }

    // Import Button (Modal Trigger)
    // Note: The button #importBtn now triggers the modal via data-bs-toggle attribute.

    // Excel Upload Modal Logic
    const excelUploadForm = document.getElementById('excelUploadForm');
    const previewExcelBtn = document.getElementById('previewExcelBtn');
    const uploadExcelBtn = document.getElementById('uploadExcelBtn');
    const excelPreviewSection = document.getElementById('excelPreviewSection');
    const excelPreviewContent = document.getElementById('excelPreviewContent');

    if (excelUploadForm) {
        // Preview
        if (previewExcelBtn) {
            previewExcelBtn.addEventListener('click', async () => {
                const formData = new FormData(excelUploadForm);
                const fileInput = document.getElementById('excelFileInput');
                if (!fileInput.files.length) {
                    showToast('กรุณาเลือกไฟล์ Excel', 'warning');
                    return;
                }

                previewExcelBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังโหลด...';
                previewExcelBtn.disabled = true;

                try {
                    const res = await fetch('/api/instructions-v2/preview-import', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();

                    if (data.success) {
                        if (excelPreviewSection) excelPreviewSection.classList.remove('d-none');
                        if (uploadExcelBtn) uploadExcelBtn.disabled = false;

                        if (excelPreviewContent) {
                            excelPreviewContent.innerHTML = '';
                            const previews = Array.isArray(data.previews) ? data.previews : [];
                            const wrapper = document.createElement('div');
                            wrapper.className = 'table-responsive';

                            const table = document.createElement('table');
                            table.className = 'table table-sm table-bordered mb-0';

                            const thead = document.createElement('thead');
                            thead.className = 'table-light';
                            const headRow = document.createElement('tr');
                            ['Instruction Name', 'Items', 'Description'].forEach((text) => {
                                const th = document.createElement('th');
                                th.textContent = text;
                                headRow.appendChild(th);
                            });
                            thead.appendChild(headRow);
                            table.appendChild(thead);

                            const tbody = document.createElement('tbody');
                            previews.forEach((preview) => {
                                const row = document.createElement('tr');
                                const nameCell = document.createElement('td');
                                nameCell.textContent = preview.name || '';
                                const countCell = document.createElement('td');
                                countCell.className = 'text-center';
                                countCell.textContent = String(preview.itemsCount ?? '');
                                const descCell = document.createElement('td');
                                descCell.className = 'small text-muted';
                                descCell.textContent = preview.description || '-';
                                row.appendChild(nameCell);
                                row.appendChild(countCell);
                                row.appendChild(descCell);
                                tbody.appendChild(row);
                            });
                            table.appendChild(tbody);
                            wrapper.appendChild(table);
                            excelPreviewContent.appendChild(wrapper);

                            const summary = document.createElement('div');
                            summary.className = 'mt-2 text-success small';
                            summary.innerHTML = `<i class="fas fa-check-circle me-1"></i> พร้อมนำเข้า ${previews.length} Instructions`;
                            excelPreviewContent.appendChild(summary);
                        }
                    } else {
                        showToast(data.error || 'ไม่สามารถดูตัวอย่างไฟล์ได้', 'error');
                        if (uploadExcelBtn) uploadExcelBtn.disabled = true;
                    }
                } catch (err) {
                    console.error(err);
                    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
                } finally {
                    previewExcelBtn.innerHTML = '<i class="fas fa-eye me-1"></i> ดูตัวอย่าง';
                    previewExcelBtn.disabled = false;
                }
            });
        }

        // Upload
        excelUploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(excelUploadForm);

            if (uploadExcelBtn) {
                uploadExcelBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังนำเข้า...';
                uploadExcelBtn.disabled = true;
            }

            try {
                const res = await fetch('/api/instructions-v2/import', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (data.success) {
                    showToast(data.message || 'นำเข้าข้อมูลเรียบร้อยแล้ว', 'success');
                    setTimeout(() => location.reload(), 320);
                } else {
                    showToast(data.error || 'เกิดข้อผิดพลาดในการนำเข้า', 'error');
                    if (uploadExcelBtn) {
                        uploadExcelBtn.disabled = false;
                        uploadExcelBtn.innerHTML = '<i class="fas fa-upload me-1"></i> นำเข้าข้อมูล';
                    }
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
                if (uploadExcelBtn) {
                    uploadExcelBtn.disabled = false;
                    uploadExcelBtn.innerHTML = '<i class="fas fa-upload me-1"></i> นำเข้าข้อมูล';
                }
            }
        });
    }

    // Auto-select instruction from URL
    const urlParams = new URLSearchParams(window.location.search);
    const instructionIdParam = urlParams.get('instructionId');
    if (instructionIdParam && instructionSelect) {
        // Wait for options to be populated if needed, but usually they are server-rendered.
        // Check if option exists
        const option = instructionSelect.querySelector(`option[value="${instructionIdParam}"]`);
        if (option) {
            instructionSelect.value = instructionIdParam;
            instructionSelect.dispatchEvent(new Event('change'));
        }
    }

})();
