(() => {
    const state = {
        pages: [],
        currentPage: null,
        users: [],
        summary: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0, dateKey: '' },
        isLoadingUsers: false,
        socket: null,
        config: window.followUpDashboardConfig || {},
        currentContextConfig: null,
        modalRounds: [],
        statusFilter: 'all',
        overview: {
            summary: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 },
            groups: []
        }
    };

    const el = {
        list: document.getElementById('followupList'),
        emptyState: document.getElementById('followupEmptyState'),
        search: document.getElementById('followupSearch'),
        refresh: document.getElementById('followupRefreshBtn'),
        editBtn: document.getElementById('followupEditBtn'),
        pageSelector: document.getElementById('followupPageSelector'),
        pageLabel: document.getElementById('followupPageLabel'),
        statusPills: document.getElementById('followupStatusPills'),
        modalRoot: document.getElementById('followupSettingsModal'),
        modalAutoSend: document.getElementById('followupModalAutoSend'),
        modalRoundsContainer: document.getElementById('followupModalRoundsContainer'),
        modalRounds: document.getElementById('followupModalRounds'),
        modalAddRound: document.getElementById('followupModalAddRound'),
        modalResetBtn: document.getElementById('followupModalResetBtn'),
        modalSaveBtn: document.getElementById('followupModalSaveBtn'),
        modalTitle: document.getElementById('followupModalTitle'),
        summaryActive: document.getElementById('followupMetricActive'),
        summaryCompleted: document.getElementById('followupMetricCompleted'),
        summaryCanceled: document.getElementById('followupMetricCanceled'),
        summaryFailed: document.getElementById('followupMetricFailed'),
        countAll: document.getElementById('countAll'),
        countActive: document.getElementById('countActive'),
        countCompleted: document.getElementById('countCompleted'),
        countCanceled: document.getElementById('countCanceled'),
        countFailed: document.getElementById('countFailed'),
        schedulePreview: document.getElementById('followupSchedulePreview'),
        autoStatusBadge: document.getElementById('followupAutoStatusBadge')
    };

    const modalInstance = el.modalRoot ? new bootstrap.Modal(el.modalRoot) : null;

    const MODEL_OPTIONS = [
        { value: 'gpt-5-nano', label: 'GPT-5 Nano (ค่าเริ่มต้น - ประหยัดสุด)' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini (แนะนำ)' },
        { value: 'gpt-5', label: 'GPT-5' },
        { value: 'gpt-5-chat-latest', label: 'GPT-5 Chat Latest' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
        { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
        { value: 'o3', label: 'O3 (ทรงพลังสุด)' }
    ];

    const getDefaultPromptInstructions = () => {
        const cfg = state.config || {};
        return typeof cfg.defaultOrderPromptInstructions === 'string'
            ? cfg.defaultOrderPromptInstructions
            : '';
    };

    const getPromptJsonSuffix = () => {
        const cfg = state.config || {};
        return typeof cfg.orderPromptJsonSuffix === 'string'
            ? cfg.orderPromptJsonSuffix
            : '';
    };

    const normalizeId = (value) => {
        if (value === undefined || value === null) return null;
        return String(value);
    };

    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const escapeAttr = (text) => {
        if (text === undefined || text === null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    const cloneRoundImage = (image) => {
        if (!image || !image.url) return null;
        const url = String(image.url);
        const previewUrl = typeof image.previewUrl === 'string' && image.previewUrl
            ? image.previewUrl
            : (typeof image.thumbUrl === 'string' && image.thumbUrl ? image.thumbUrl : url);
        const cloned = {
            url,
            previewUrl
        };
        if (image.thumbUrl) cloned.thumbUrl = image.thumbUrl;
        if (image.assetId) cloned.assetId = image.assetId;
        if (image.id) cloned.id = image.id;
        if (image.fileName) cloned.fileName = image.fileName;
        if (image.alt) cloned.alt = image.alt;
        if (image.caption) cloned.caption = image.caption;
        if (Number.isFinite(Number(image.width))) cloned.width = Number(image.width);
        if (Number.isFinite(Number(image.height))) cloned.height = Number(image.height);
        if (Number.isFinite(Number(image.size))) cloned.size = Number(image.size);
        return cloned;
    };

    const sanitizeRoundImages = (images) => {
        if (!Array.isArray(images)) return [];
        return images
            .map(img => {
                if (!img || !img.url) return null;
                const url = String(img.url).trim();
                if (!url) return null;
                const previewUrl = typeof img.previewUrl === 'string' && img.previewUrl.trim()
                    ? img.previewUrl.trim()
                    : (typeof img.thumbUrl === 'string' && img.thumbUrl.trim() ? img.thumbUrl.trim() : url);
                const sanitized = { url, previewUrl };
                if (typeof img.thumbUrl === 'string' && img.thumbUrl.trim()) sanitized.thumbUrl = img.thumbUrl.trim();
                const assetId = img.assetId || img.id;
                if (assetId) sanitized.assetId = String(assetId);
                if (typeof img.fileName === 'string' && img.fileName.trim()) sanitized.fileName = img.fileName.trim();
                if (typeof img.alt === 'string' && img.alt.trim()) sanitized.alt = img.alt.trim();
                if (typeof img.caption === 'string' && img.caption.trim()) sanitized.caption = img.caption.trim();
                const toRounded = (value) => {
                    const num = Number(value);
                    return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
                };
                const width = toRounded(img.width);
                const height = toRounded(img.height);
                const size = toRounded(img.size);
                if (width) sanitized.width = width;
                if (height) sanitized.height = height;
                if (size) sanitized.size = size;
                return sanitized;
            })
            .filter(Boolean);
    };

    const formatRoundPreview = (round) => {
        if (!round) return '';
        const message = typeof round.message === 'string' ? round.message.trim() : '';
        const imageCount = Array.isArray(round.images) ? round.images.length : 0;
        if (message && imageCount > 0) {
            return `${message} • รูปภาพ ${imageCount} รูป`;
        }
        if (message) return message;
        if (imageCount > 0) return `ส่งรูปภาพ ${imageCount} รูป`;
        return '';
    };

    const formatDateTime = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatRelativeTime = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const diffMs = Date.now() - date.getTime();
        if (diffMs < 0) return formatDateTime(value);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
        if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
        if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
        return formatDateTime(value);
    };

    const formatDelayMinutes = (minutes) => {
        const value = Number(minutes);
        if (!Number.isFinite(value) || value <= 0) return '-';
        if (value < 60) return `${value} นาที`;
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        if (mins === 0) {
            return `${hours} ชม.`;
        }
        return `${hours} ชม. ${mins} นาที`;
    };

    const defaultSummary = () => ({
        total: 0,
        active: 0,
        completed: 0,
        canceled: 0,
        failed: 0
    });

    const getGroupForPage = (pageId) => {
        if (!pageId || !state.overview || !Array.isArray(state.overview.groups)) return null;
        return state.overview.groups.find(group => group.contextKey === pageId) || null;
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>ส่งครบแล้ว</span>';
            case 'canceled':
                return '<span class="badge bg-secondary"><i class="fas fa-ban me-1"></i>ยกเลิกแล้ว</span>';
            case 'failed':
                return '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle me-1"></i>ส่งไม่สำเร็จ</span>';
            case 'active':
                return '<span class="badge bg-warning text-dark"><i class="fas fa-sync me-1"></i>กำลังติดตาม</span>';
            default:
                return '<span class="badge bg-info text-dark"><i class="fas fa-clock me-1"></i>รอดำเนินการ</span>';
        }
    };

    const setRoundsDisabled = (disabled) => {
        if (el.modalRoundsContainer) {
            el.modalRoundsContainer.classList.toggle('opacity-50', disabled);
        }
        if (el.modalAddRound) {
            el.modalAddRound.disabled = !!disabled;
        }
    };

    const uploadRoundImages = async (roundIndex, files) => {
        if (!Array.isArray(files) || files.length === 0) return;
        if (!Array.isArray(state.modalRounds)) return;
        const round = state.modalRounds[roundIndex];
        if (!round) return;
        if (!Array.isArray(round.images)) {
            round.images = [];
        }

        round.isUploading = true;
        renderModalRounds();

        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('images', file);
                const response = await fetch('/admin/followup/assets', {
                    method: 'POST',
                    body: formData
                });
                let result;
                try {
                    result = await response.json();
                } catch (parseError) {
                    result = { success: false, error: 'อัพโหลดรูปภาพไม่สำเร็จ' };
                }
                if (!response.ok || !result.success) {
                    showAlert('danger', result.error || 'อัพโหลดรูปภาพไม่สำเร็จ');
                    continue;
                }
                const uploaded = Array.isArray(result.assets) ? result.assets : [];
                uploaded.forEach(asset => {
                    const cloned = cloneRoundImage({
                        url: asset.url,
                        previewUrl: asset.previewUrl || asset.thumbUrl || asset.url,
                        thumbUrl: asset.thumbUrl,
                        assetId: asset.assetId || asset.id,
                        id: asset.id,
                        width: asset.width,
                        height: asset.height,
                        size: asset.size,
                        fileName: asset.fileName
                    });
                    if (cloned) {
                        round.images.push(cloned);
                    }
                });
            }
        } catch (error) {
            console.error('upload follow-up images error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ');
        } finally {
            delete round.isUploading;
            renderModalRounds();
        }
    };

    const renderModalRounds = () => {
        if (!el.modalRounds) return;
        if (!Array.isArray(state.modalRounds)) {
            state.modalRounds = [];
        }

        if (state.modalRounds.length === 0) {
            el.modalRounds.innerHTML = '<div class="text-muted small py-2">ยังไม่มีรอบการติดตาม กดปุ่ม "เพิ่มข้อความ" เพื่อเริ่มต้น</div>';
            return;
        }

        el.modalRounds.innerHTML = state.modalRounds.map((round, index) => {
            if (!round || typeof round !== 'object') {
                state.modalRounds[index] = { delayMinutes: 10, message: '', images: [] };
            }
            if (!Array.isArray(state.modalRounds[index].images)) {
                state.modalRounds[index].images = [];
            }
            const delayValue = Number(state.modalRounds[index].delayMinutes);
            const safeMessage = escapeHtml(state.modalRounds[index].message || '');
            const images = state.modalRounds[index].images;
            const imageItems = images.length
                ? images.map((img, imgIndex) => {
                    const preview = escapeAttr(img.previewUrl || img.thumbUrl || img.url || '');
                    const full = escapeAttr(img.url || '');
                    const caption = escapeHtml(img.caption || img.alt || '');
                    return `
                        <div class="col-auto">
                            <div class="followup-round-image-card">
                                <a href="${full}" target="_blank" rel="noopener" class="followup-round-image-link">
                                    <img src="${preview}" alt="${caption || 'รูปภาพ'}" class="followup-round-image-thumb">
                                </a>
                                <button type="button" class="btn btn-sm btn-outline-danger followup-round-remove-image" data-index="${index}" data-image-index="${imgIndex}" title="ลบรูปภาพนี้">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<div class="col-12 text-muted small">ยังไม่มีรูปภาพ</div>';
            const uploading = round?.isUploading
                ? '<div class="text-muted small mt-2"><i class="fas fa-spinner fa-spin me-1"></i>กำลังอัพโหลด...</div>'
                : '';

            return `
                <div class="followup-round-item border rounded p-3 mb-3 bg-white" data-index="${index}">
                    <div class="row g-3 align-items-start">
                        <div class="col-md-3">
                            <label class="form-label form-label-sm text-muted mb-1">เวลาหลังคุยล่าสุด</label>
                            <div class="input-group input-group-sm">
                                <input type="number" class="form-control followup-round-delay" min="1" step="1" value="${Number.isFinite(delayValue) ? delayValue : ''}">
                                <span class="input-group-text">นาที</span>
                            </div>
                        </div>
                        <div class="col-md-8 col-lg-7">
                            <label class="form-label form-label-sm text-muted mb-1">ข้อความ (ไม่บังคับ)</label>
                            <textarea class="form-control form-control-sm followup-round-message" rows="2" placeholder="กรอกข้อความติดตาม (เว้นว่างได้ หากต้องการส่งเฉพาะรูปภาพ)">${safeMessage}</textarea>
                        </div>
                        <div class="col-md-1 d-flex justify-content-end">
                            <button type="button" class="btn btn-sm btn-outline-danger followup-round-remove" title="ลบรอบนี้">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="col-12">
                            <label class="form-label form-label-sm text-muted mb-1">รูปภาพแนบ (ไม่บังคับ)</label>
                            <div class="followup-round-images" data-index="${index}">
                                <div class="row g-2 align-items-center">
                                    ${imageItems}
                                </div>
                                ${uploading}
                                <button type="button" class="btn btn-sm btn-outline-primary followup-round-add-image mt-2" data-index="${index}" ${round?.isUploading ? 'disabled' : ''}>
                                    <i class="fas fa-image me-1"></i>เพิ่มรูป
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        el.modalRounds.querySelectorAll('.followup-round-delay').forEach(input => {
            const container = input.closest('.followup-round-item');
            if (!container) return;
            const index = Number(container.dataset.index);
            input.addEventListener('input', (event) => {
                const value = Number(event.target.value);
                state.modalRounds[index].delayMinutes = Number.isFinite(value) ? value : '';
            });
        });

        el.modalRounds.querySelectorAll('.followup-round-message').forEach(textarea => {
            const container = textarea.closest('.followup-round-item');
            if (!container) return;
            const index = Number(container.dataset.index);
            textarea.addEventListener('input', (event) => {
                state.modalRounds[index].message = event.target.value;
            });
        });

        el.modalRounds.querySelectorAll('.followup-round-remove').forEach(btn => {
            const container = btn.closest('.followup-round-item');
            if (!container) return;
            const index = Number(container.dataset.index);
            btn.addEventListener('click', () => {
                state.modalRounds.splice(index, 1);
                renderModalRounds();
            });
        });

        el.modalRounds.querySelectorAll('.followup-round-add-image').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(index)) return;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.addEventListener('change', (event) => {
                    const files = Array.from(event.target.files || []);
                    if (!files.length) return;
                    uploadRoundImages(index, files);
                });
                input.click();
            });
        });

        el.modalRounds.querySelectorAll('.followup-round-remove-image').forEach(btn => {
            btn.addEventListener('click', () => {
                const roundIndex = Number(btn.getAttribute('data-index'));
                const imageIndex = Number(btn.getAttribute('data-image-index'));
                if (!Number.isFinite(roundIndex) || !Number.isFinite(imageIndex)) return;
                const round = state.modalRounds[roundIndex];
                if (!round || !Array.isArray(round.images)) return;
                round.images.splice(imageIndex, 1);
                renderModalRounds();
            });
        });
    };

    const addModalRound = (round) => {
        if (!Array.isArray(state.modalRounds)) {
            state.modalRounds = [];
        }
        const fallbackDelay = state.modalRounds.length > 0
            ? Number(state.modalRounds[state.modalRounds.length - 1].delayMinutes) || 10
            : 10;
        const nextRound = {
            delayMinutes: Number(round?.delayMinutes) || fallbackDelay,
            message: round?.message || '',
            images: Array.isArray(round?.images)
                ? round.images.map(cloneRoundImage).filter(Boolean)
                : []
        };
        state.modalRounds.push(nextRound);
        renderModalRounds();
    };

    const collectRoundsPayload = () => {
        if (!Array.isArray(state.modalRounds)) return [];
        return state.modalRounds
            .map(round => {
                const delay = Number(round?.delayMinutes);
                if (!Number.isFinite(delay) || delay < 1) return null;
                const message = typeof round?.message === 'string' ? round.message.trim() : '';
                const images = sanitizeRoundImages(round?.images);
                if (!message && images.length === 0) return null;
                return {
                    delayMinutes: Math.round(delay),
                    message,
                    images
                };
            })
            .filter(Boolean);
    };

    const handleAutoSendToggle = () => {
        const enabled = el.modalAutoSend && el.modalAutoSend.checked;
        setRoundsDisabled(!enabled);
    };

    const renderSchedulePreview = (config) => {
        if (!el.schedulePreview) return;
        if (!config) {
            el.schedulePreview.innerHTML = '<div class="text-muted small">เลือกหน้าเพจเพื่อดูแผนการส่งข้อความ</div>';
            return;
        }
        if (config.autoFollowUpEnabled === false) {
            el.schedulePreview.innerHTML = '<div class="text-muted small">ระบบจะไม่ส่งข้อความอัตโนมัติสำหรับเพจนี้</div>';
            return;
        }
        const rounds = Array.isArray(config.rounds) ? config.rounds : [];
        if (!rounds.length) {
            el.schedulePreview.innerHTML = '<div class="text-muted small">ยังไม่ได้กำหนดข้อความติดตาม</div>';
            return;
        }
        const html = rounds.map((round, index) => {
            const delay = Number(round.delayMinutes);
            const label = formatDelayMinutes(delay);
            const message = typeof round.message === 'string' ? round.message.trim() : '';
            const imageCount = Array.isArray(round.images) ? round.images.length : 0;
            const messageHtml = message ? `<div class="schedule-message">${escapeHtml(message)}</div>` : '';
            const mediaHtml = imageCount > 0
                ? `<div class="schedule-media text-muted small"><i class="fas fa-image me-1"></i>${imageCount} รูป</div>`
                : '';
            const emptyPlaceholder = !message && imageCount === 0
                ? '<div class="schedule-message text-muted">-</div>'
                : '';
            return `
                <div class="followup-schedule-item">
                    <div class="schedule-order">${index + 1}</div>
                    <div class="schedule-detail">
                        <div class="schedule-time">+${label}</div>
                        ${messageHtml || emptyPlaceholder}
                        ${mediaHtml}
                    </div>
                </div>
            `;
        }).join('');
        el.schedulePreview.innerHTML = html;
    };

    const updateConfigDisplay = (config) => {
        const analysisOn = config && config.analysisEnabled !== false;
        if (el.analysisLabel) {
            el.analysisLabel.textContent = analysisOn ? 'วิเคราะห์ด้วย AI (เปิด)' : 'วิเคราะห์ด้วย AI (ปิด)';
        }
        if (el.autoStatusBadge) {
            const autoOn = config && config.autoFollowUpEnabled !== false;
            el.autoStatusBadge.textContent = autoOn ? 'ส่งข้อความอัตโนมัติ (เปิด)' : 'ส่งข้อความอัตโนมัติ (ปิด)';
            el.autoStatusBadge.classList.remove('bg-success', 'bg-secondary');
            el.autoStatusBadge.classList.add(autoOn ? 'bg-success' : 'bg-secondary');
        }
        if (el.analysisSubtitle) {
            if (!config) {
                el.analysisSubtitle.textContent = 'เลือกหน้าเพจเพื่อดูรายละเอียดการติดตาม';
            } else if (config.autoFollowUpEnabled === false) {
                el.analysisSubtitle.textContent = 'ระบบจะไม่ส่งข้อความอัตโนมัติจนกว่าจะเปิดใช้งาน';
            } else {
                const parts = ['AI จะวิเคราะห์ว่าลูกค้าซื้อแล้วหรือยัง ถ้าซื้อแล้วจะหยุดส่งข้อความติดตามอัตโนมัติ'];
                if (config.model) {
                    const modelInfo = MODEL_OPTIONS.find(m => m.value === config.model);
                    parts.push(`โมเดล: ${modelInfo ? modelInfo.label : config.model}`);
                }
                el.analysisSubtitle.textContent = parts.join(' • ');
            }
        }
        renderSchedulePreview(config);
    };

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

    const ensureAlertToastContainer = () => {
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
    };

    const createAlertToastElement = (type, message) => {
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
    };

    const showAlert = (type, message) => {
        const container = ensureAlertToastContainer();
        const { toast, closeBtn } = createAlertToastElement(type, message);

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        const hideToast = () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => {
                toast.remove();
            }, 220);
        };

        const timeoutId = setTimeout(hideToast, 5000);

        closeBtn.addEventListener('click', () => {
            clearTimeout(timeoutId);
            hideToast();
        });
    };

    const renderPageSelector = () => {
        if (!el.pageSelector) return;
        if (!state.pages.length) {
            el.pageSelector.innerHTML = '<div class="text-muted small py-2">ยังไม่มีเพจ</div>';
            return;
        }
        const html = state.pages.map(page => {
            const active = state.currentPage && page.id === state.currentPage.id;
            const group = getGroupForPage(page.id);
            const activeCount = group?.stats?.active || 0;
            const icon = page.platform === 'facebook' ? 'fab fa-facebook' : 'fab fa-line';
            return `
                <button class="followup-page-item ${active ? 'active' : ''}" data-page-id="${page.id}">
                    <span><i class="${icon} page-icon"></i>${escapeHtml(page.name)}</span>
                    ${activeCount > 0 ? `<span class="page-count">${activeCount}</span>` : ''}
                </button>
            `;
        }).join('');
        el.pageSelector.innerHTML = html;
        el.pageSelector.querySelectorAll('button[data-page-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pageId = btn.getAttribute('data-page-id');
                if (!pageId) return;
                selectPage(pageId);
            });
        });
    };

    const loadOverview = async (options = {}) => {
        try {
            const response = await fetch('/admin/followup/overview');
            const data = await response.json();
            if (data.success) {
                const summaryData = data.summary || {};
                state.overview = {
                    summary: {
                        total: summaryData.total || 0,
                        active: summaryData.active || 0,
                        completed: summaryData.completed || 0,
                        canceled: summaryData.canceled || 0,
                        failed: summaryData.failed || 0
                    },
                    groups: Array.isArray(data.groups) ? data.groups : []
                };
                if (state.pages.length) {
                    renderPageSelector();
                }
                updateMetrics();
            } else if (!options.silent) {
                showAlert('danger', data.error || 'ไม่สามารถโหลดข้อมูลภาพรวมได้');
            }
        } catch (error) {
            console.error('load follow-up overview error', error);
            if (!options.silent) {
                showAlert('danger', 'เกิดข้อผิดพลาดในการโหลดข้อมูลภาพรวม');
            }
        }
    };

    const renderPageGrid = () => {
        if (!el.pageGrid) return;
        if (!state.pages.length) {
            el.pageGrid.innerHTML = `
                <div class="text-muted small">
                    ยังไม่มีเพจที่เชื่อมต่อกับระบบ โปรดเพิ่ม LINE Bot หรือ Facebook Page ก่อน
                </div>
            `;
            return;
        }

        const groupsMap = new Map();
        if (state.overview && Array.isArray(state.overview.groups)) {
            state.overview.groups.forEach(group => {
                groupsMap.set(group.contextKey, group);
            });
        }

        const now = Date.now();
        const rowsHtml = state.pages.map(page => {
            const group = groupsMap.get(page.id) || null;
            const stats = group?.stats || defaultSummary();
            const usersInGroup = Array.isArray(group?.users) ? group.users : [];
            const dueSoon = usersInGroup.filter(user => {
                if (user.status !== 'active' || !user.nextScheduledAt) return false;
                const time = new Date(user.nextScheduledAt).getTime();
                if (Number.isNaN(time)) return false;
                const diff = time - now;
                return diff >= 0 && diff <= 30 * 60000;
            }).length;
            const autoEnabled = page.settings && page.settings.autoFollowUpEnabled !== false;
            const analysisEnabled = page.settings && page.settings.analysisEnabled !== false;
            const platformLabel = page.platform === 'facebook' ? 'Facebook' : 'LINE';
            const subtitle = page.platform === 'facebook'
                ? `${platformLabel} • เพจที่เชื่อมต่อ`
                : `${platformLabel} • บอทที่เชื่อมต่อ`;
            const isActive = state.currentPage && state.currentPage.id === page.id;
            const showInDashboard = !(page.settings && page.settings.showInDashboard === false);
            const showInChat = !(page.settings && page.settings.showInChat === false);
            const rowClasses = ['followup-page-row'];
            if (isActive) rowClasses.push('is-active');
            if (!showInDashboard) rowClasses.push('is-muted');
            const badges = [
                `<span class="badge ${autoEnabled ? 'bg-success-soft text-success' : 'bg-secondary'}">${autoEnabled ? 'ส่งอัตโนมัติ: เปิด' : 'ส่งอัตโนมัติ: ปิด'}</span>`,
                `<span class="badge ${analysisEnabled ? 'bg-info' : 'bg-secondary'}">วิเคราะห์ด้วย AI: ${analysisEnabled ? 'เปิด' : 'ปิด'}</span>`,
                `<span class="badge ${showInDashboard ? 'bg-primary-soft text-primary' : 'bg-warning text-dark'}">${showInDashboard ? 'แสดงในแดชบอร์ด' : 'ซ่อนจากแดชบอร์ด'}</span>`,
                `<span class="badge ${showInChat ? 'bg-light text-dark' : 'bg-secondary'}">ป้ายหน้าแชท: ${showInChat ? 'เปิด' : 'ปิด'}</span>`
            ];

            return `
                <tr class="${rowClasses.join(' ')}" data-page-id="${page.id}">
                    <td class="followup-page-info" data-label="เพจ / บอท">
                        <div class="followup-page-name">
                            ${escapeHtml(page.name)}
                            ${isActive ? '<span class="badge bg-success-soft text-success ms-2">กำลังดูอยู่</span>' : ''}
                        </div>
                        <div class="followup-page-subtitle text-muted small">${escapeHtml(subtitle)}</div>
                        <div class="followup-page-flags d-flex flex-wrap gap-2 mt-2">
                            ${badges.join('')}
                        </div>
                        ${dueSoon > 0 ? `<div class="followup-page-meta text-muted small mt-2">รอส่งภายใน 30 นาที: <strong>${dueSoon}</strong> ราย</div>` : ''}
                    </td>
                    <td class="followup-page-stats" data-label="สถิติวันนี้">
                        <div class="followup-page-stat">
                            <span class="label">กำลังติดตาม</span>
                            <span class="value">${stats.active || 0}</span>
                        </div>
                        <div class="followup-page-stat">
                            <span class="label">ส่งครบแล้ว</span>
                            <span class="value text-success">${stats.completed || 0}</span>
                        </div>
                        <div class="followup-page-stat">
                            <span class="label">ยกเลิกแล้ว</span>
                            <span class="value text-muted">${stats.canceled || 0}</span>
                        </div>
                        <div class="followup-page-stat">
                            <span class="label">ส่งไม่สำเร็จ</span>
                            <span class="value text-danger">${stats.failed || 0}</span>
                        </div>
                    </td>
                    <td class="followup-page-control text-center" data-label="ส่งอัตโนมัติ">
                        <div class="form-check form-switch justify-content-center">
                            <input class="form-check-input followup-auto-toggle" type="checkbox" data-page-id="${page.id}" ${autoEnabled ? 'checked' : ''} aria-label="สลับการส่งอัตโนมัติสำหรับ ${escapeHtml(page.name)}">
                        </div>
                    </td>
                    <td class="followup-page-actions text-end" data-label="การจัดการ">
                        <div class="btn-group btn-group-sm" role="group" aria-label="การจัดการเพจ ${escapeHtml(page.name)}">
                            <button type="button" class="btn btn-outline-primary" data-action="select" data-page-id="${page.id}">
                                <i class="fas fa-eye me-1"></i>ดูลูกค้า
                            </button>
                            <button type="button" class="btn btn-outline-secondary" data-action="edit" data-page-id="${page.id}">
                                <i class="fas fa-sliders-h me-1"></i>แก้ไข
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        el.pageGrid.innerHTML = `
            <div class="table-responsive followup-page-table-wrapper">
                <table class="table table-hover align-middle followup-page-table">
                    <thead>
                        <tr>
                            <th scope="col">เพจ / บอท</th>
                            <th scope="col" class="followup-page-stats-head">สถิติวันนี้</th>
                            <th scope="col" class="text-center">ส่งอัตโนมัติ</th>
                            <th scope="col" class="text-end">การจัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        el.pageGrid.querySelectorAll('.followup-auto-toggle').forEach(input => {
            input.addEventListener('change', async (event) => {
                const pageId = event.target.getAttribute('data-page-id');
                if (!pageId) return;
                const enabled = event.target.checked;
                try {
                    await updatePageAutoSend(pageId, enabled, event.target);
                } catch (_) { }
            });
        });

        el.pageGrid.querySelectorAll('[data-action="select"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pageId = btn.getAttribute('data-page-id');
                if (!pageId) return;
                selectPage(pageId);
                el.pageLabel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        el.pageGrid.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pageId = btn.getAttribute('data-page-id');
                if (!pageId) return;
                if (!state.currentPage || state.currentPage.id !== pageId) {
                    selectPage(pageId, { skipReload: false });
                }
                setTimeout(() => {
                    openSettingsModal();
                }, 150);
            });
        });

        el.pageGrid.querySelectorAll('tbody tr[data-page-id]').forEach(row => {
            row.addEventListener('click', (event) => {
                const target = event.target;
                if (target.closest('.followup-auto-toggle') || target.closest('.btn-group') || target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'LABEL') {
                    return;
                }
                const pageId = row.getAttribute('data-page-id');
                if (!pageId) return;
                selectPage(pageId);
            });
        });
    };

    const savePageSettingsQuick = async (page, settings) => {
        if (!page) throw new Error('ไม่พบเพจที่ต้องการแก้ไข');
        const payload = {
            platform: page.platform,
            botId: page.botId,
            settings
        };
        const response = await fetch('/admin/followup/page-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
        }
        page.settings = { ...(page.settings || {}), ...settings };
        page.hasOverride = true;
        return data;
    };

    const updatePageAutoSend = async (pageId, enabled, inputEl) => {
        const page = state.pages.find(p => p.id === pageId);
        if (!page) {
            if (inputEl) inputEl.checked = !enabled;
            showAlert('danger', 'ไม่พบข้อมูลเพจที่เลือก');
            return;
        }
        if (inputEl) inputEl.disabled = true;
        try {
            await savePageSettingsQuick(page, { autoFollowUpEnabled: !!enabled });
            showAlert('success', enabled
                ? `เปิดการส่งติดตามอัตโนมัติสำหรับ ${page.name}`
                : `ปิดการส่งติดตามอัตโนมัติสำหรับ ${page.name}`
            );

            if (state.currentPage && state.currentPage.id === pageId) {
                state.currentContextConfig = {
                    ...(state.currentContextConfig || {}),
                    autoFollowUpEnabled: !!enabled
                };
                updateToolbar();
                renderSchedulePreview(state.currentContextConfig);
            }

            renderPageSelector();
            renderPageGrid();
            await loadOverview({ silent: true });
            if (state.currentPage && state.currentPage.id === pageId) {
                await loadUsers(true);
            }
        } catch (error) {
            console.error('update auto follow error', error);
            if (inputEl) inputEl.checked = !enabled;
            showAlert('danger', error.message || 'ไม่สามารถอัปเดตการตั้งค่าได้');
        } finally {
            if (inputEl) inputEl.disabled = false;
        }
    };

    const updateMetrics = () => {
        const globalSummary = state.overview?.summary || defaultSummary();
        const currentGroup = state.currentPage ? getGroupForPage(state.currentPage.id) : null;
        const currentStats = currentGroup?.stats || state.summary || defaultSummary();

        // Update summary cards
        if (el.summaryActive) el.summaryActive.textContent = globalSummary.active || 0;
        if (el.summaryCompleted) el.summaryCompleted.textContent = globalSummary.completed || 0;
        if (el.summaryCanceled) el.summaryCanceled.textContent = globalSummary.canceled || 0;
        if (el.summaryFailed) el.summaryFailed.textContent = globalSummary.failed || 0;

        // Update sidebar status counts
        const total = (currentStats.active || 0) + (currentStats.completed || 0) +
            (currentStats.canceled || 0) + (currentStats.failed || 0);
        if (el.countAll) el.countAll.textContent = total;
        if (el.countActive) el.countActive.textContent = currentStats.active || 0;
        if (el.countCompleted) el.countCompleted.textContent = currentStats.completed || 0;
        if (el.countCanceled) el.countCanceled.textContent = currentStats.canceled || 0;
        if (el.countFailed) el.countFailed.textContent = currentStats.failed || 0;
    };

    const updateToolbar = () => {
        if (!state.currentPage) {
            if (el.pageLabel) el.pageLabel.textContent = 'เลือกเพจเพื่อดูรายการ';
            if (el.autoStatusBadge) {
                el.autoStatusBadge.textContent = 'ปิดส่งอัตโนมัติ';
                el.autoStatusBadge.classList.remove('active');
            }
            if (el.editBtn) el.editBtn.disabled = true;
            if (el.search) {
                el.search.value = '';
                el.search.disabled = true;
            }
            return;
        }

        const cfg = state.currentContextConfig || state.currentPage.settings || {};

        if (el.pageLabel) {
            el.pageLabel.textContent = state.currentPage.name;
        }

        if (el.autoStatusBadge) {
            const autoOn = cfg.autoFollowUpEnabled !== false;
            el.autoStatusBadge.textContent = autoOn ? 'ส่งอัตโนมัติ: เปิด' : 'ส่งอัตโนมัติ: ปิด';
            el.autoStatusBadge.classList.toggle('active', autoOn);
        }

        if (el.editBtn) el.editBtn.disabled = false;

        if (el.search) {
            el.search.disabled = false;
        }

        const disabledDashboard = state.currentContextConfig && state.currentContextConfig.showInDashboard === false;
        if (el.refresh) {
            el.refresh.disabled = !!disabledDashboard;
        }

        updateConfigDisplay(state.currentContextConfig || state.currentPage.settings || null);
    };

    const renderLoadingState = () => {
        if (!el.list) return;
        el.list.innerHTML = `
            <div class="followup-loading">
                <div class="spinner-border text-primary" role="status"></div>
                <span class="ms-2">กำลังโหลด...</span>
            </div>
        `;
    };

    const renderDisabledState = () => {
        if (!el.emptyState) return;
        state.users = [];
        state.summary = { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };
        el.emptyState.classList.remove('d-none');
        if (!state.currentPage) {
            el.emptyState.innerHTML = `
                <i class="fas fa-layer-group fa-2x mb-2 text-muted"></i>
                <p class="mb-1">ยังไม่มีหน้าเพจที่เปิดใช้งาน</p>
                <p class="small mb-0">เพิ่มหรือเปิดการแสดงผลเพจจากการตั้งค่าเพื่อเริ่มติดตามลูกค้า</p>
            `;
        } else {
            el.emptyState.innerHTML = `
                <i class="fas fa-eye-slash fa-2x mb-2 text-muted"></i>
                <p class="mb-1">แดชบอร์ดสำหรับเพจนี้ถูกปิดไว้</p>
                <p class="small mb-0">เปิดใช้การแสดงผลในแดชบอร์ดเพื่อดูรายชื่อลูกค้าที่ต้องติดตาม</p>
            `;
        }
        if (el.list) el.list.innerHTML = '';
    };

    const renderUserTimeline = (user) => {
        const rounds = Array.isArray(user.rounds) ? user.rounds : [];
        if (!rounds.length) {
            return '<div class="text-muted small">ยังไม่ได้ตั้งค่าข้อความติดตามสำหรับเพจนี้</div>';
        }
        return `
            <div class="followup-timeline">
                ${rounds.map((round, index) => {
            const status = round?.status || 'pending';
            let displayStatus = status;
            let statusLabel = 'รอส่ง';
            if (status === 'sent') {
                statusLabel = 'ส่งแล้ว';
            } else if (status === 'failed') {
                statusLabel = 'ส่งไม่สำเร็จ';
            } else if (user.status === 'canceled') {
                statusLabel = 'ถูกยกเลิก';
                displayStatus = 'canceled';
            }

            const scheduledAt = round?.scheduledAt ? formatDateTime(round.scheduledAt) : null;
            const relative = round?.sentAt
                ? `ส่งเมื่อ ${formatRelativeTime(round.sentAt)}`
                : scheduledAt
                    ? `กำหนดส่ง ${formatRelativeTime(round.scheduledAt)}`
                    : `หลัง +${formatDelayMinutes(round?.delayMinutes)}`;
            const absolute = scheduledAt || `+${formatDelayMinutes(round?.delayMinutes)}`;
            const messageText = typeof round?.message === 'string' ? round.message.trim() : '';
            const messageHtml = messageText
                ? `<div class="timeline-message">${escapeHtml(messageText)}</div>`
                : '';
            const images = Array.isArray(round?.images) ? round.images : [];
            const imagesHtml = images.length
                ? `<div class="timeline-images mt-2">
                                ${images.map(img => {
                    const preview = escapeAttr(img.previewUrl || img.thumbUrl || img.url || '');
                    const full = escapeAttr(img.url || '');
                    const caption = escapeHtml(img.caption || img.alt || 'รูปภาพจากระบบติดตาม');
                    return `
                                        <a href="${full}" target="_blank" rel="noopener" class="timeline-image-link">
                                            <img src="${preview}" alt="${caption}" class="timeline-image-thumb">
                                        </a>
                                    `;
                }).join('')}
                            </div>`
                : '';
            const emptyContent = !messageText && images.length === 0
                ? '<div class="timeline-message text-muted">ไม่มีข้อความ</div>'
                : '';

            return `
                        <div class="followup-timeline-item ${displayStatus}">
                            <div class="timeline-dot"></div>
                            <div class="timeline-body">
                                <div class="timeline-header d-flex justify-content-between align-items-center">
                                    <span class="timeline-index">รอบที่ ${index + 1}</span>
                                    <span class="timeline-status">${statusLabel}</span>
                                </div>
                                <div class="timeline-time text-muted">${relative} (${absolute})</div>
                                ${messageHtml || emptyContent}
                                ${imagesHtml}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    };

    const renderUsers = () => {
        if (!el.list) return;
        const cfg = state.currentContextConfig;
        if (!state.currentPage || (cfg && cfg.showInDashboard === false)) {
            renderDisabledState();
            return;
        }
        const keyword = el.search && typeof el.search.value === 'string'
            ? el.search.value.trim().toLowerCase()
            : '';
        const statusFilter = state.statusFilter || 'all';
        const byStatus = state.users.filter(user => {
            if (statusFilter === 'all') return true;
            return user.status === statusFilter;
        });
        const filtered = byStatus.filter(user => {
            if (!keyword) return true;
            const fields = [
                user.displayName || '',
                user.userId || '',
                user.nextMessage || '',
                user.lastUserMessagePreview || ''
            ];
            return fields.some(value => String(value).toLowerCase().includes(keyword));
        });

        if (!filtered.length) {
            if (el.list) el.list.innerHTML = '';
            if (el.emptyState) {
                el.emptyState.classList.remove('d-none');
                const emptyTitle = keyword
                    ? 'ไม่พบข้อมูลที่ตรงกับคำค้น'
                    : 'ยังไม่มีลูกค้าในสถานะนี้';
                const emptySubtitle = keyword
                    ? 'ลองเปลี่ยนคำค้นหา หรือรอลูกค้าพูดคุยเพิ่มเติม'
                    : 'เมื่อมีลูกค้าที่ตรงเงื่อนไข ระบบจะแสดงรายชื่อที่นี่';
                el.emptyState.innerHTML = `
                    <i class="fas fa-search fa-2x mb-2 text-muted"></i>
                    <p class="mb-1">${emptyTitle}</p>
                    <p class="small mb-0">${emptySubtitle}</p>
                `;
            }
            return;
        }

        if (el.emptyState) {
            el.emptyState.classList.add('d-none');
        }

        const cards = filtered.map(user => {
            const initials = escapeHtml((user.displayName || '?').charAt(0).toUpperCase());
            const platformBadge = user.platform === 'facebook'
                ? '<span class="badge bg-primary-soft text-primary"><i class="fab fa-facebook me-1"></i>Facebook</span>'
                : '<span class="badge bg-success-soft text-success"><i class="fab fa-line me-1"></i>LINE</span>';
            const statusBadge = getStatusBadge(user.status);
            const nextRoundData = Array.isArray(user.rounds)
                ? user.rounds.find(round => round && round.status !== 'sent')
                : null;
            const nextPreview = formatRoundPreview(nextRoundData);
            const nextMessageText = nextPreview || user.nextMessage || '-';
            const nextMessage = escapeHtml(nextMessageText);
            const nextMediaHtml = nextRoundData && Array.isArray(nextRoundData.images) && nextRoundData.images.length
                ? `<div class="followup-next-media text-muted small"><i class="fas fa-image me-1"></i>${nextRoundData.images.length} รูป</div>`
                : '';
            const nextScheduleRelative = user.nextScheduledAt ? formatRelativeTime(user.nextScheduledAt) : 'ยังไม่มีนัดหมาย';
            const nextScheduleExact = user.nextScheduledAt ? formatDateTime(user.nextScheduledAt) : '-';
            const lastCustomerMessage = escapeHtml(user.lastUserMessagePreview || '-');
            const lastCustomerTime = user.lastUserMessageAt ? formatRelativeTime(user.lastUserMessageAt) : '-';
            const progressLabel = `${user.sentRounds || 0}/${user.totalRounds || 0}`;
            const lastFollowUp = user.lastFollowUpAt ? formatRelativeTime(user.lastFollowUpAt) : 'ยังไม่เคยส่ง';
            const canceledInfo = user.status === 'canceled' && user.canceledReason
                ? `<div class="followup-section text-muted small">เหตุผลการยกเลิก: ${escapeHtml(user.canceledReason)}</div>`
                : '';
            const timeline = renderUserTimeline(user);
            const canCancel = user.status === 'active';
            return `
                <div class="followup-card" data-user-id="${escapeHtml(user.userId)}">
                    <div class="followup-card-header">
                        <div class="followup-avatar">${initials}</div>
                        <div class="followup-card-meta">
                            <div class="followup-name">${escapeHtml(user.displayName || user.userId)}</div>
                            <div class="followup-sub">${escapeHtml(user.userId)} • ${platformBadge}</div>
                        </div>
                        <div class="followup-status-badge">${statusBadge}</div>
                    </div>
                    <div class="followup-card-body">
                        <div class="followup-section">
                            <div class="label">ข้อความถัดไป</div>
                            <div class="value">${nextMessage}</div>
                            ${nextMediaHtml}
                            <div class="meta">${nextScheduleExact} (${nextScheduleRelative})</div>
                        </div>
                        <div class="followup-section">
                            <div class="label">ข้อความล่าสุดจากลูกค้า</div>
                            <div class="value">${lastCustomerMessage}</div>
                            <div class="meta">${lastCustomerTime}</div>
                        </div>
                        <div class="followup-section">
                            <div class="label">ความคืบหน้า</div>
                            <div class="value">${progressLabel} รอบ</div>
                            <div class="meta">ส่งล่าสุด: ${lastFollowUp}</div>
                        </div>
                        <div class="followup-section">
                            <div class="label">ตารางข้อความ</div>
                            ${timeline}
                        </div>
                        ${canceledInfo}
                    </div>
                    <div class="followup-card-actions">
                        <button class="btn btn-sm btn-outline-secondary" data-action="open-chat">
                            <i class="fas fa-comments me-1"></i>เปิดหน้าแชท
                        </button>
                        <button class="btn btn-sm btn-outline-danger" data-action="clear-task" ${canCancel ? '' : 'disabled'}>
                            <i class="fas fa-ban me-1"></i>${canCancel ? 'หยุดติดตามวันนี้' : 'หยุดติดตามแล้ว'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        el.list.innerHTML = cards;
        el.list.querySelectorAll('.followup-card button[data-action="clear-task"]').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                if (btn.disabled) return;
                const card = event.currentTarget.closest('.followup-card');
                const userId = card ? card.getAttribute('data-user-id') : null;
                if (!userId) return;
                if (!confirm('ยืนยันยกเลิกการติดตามสำหรับลูกค้ารายนี้หรือไม่?')) return;
                await clearUser(userId);
            });
        });

        el.list.querySelectorAll('.followup-card button[data-action="open-chat"]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const card = event.currentTarget.closest('.followup-card');
                const userId = card ? card.getAttribute('data-user-id') : null;
                if (!userId) return;
                window.location.href = `/admin/chat?focus=${encodeURIComponent(userId)}`;
            });
        });
    };

    const clearUser = async (userId) => {
        try {
            const response = await fetch('/admin/followup/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'ยกเลิกการติดตามเรียบร้อยแล้ว');
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถยกเลิกการติดตามได้');
            }
        } catch (error) {
            console.error('clear follow-up error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการยกเลิกการติดตาม');
        }
    };

    const loadPages = async () => {
        try {
            const response = await fetch('/admin/followup/page-settings');
            const data = await response.json();
            if (!data.success) {
                showAlert('danger', data.error || 'ไม่สามารถดึงข้อมูลเพจได้');
                state.pages = [];
                renderPageSelector();
                renderPageGrid();
                return;
            }
            const previousId = state.currentPage ? state.currentPage.id : null;
            state.pages = (data.pages || []).map(page => ({
                ...page,
                settings: page.settings || {}
            }));
            renderPageSelector();
            renderPageGrid();
            if (state.pages.length === 0) {
                state.currentPage = null;
                updateToolbar();
                renderUsers();
                return;
            }
            const fallback = state.pages.find(p => p.id === previousId)
                || state.pages.find(p => p.settings.showInDashboard !== false)
                || state.pages[0];
            selectPage(fallback.id, { skipReload: true });
        } catch (error) {
            console.error('load follow-up pages error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการดึงข้อมูลเพจ');
            renderPageGrid();
        }
    };

    const loadUsers = async (showMessage = false) => {
        if (!state.currentPage) return;
        if (state.currentContextConfig && state.currentContextConfig.showInDashboard === false) {
            renderDisabledState();
            updateMetrics();
            return;
        }
        if (state.isLoadingUsers) return;
        state.isLoadingUsers = true;
        renderLoadingState();
        try {
            const params = new URLSearchParams();
            if (state.currentPage.platform) params.set('platform', state.currentPage.platform);
            if (state.currentPage.botId) params.set('botId', state.currentPage.botId);
            const response = await fetch(`/admin/followup/users${params.toString() ? `?${params.toString()}` : ''}`);
            const data = await response.json();
            if (data.success) {
                state.users = data.users || [];
                const summaryData = data.summary || {};
                state.summary = {
                    total: typeof summaryData.total === 'number' ? summaryData.total : state.users.length,
                    active: typeof summaryData.active === 'number' ? summaryData.active : (state.users.length || 0),
                    completed: typeof summaryData.completed === 'number' ? summaryData.completed : 0,
                    canceled: typeof summaryData.canceled === 'number' ? summaryData.canceled : 0,
                    failed: typeof summaryData.failed === 'number' ? summaryData.failed : 0,
                    dateKey: summaryData.dateKey || ''
                };
                if (data.config) {
                    state.currentContextConfig = data.config;
                    const pageIndex = state.pages.findIndex(p => p.id === (state.currentPage && state.currentPage.id));
                    if (pageIndex >= 0) {
                        state.pages[pageIndex].settings = data.config;
                    }
                }
                const currentGroup = state.currentPage ? getGroupForPage(state.currentPage.id) : null;
                if (currentGroup) {
                    currentGroup.users = state.users.slice();
                    currentGroup.stats = {
                        total: state.summary.total || 0,
                        active: state.summary.active || 0,
                        completed: state.summary.completed || 0,
                        canceled: state.summary.canceled || 0,
                        failed: state.summary.failed || 0
                    };
                }
                if (state.overview && Array.isArray(state.overview.groups) && state.overview.groups.length) {
                    const previousSummary = state.overview.summary || {};
                    const aggregated = state.overview.groups.reduce((acc, group) => {
                        const stats = group.stats || {};
                        acc.total += stats.total || 0;
                        acc.active += stats.active || 0;
                        acc.completed += stats.completed || 0;
                        acc.canceled += stats.canceled || 0;
                        acc.failed += stats.failed || 0;
                        return acc;
                    }, defaultSummary());
                    state.overview.summary = {
                        ...aggregated,
                        dateKey: previousSummary.dateKey || state.summary.dateKey || ''
                    };
                }
                updateToolbar();
                updateMetrics();
                renderUsers();
                renderPageGrid();
                await loadOverview({ silent: true });
                if (showMessage) {
                    showAlert('info', 'อัปเดตรายการล่าสุดแล้ว');
                }
            } else if (data.disabled) {
                state.users = [];
                state.summary = { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };
                state.currentContextConfig = data.config || null;
                renderDisabledState();
                updateToolbar();
                updateMetrics();
                renderPageGrid();
                await loadOverview({ silent: true });
                showAlert('warning', data.message || 'เพจนี้ถูกปิดจากแดชบอร์ด');
            } else {
                showAlert('danger', data.error || 'ไม่สามารถดึงข้อมูลได้');
            }
        } catch (error) {
            console.error('load follow-up users error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า');
            renderUsers();
        } finally {
            state.isLoadingUsers = false;
        }
    };

    const selectPage = (pageId, options = {}) => {
        const page = state.pages.find(p => p.id === pageId);
        if (!page) return;
        state.currentPage = page;
        state.currentContextConfig = page.settings || null;
        if (el.search) {
            el.search.value = '';
        }
        if (options.skipReload) {
            state.users = [];
            state.summary = { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };
        }
        renderPageSelector();
        renderPageGrid();
        updateToolbar();
        updateMetrics();
        if (!options.skipReload) {
            loadUsers();
        } else {
            renderUsers();
        }
    };

    const openSettingsModal = () => {
        if (!state.currentPage || !modalInstance) return;
        const cfg = state.currentContextConfig || state.currentPage.settings || {};
        if (el.modalTitle) {
            el.modalTitle.textContent = `ตั้งค่าเพจ: ${state.currentPage.name}`;
        }
        if (el.modalAutoSend) el.modalAutoSend.checked = cfg.autoFollowUpEnabled !== false;
        state.modalRounds = Array.isArray(cfg.rounds)
            ? cfg.rounds.map(round => ({
                delayMinutes: Number(round.delayMinutes) || '',
                message: typeof round.message === 'string' ? round.message : '',
                images: Array.isArray(round.images)
                    ? round.images.map(cloneRoundImage).filter(Boolean)
                    : []
            }))
            : [];
        renderModalRounds();
        handleAutoSendToggle();
        if (el.modalResetBtn) {
            el.modalResetBtn.disabled = !state.currentPage.hasOverride;
        }
        modalInstance.show();
    };

    const saveSettings = async () => {
        if (!state.currentPage) return;
        const payload = {
            platform: state.currentPage.platform,
            botId: state.currentPage.botId,
            settings: {
                analysisEnabled: true,
                autoFollowUpEnabled: !!(el.modalAutoSend && el.modalAutoSend.checked),
                showInChat: true,
                showInDashboard: true
            }
        };
        payload.settings.rounds = collectRoundsPayload();
        try {
            const response = await fetch('/admin/followup/page-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'บันทึกการตั้งค่าเพจเรียบร้อยแล้ว');
                modalInstance.hide();
                await loadPages();
                await loadUsers();
                await loadOverview({ silent: true });
            } else {
                showAlert('danger', data.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
            }
        } catch (error) {
            console.error('save follow-up page settings error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
        }
    };

    const resetSettings = async () => {
        if (!state.currentPage) return;
        if (!confirm('ต้องการคืนค่าเริ่มต้นสำหรับเพจนี้หรือไม่?')) return;
        try {
            const response = await fetch('/admin/followup/page-settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: state.currentPage.platform,
                    botId: state.currentPage.botId
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'คืนค่าเริ่มต้นเรียบร้อยแล้ว');
                modalInstance.hide();
                await loadPages();
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถคืนค่าเริ่มต้นได้');
            }
        } catch (error) {
            console.error('reset follow-up page settings error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการคืนค่าเริ่มต้น');
        }
    };

    const initSocket = () => {
        if (state.socket || !state.config || state.config.showDashboard === false) return;
        try {
            state.socket = io();
            state.socket.on('followUpTagged', (data) => {
                const dataPlatform = data && data.platform !== undefined ? data.platform : null;
                const dataBotId = normalizeId(data && data.botId !== undefined ? data.botId : null);
                if (!state.currentPage) return;
                const currentBotId = normalizeId(state.currentPage.botId);
                const platformMatch = dataPlatform === null || dataPlatform === state.currentPage.platform;
                const botMatch = dataBotId === null || dataBotId === currentBotId;
                if (platformMatch && botMatch) {
                    loadUsers();
                }
            });
            state.socket.on('followUpScheduleUpdated', (data) => {
                const dataPlatform = data && data.platform !== undefined ? data.platform : null;
                const dataBotId = normalizeId(data && data.botId !== undefined ? data.botId : null);
                if (!state.currentPage) return;
                const currentBotId = normalizeId(state.currentPage.botId);
                const platformMatch = dataPlatform === null || dataPlatform === state.currentPage.platform;
                const botMatch = dataBotId === null || dataBotId === currentBotId;
                if (platformMatch && botMatch) {
                    loadUsers();
                }
            });
        } catch (error) {
            console.warn('ไม่สามารถเชื่อมต่อ Socket.IO ได้', error);
        }
    };

    const setStatusFilter = (status) => {
        state.statusFilter = status || 'all';
        if (el.filterButtons && typeof el.filterButtons.forEach === 'function') {
            el.filterButtons.forEach(btn => {
                const btnStatus = btn.getAttribute('data-status') || 'all';
                if (btnStatus === state.statusFilter) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        renderUsers();
    };

    const setupEventListeners = () => {
        if (el.search) {
            el.search.addEventListener('input', () => {
                renderUsers();
            });
        }
        if (el.refresh) {
            el.refresh.addEventListener('click', () => {
                loadUsers(true);
            });
        }
        if (el.editBtn) {
            el.editBtn.addEventListener('click', () => {
                if (state.currentPage) {
                    openSettingsModal();
                }
            });
        }
        if (el.modalSaveBtn) {
            el.modalSaveBtn.addEventListener('click', () => {
                saveSettings();
            });
        }
        if (el.modalResetBtn) {
            el.modalResetBtn.addEventListener('click', () => {
                resetSettings();
            });
        }
        // Status pill filters
        if (el.statusPills) {
            el.statusPills.querySelectorAll('.followup-status-pill').forEach(btn => {
                btn.addEventListener('click', () => {
                    const status = btn.getAttribute('data-status') || 'all';
                    setStatusFilter(status);
                    // Update active state
                    el.statusPills.querySelectorAll('.followup-status-pill').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
        if (el.modalAutoSend) {
            el.modalAutoSend.addEventListener('change', () => {
                handleAutoSendToggle();
            });
        }
        if (el.modalAddRound) {
            el.modalAddRound.addEventListener('click', () => {
                addModalRound({ delayMinutes: 10, message: '' });
            });
        }
    };

    const init = async () => {
        setupEventListeners();
        setStatusFilter(state.statusFilter || 'all');
        await loadOverview({ silent: true });
        await loadPages();
        initSocket();
        if (state.currentPage) {
            await loadUsers();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
