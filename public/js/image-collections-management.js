// Image Collections & Bot Assignment Management
(function () {
    const state = {
        collections: [],
        assets: [],
        lineBots: [],
        facebookBots: [],
        collectionFilter: '',
        assetFilter: '',
        collectionAssetFilter: '',
        botCollectionFilter: '',
        editingCollectionId: null,
        editingBot: null,
        collectionUsageFilter: 'all',
        uploadQueue: [],
        isUploading: false,
        selectedAssetLabels: new Set(),
        assetEdits: new Map()
    };

    const elements = {
        section: null,
        collectionsList: null,
        collectionsCount: null,
        collectionsSearch: null,
        collectionFilterButtons: null,
        addCollectionBtn: null,
        refreshCollectionsBtn: null,
        assetsCount: null,
        assetsSearch: null,
        assetsList: null,
        uploadDropzone: null,
        uploadSelectBtn: null,
        assetFile: null,
        clearUploadQueueBtn: null,
        startUploadQueueBtn: null,
        uploadQueueSummary: null,
        uploadQueueList: null,
        lineAssignments: null,
        facebookAssignments: null,
        collectionModal: null,
        collectionForm: null,
        collectionId: null,
        collectionName: null,
        collectionDescription: null,
        collectionAssetSearch: null,
        collectionAssetList: null,
        collectionAssetCount: null,
        saveCollectionBtn: null,
        deleteCollectionBtn: null,
        botModal: null,
        botModalLabel: null,
        botModalSummary: null,
        botCollectionsSearch: null,
        botCollectionsList: null,
        saveBotCollectionsBtn: null
    };

    const formatTimestamp = (value) => {
        if (!value) return '-';
        try {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '-';
            return date.toLocaleString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (err) {
            console.warn('Invalid date value', value, err);
            return '-';
        }
    };

    const escapeHtml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const escapeAttribute = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    const formatFileSize = (bytes) => {
        const size = Number(bytes);
        if (!Number.isFinite(size) || size <= 0) return '-';
        const kb = size / 1024;
        if (kb < 1024) {
            return `${kb.toFixed(1)} KB`;
        }
        const mb = kb / 1024;
        return `${mb.toFixed(1)} MB`;
    };

    const getCollectionById = (id) => state.collections.find((item) => item._id === id);

    const getCollectionName = (id) => {
        const collection = getCollectionById(id);
        return collection ? collection.name : id;
    };

    const computeCollectionUsage = (collectionId) => {
        const isUsedByLine = state.lineBots.filter((bot) =>
            Array.isArray(bot.selectedImageCollections) &&
            bot.selectedImageCollections.includes(collectionId)
        ).length;
        const isUsedByFacebook = state.facebookBots.filter((bot) =>
            Array.isArray(bot.selectedImageCollections) &&
            bot.selectedImageCollections.includes(collectionId)
        ).length;
        return { line: isUsedByLine, facebook: isUsedByFacebook };
    };

    const cacheElements = () => {
        elements.section = document.getElementById('imageCollectionsSection');
        if (!elements.section) return;
        elements.collectionsList = document.getElementById('imageCollectionsList');
        elements.collectionsCount = document.getElementById('imageCollectionsCount');
        elements.collectionsSearch = document.getElementById('imageCollectionsSearch');
        elements.collectionFilterButtons = document.querySelectorAll('[data-usage-filter]');
        elements.addCollectionBtn = document.getElementById('createImageCollectionBtn');
        elements.refreshCollectionsBtn = document.getElementById('refreshImageCollectionsBtn');
        elements.assetsCount = document.getElementById('imageAssetsCount');
        elements.assetsSearch = document.getElementById('imageAssetsSearch');
        elements.assetsList = document.getElementById('imageAssetsList');
        elements.uploadDropzone = document.getElementById('imageAssetDropzone');
        elements.uploadSelectBtn = document.getElementById('triggerImageAssetSelect');
        elements.assetFile = document.getElementById('imageAssetFile');
        elements.clearUploadQueueBtn = document.getElementById('clearUploadQueueBtn');
        elements.startUploadQueueBtn = document.getElementById('startUploadQueueBtn');
        elements.uploadQueueSummary = document.getElementById('uploadQueueSummary');
        elements.uploadQueueList = document.getElementById('imageAssetQueue');
        elements.assetSelectionToolbar = document.getElementById('assetSelectionToolbar');
        elements.assetSelectionCount = elements.assetSelectionToolbar?.querySelector('.asset-selection-count') || null;
        elements.bulkDeleteAssetsBtn = document.getElementById('bulkDeleteAssetsBtn');
        elements.lineAssignments = document.getElementById('lineBotCollectionsList');
        elements.facebookAssignments = document.getElementById('facebookBotCollectionsList');
        elements.collectionModal = document.getElementById('imageCollectionModal');
        elements.collectionForm = document.getElementById('imageCollectionForm');
        elements.collectionId = document.getElementById('imageCollectionId');
        elements.collectionName = document.getElementById('imageCollectionName');
        elements.collectionDescription = document.getElementById('imageCollectionDescription');
        elements.collectionAssetSearch = document.getElementById('imageCollectionAssetSearch');
        elements.collectionAssetList = document.getElementById('imageCollectionAssetList');
        elements.collectionAssetCount = document.getElementById('collectionAssetCount');
        elements.saveCollectionBtn = document.getElementById('saveImageCollectionBtn');
        elements.deleteCollectionBtn = document.getElementById('deleteImageCollectionBtn');
        elements.botModal = document.getElementById('botImageCollectionsModal');
        elements.botModalLabel = document.getElementById('botImageCollectionsModalLabel');
        elements.botModalSummary = document.getElementById('botImageCollectionsSummary');
        elements.botCollectionsSearch = document.getElementById('botCollectionsSearch');
        elements.botCollectionsList = document.getElementById('botImageCollectionsList');
        elements.saveBotCollectionsBtn = document.getElementById('saveBotImageCollectionsBtn');

        // New UI Elements for Enhanced Gallery
        elements.mobileTabs = document.getElementById('galleryMobileTabs');
        elements.uploadPanel = document.getElementById('uploadPanel');
        elements.collectionsPanel = document.getElementById('collectionsPanel');
        elements.overallProgress = document.getElementById('galleryOverallProgress');
        elements.overallProgressBar = document.getElementById('overallProgressBar');
        elements.overallProgressCount = document.getElementById('overallProgressCount');
        elements.viewToggleGroup = document.getElementById('viewToggleGroup');
        elements.fab = document.getElementById('galleryFab');
        elements.fabMainBtn = document.getElementById('fabMainBtn');
        elements.fabUploadAction = document.getElementById('fabUploadAction');
        elements.fabCreateCollectionAction = document.getElementById('fabCreateCollectionAction');
        elements.fabRefreshAction = document.getElementById('fabRefreshAction');
        elements.collectionFilterControl = document.getElementById('collectionFilterControl');
    };

    const bindEvents = () => {
        if (!elements.section) return;

        if (elements.addCollectionBtn) {
            elements.addCollectionBtn.addEventListener('click', () => openCollectionModal());
        }

        if (elements.refreshCollectionsBtn) {
            elements.refreshCollectionsBtn.addEventListener('click', refreshAll);
        }

        if (elements.uploadDropzone) {
            ['dragenter', 'dragover'].forEach((eventName) => {
                elements.uploadDropzone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    elements.uploadDropzone.classList.add('is-drag-over');
                });
            });

            ['dragleave', 'dragend'].forEach((eventName) => {
                elements.uploadDropzone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    elements.uploadDropzone.classList.remove('is-drag-over');
                });
            });

            elements.uploadDropzone.addEventListener('drop', (event) => {
                event.preventDefault();
                elements.uploadDropzone.classList.remove('is-drag-over');
                if (event.dataTransfer?.files?.length) {
                    addFilesToQueue(event.dataTransfer.files);
                }
            });

            elements.uploadDropzone.addEventListener('click', () => {
                elements.assetFile?.click();
            });
        }

        if (elements.uploadSelectBtn) {
            elements.uploadSelectBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                elements.assetFile?.click();
            });
        }

        if (elements.assetFile) {
            elements.assetFile.addEventListener('change', (event) => {
                const files = event.target.files;
                if (files && files.length > 0) {
                    addFilesToQueue(files);
                    elements.assetFile.value = '';
                }
            });
        }

        if (elements.clearUploadQueueBtn) {
            elements.clearUploadQueueBtn.addEventListener('click', clearUploadQueue);
        }

        if (elements.startUploadQueueBtn) {
            elements.startUploadQueueBtn.addEventListener('click', startUploadQueue);
        }

        if (elements.uploadQueueList) {
            elements.uploadQueueList.addEventListener('input', handleQueueListInput);
            elements.uploadQueueList.addEventListener('change', handleQueueListChange);
            elements.uploadQueueList.addEventListener('click', handleQueueListClick);
        }

        if (elements.bulkDeleteAssetsBtn) {
            elements.bulkDeleteAssetsBtn.addEventListener('click', bulkDeleteSelectedAssets);
        }

        if (elements.assetsSearch) {
            elements.assetsSearch.addEventListener('input', (event) => {
                state.assetFilter = event.target.value.trim().toLowerCase();
                renderAssetsList();
            });
        }

        if (elements.assetsList) {
            elements.assetsList.addEventListener('click', handleAssetsListClick);
            elements.assetsList.addEventListener('change', handleAssetsListChange);
            elements.assetsList.addEventListener('input', handleAssetsListInput);
        }

        if (elements.collectionsSearch) {
            elements.collectionsSearch.addEventListener('input', (event) => {
                state.collectionFilter = event.target.value.trim().toLowerCase();
                renderCollectionsList();
            });
        }

        if (elements.collectionFilterButtons && elements.collectionFilterButtons.length > 0) {
            elements.collectionFilterButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const { usageFilter } = button.dataset;
                    if (!usageFilter || usageFilter === state.collectionUsageFilter) return;
                    state.collectionUsageFilter = usageFilter;
                    elements.collectionFilterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
                    renderCollectionsList();
                });
            });
        }

        if (elements.collectionsList) {
            elements.collectionsList.addEventListener('click', handleCollectionAction);
        }

        if (elements.collectionAssetSearch) {
            elements.collectionAssetSearch.addEventListener('input', (event) => {
                state.collectionAssetFilter = event.target.value.trim().toLowerCase();
                renderCollectionAssetList();
            });
        }

        if (elements.saveCollectionBtn) {
            elements.saveCollectionBtn.addEventListener('click', saveImageCollection);
        }

        if (elements.deleteCollectionBtn) {
            elements.deleteCollectionBtn.addEventListener('click', deleteImageCollection);
        }

        if (elements.lineAssignments) {
            elements.lineAssignments.addEventListener('click', handleAssignmentAction);
        }

        if (elements.facebookAssignments) {
            elements.facebookAssignments.addEventListener('click', handleAssignmentAction);
        }

        if (elements.botCollectionsSearch) {
            elements.botCollectionsSearch.addEventListener('input', (event) => {
                state.botCollectionFilter = event.target.value.trim().toLowerCase();
                renderBotCollectionsChecklist();
            });
        }

        if (elements.saveBotCollectionsBtn) {
            elements.saveBotCollectionsBtn.addEventListener('click', saveBotImageCollections);
        }

        // Secret data consistency fix button (triple click on "ขั้นตอนที่ 1")
        const secretFixBtn = document.getElementById('secretFixBtn');
        if (secretFixBtn) {
            let clickCount = 0;
            let clickTimer = null;

            secretFixBtn.addEventListener('click', () => {
                clickCount++;

                // Add visual feedback
                secretFixBtn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    secretFixBtn.style.transform = '';
                }, 100);

                if (clickCount === 3) {
                    runDataConsistencyCheck();
                    clickCount = 0;
                    if (clickTimer) clearTimeout(clickTimer);
                } else {
                    if (clickTimer) clearTimeout(clickTimer);
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                    }, 1000);
                }
            });
        }

        // Mobile Tabs Navigation
        if (elements.mobileTabs) {
            elements.mobileTabs.addEventListener('click', (event) => {
                const tabBtn = event.target.closest('.tab-btn');
                if (!tabBtn) return;

                const panel = tabBtn.dataset.panel;
                if (!panel) return;

                // Update tab buttons
                elements.mobileTabs.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.toggle('active', btn === tabBtn);
                });

                // Show/hide panels
                if (elements.uploadPanel && elements.collectionsPanel) {
                    if (panel === 'upload') {
                        elements.uploadPanel.classList.remove('hidden');
                        elements.collectionsPanel.classList.add('hidden');
                    } else {
                        elements.uploadPanel.classList.add('hidden');
                        elements.collectionsPanel.classList.remove('hidden');
                    }
                }
            });
        }

        // Floating Action Button
        if (elements.fab && elements.fabMainBtn) {
            elements.fabMainBtn.addEventListener('click', () => {
                elements.fab.classList.toggle('open');
            });

            // Close FAB when clicking outside
            document.addEventListener('click', (event) => {
                if (!elements.fab.contains(event.target)) {
                    elements.fab.classList.remove('open');
                }
            });

            // FAB Actions
            if (elements.fabUploadAction) {
                elements.fabUploadAction.addEventListener('click', () => {
                    elements.fab.classList.remove('open');
                    // Switch to upload tab on mobile
                    if (elements.mobileTabs) {
                        const uploadTab = elements.mobileTabs.querySelector('[data-panel="upload"]');
                        if (uploadTab) uploadTab.click();
                    }
                    // Trigger file select
                    setTimeout(() => {
                        elements.assetFile?.click();
                    }, 100);
                });
            }

            if (elements.fabCreateCollectionAction) {
                elements.fabCreateCollectionAction.addEventListener('click', () => {
                    elements.fab.classList.remove('open');
                    // Switch to collections tab on mobile
                    if (elements.mobileTabs) {
                        const collectionsTab = elements.mobileTabs.querySelector('[data-panel="collections"]');
                        if (collectionsTab) collectionsTab.click();
                    }
                    // Open create collection modal
                    setTimeout(() => {
                        openCollectionModal();
                    }, 100);
                });
            }

            if (elements.fabRefreshAction) {
                elements.fabRefreshAction.addEventListener('click', () => {
                    elements.fab.classList.remove('open');
                    refreshAll();
                });
            }
        }

        // View Toggle (List/Grid)
        if (elements.viewToggleGroup) {
            elements.viewToggleGroup.addEventListener('click', (event) => {
                const btn = event.target.closest('.view-toggle-btn');
                if (!btn) return;

                const view = btn.dataset.view;
                if (!view) return;

                // Update toggle buttons
                elements.viewToggleGroup.querySelectorAll('.view-toggle-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });

                // Toggle grid/list view on assets list
                if (elements.assetsList) {
                    elements.assetsList.classList.toggle('grid-view', view === 'grid');
                }

                // Store preference
                try {
                    localStorage.setItem('gallery-view-mode', view);
                } catch (e) {
                    console.warn('Could not save view preference');
                }
            });

            // Restore saved view preference
            try {
                const savedView = localStorage.getItem('gallery-view-mode');
                if (savedView === 'grid') {
                    const gridBtn = elements.viewToggleGroup.querySelector('[data-view="grid"]');
                    if (gridBtn) gridBtn.click();
                }
            } catch (e) {
                console.warn('Could not restore view preference');
            }
        }

        // Image Lightbox
        setupImageLightbox();
    };

    const runDataConsistencyCheck = async () => {
        const secretFixBtn = document.getElementById('secretFixBtn');
        if (secretFixBtn) {
            secretFixBtn.style.opacity = '0.5';
        }

        try {
            showAlert('กำลังตรวจสอบและซ่อมแซมข้อมูล...', 'info');

            const response = await fetch('/admin/instructions/assets/check-consistency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'ไม่สามารถตรวจสอบข้อมูลได้');
            }

            const { summary, results } = data;

            if (summary.fixed > 0 || summary.deleted > 0) {
                const instructionMsg = [
                    `${results.instruction_assets.ok} OK`,
                    results.instruction_assets.fixed > 0 ? `${results.instruction_assets.fixed} แก้ไข` : null,
                    results.instruction_assets.deleted > 0 ? `${results.instruction_assets.deleted} ลบ` : null
                ].filter(Boolean).join(', ');

                const followupMsg = [
                    `${results.follow_up_assets.ok} OK`,
                    results.follow_up_assets.fixed > 0 ? `${results.follow_up_assets.fixed} แก้ไข` : null,
                    results.follow_up_assets.deleted > 0 ? `${results.follow_up_assets.deleted} ลบ` : null
                ].filter(Boolean).join(', ');

                showAlert(
                    `✅ ${data.message}\n\n` +
                    `📊 Instruction Assets: ${instructionMsg}\n` +
                    `📊 Follow-up Assets: ${followupMsg}`,
                    'success'
                );

                // Refresh assets list
                await fetchImageAssets();
                renderAssetsList();
            } else {
                showAlert('✅ ' + data.message + ' ไม่พบปัญหาใด ๆ', 'success');
            }

            console.log('[Consistency Check]', data);
        } catch (err) {
            console.error('Data consistency check error:', err);
            showAlert('❌ ' + (err.message || 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล'), 'danger');
        } finally {
            if (secretFixBtn) {
                secretFixBtn.style.opacity = '';
            }
        }
    };

    // Image Lightbox Setup
    const setupImageLightbox = () => {
        // Create lightbox if not exists
        let lightbox = document.getElementById('imageLightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = 'imageLightbox';
            lightbox.className = 'image-lightbox';
            lightbox.innerHTML = `
                <button class="lightbox-close" aria-label="ปิด"><i class="fas fa-times"></i></button>
                <img src="" alt="Preview">
                <div class="lightbox-info">
                    <div class="lightbox-title"></div>
                    <div class="lightbox-desc"></div>
                </div>
            `;
            document.body.appendChild(lightbox);

            // Close on background click
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox || e.target.classList.contains('lightbox-close') || e.target.closest('.lightbox-close')) {
                    lightbox.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                    lightbox.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        }

        // Handle image clicks in assets list
        if (elements.assetsList) {
            elements.assetsList.addEventListener('click', (e) => {
                const thumb = e.target.closest('.image-asset-thumb img');
                if (!thumb) return;

                const assetItem = thumb.closest('.image-asset-item');
                if (!assetItem) return;

                const assetLabel = assetItem.dataset.assetLabel || '';
                const assetDesc = assetItem.dataset.assetDesc || '';
                const imgSrc = thumb.src;

                // Open lightbox
                const lightboxImg = lightbox.querySelector('img');
                const lightboxTitle = lightbox.querySelector('.lightbox-title');
                const lightboxDesc = lightbox.querySelector('.lightbox-desc');

                lightboxImg.src = imgSrc;
                lightboxTitle.textContent = assetLabel;
                lightboxDesc.textContent = assetDesc;

                lightbox.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }
    };

    // Overall Progress Bar Helpers
    const showOverallProgress = (current, total) => {
        if (!elements.overallProgress) return;
        elements.overallProgress.classList.add('active');
        updateOverallProgress(current, total);
    };

    const updateOverallProgress = (current, total) => {
        if (!elements.overallProgressBar || !elements.overallProgressCount) return;
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        elements.overallProgressBar.style.width = `${percent}%`;
        elements.overallProgressCount.textContent = `${current}/${total}`;
    };

    const hideOverallProgress = () => {
        if (!elements.overallProgress) return;
        elements.overallProgress.classList.remove('active');
    };

    const init = () => {
        cacheElements();
        if (!elements.section) return;
        bindEvents();
        renderUploadQueue();
        refreshAll();
    };

    const showAlert = (message, type = 'info') => {
        if (window.adminSettings?.showAlert) {
            window.adminSettings.showAlert(message, type);
        } else {
            alert(message);
        }
    };

    const updateAssetsCount = () => {
        if (!elements.assetsCount) return;
        const total = Array.isArray(state.assets) ? state.assets.length : 0;
        elements.assetsCount.textContent = `${total} รูป`;
    };

    const getLabelsUsedInCollections = () => {
        const labels = new Set();
        state.collections.forEach((collection) => {
            if (Array.isArray(collection.images)) {
                collection.images.forEach((img) => {
                    if (img?.label) {
                        labels.add(img.label);
                    }
                });
            }
        });
        return labels;
    };

    const deriveLabelFromFilename = (name = '') => {
        if (!name) return '';
        const dotIndex = name.lastIndexOf('.');
        const withoutExt = dotIndex > 0 ? name.slice(0, dotIndex) : name;
        return withoutExt
            .replace(/[_\-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const createQueueItem = (file) => {
        const id = `queue-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const previewUrl = URL.createObjectURL(file);
        return {
            id,
            file,
            previewUrl,
            label: deriveLabelFromFilename(file.name),
            description: '',
            overwrite: false,
            status: 'pending',
            error: null,
            progress: 0,
        };
    };

    const revokeQueuePreview = (item) => {
        if (item?.previewUrl) {
            try {
                URL.revokeObjectURL(item.previewUrl);
            } catch (err) {
                console.warn('revoke preview error:', err);
            }
        }
    };

    const addFilesToQueue = (fileList) => {
        if (!fileList || fileList.length === 0) return;
        const files = Array.from(fileList).filter((file) => file.type?.startsWith('image/'));
        if (files.length === 0) {
            showAlert('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'warning');
            return;
        }

        files.forEach((file) => {
            state.uploadQueue.push(createQueueItem(file));
        });

        renderUploadQueue();
    };

    const clearUploadQueue = () => {
        if (state.isUploading) return;
        state.uploadQueue.forEach(revokeQueuePreview);
        state.uploadQueue = [];
        renderUploadQueue();
    };

    const getDuplicateLabelIds = () => {
        const labelMap = new Map();
        const duplicates = new Set();
        state.uploadQueue.forEach((item) => {
            const key = item.label?.trim().toLowerCase();
            if (!key) return;
            if (labelMap.has(key)) {
                duplicates.add(labelMap.get(key));
                duplicates.add(item.id);
            } else {
                labelMap.set(key, item.id);
            }
        });
        return duplicates;
    };

    const validateUploadQueue = () => {
        const invalidIds = new Set();
        state.uploadQueue.forEach((item) => {
            if (!item.label || !item.label.trim()) {
                invalidIds.add(item.id);
            }
        });
        const duplicateIds = getDuplicateLabelIds();

        if (elements.uploadQueueList) {
            elements.uploadQueueList.querySelectorAll('.queue-label-input').forEach((input) => {
                const { queueId } = input.dataset;
                const hasInvalid = invalidIds.has(queueId);
                const hasDuplicate = duplicateIds.has(queueId);
                input.classList.toggle('is-invalid', hasInvalid);
                input.classList.toggle('is-duplicate', hasDuplicate && !hasInvalid);
            });
        }

        return { invalidIds, duplicateIds };
    };

    const updateQueueSummary = () => {
        if (!elements.uploadQueueSummary) return;
        const total = state.uploadQueue.length;
        if (total === 0) {
            elements.uploadQueueSummary.textContent = 'ยังไม่มีไฟล์ในคิว';
            return;
        }
        const pending = state.uploadQueue.filter((item) => item.status === 'pending').length;
        const errors = state.uploadQueue.filter((item) => item.status === 'error').length;
        const { duplicateIds } = validateUploadQueue();
        const parts = [];
        parts.push(`${total} ไฟล์ในคิว`);
        if (pending > 0) {
            parts.push(`รออัปโหลด ${pending}`);
        }
        if (errors > 0) {
            parts.push(`อัปโหลดไม่สำเร็จ ${errors}`);
        }
        if (duplicateIds.size > 0) {
            parts.push(`พบชื่อซ้ำ ${duplicateIds.size}`);
        }
        elements.uploadQueueSummary.textContent = parts.join(' • ');
    };

    const updateQueueButtons = () => {
        const hasItems = state.uploadQueue.length > 0;
        const pendingOrError = state.uploadQueue.some((item) => item.status === 'pending' || item.status === 'error');
        if (elements.clearUploadQueueBtn) {
            elements.clearUploadQueueBtn.disabled = state.isUploading || !hasItems;
        }
        if (elements.startUploadQueueBtn) {
            const { invalidIds, duplicateIds } = validateUploadQueue();
            const canUpload = hasItems && pendingOrError && invalidIds.size === 0 && duplicateIds.size === 0 && !state.isUploading;
            elements.startUploadQueueBtn.disabled = !canUpload;
            elements.startUploadQueueBtn.innerHTML = state.isUploading
                ? '<span class="spinner-border spinner-border-sm me-1"></span>กำลังอัปโหลด...'
                : '<i class="fas fa-upload me-1"></i>อัปโหลดทั้งหมด';
        }
    };

    const renderUploadQueue = () => {
        if (!elements.uploadQueueList) return;
        if (state.uploadQueue.length === 0) {
            elements.uploadQueueList.innerHTML = `
                <div class="empty-state small text-muted text-center py-3">
                    <i class="fas fa-images me-1"></i>เพิ่มรูปภาพเพื่อเตรียมตั้งชื่อและคำอธิบายได้ที่นี่
                </div>
            `;
            return;
        }

        const html = state.uploadQueue
            .map((item) => {
                const escapedLabel = escapeHtml(item.label || '');
                const escapedDescription = escapeHtml(item.description || '');
                const statusClass = `status-${item.status}`;
                const statusText = (() => {
                    if (item.status === 'uploading') return 'กำลังอัปโหลด...';
                    if (item.status === 'success') return 'อัปโหลดสำเร็จ';
                    if (item.status === 'error') return `ผิดพลาด: ${escapeHtml(item.error || 'ไม่ทราบสาเหตุ')}`;
                    return 'พร้อมอัปโหลด';
                })();
                const progressBar = item.status === 'uploading'
                    ? `<div class="queue-progress"><div style="width:${Math.max(10, item.progress || 0)}%"></div></div>`
                    : '';
                const sizeText = formatFileSize(item.file.size);
                const disableInputs = state.isUploading && item.status === 'uploading';

                return `
                    <div class="upload-queue-item ${statusClass}" data-queue-id="${item.id}">
                        <div class="queue-thumb">
                            <img src="${item.previewUrl}" alt="${escapedLabel || 'preview'}">
                        </div>
                        <div class="queue-main">
                            <div class="queue-header">
                                <input type="text" class="form-control form-control-sm queue-label-input" placeholder="ชื่อรูปภาพ" value="${escapedLabel}" data-queue-id="${item.id}" ${disableInputs ? 'disabled' : ''}>
                                <div class="queue-actions">
                                    <div class="form-check form-switch form-switch-sm">
                                        <input class="form-check-input queue-overwrite-checkbox" type="checkbox" data-queue-id="${item.id}" ${item.overwrite ? 'checked' : ''} ${disableInputs ? 'disabled' : ''}>
                                        <label class="form-check-label small">แทนที่</label>
                                    </div>
                                    <button type="button" class="btn btn-sm btn-outline-danger queue-remove-btn" data-queue-id="${item.id}" ${state.isUploading ? 'disabled' : ''}>
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <textarea class="form-control form-control-sm queue-description-input" rows="2" placeholder="คำอธิบาย (ไม่บังคับ)" data-queue-id="${item.id}" ${disableInputs ? 'disabled' : ''}>${escapedDescription}</textarea>
                            <div class="queue-meta small text-muted">
                                <span><i class="fas fa-file me-1"></i>${escapeHtml(item.file.name)}</span>
                                <span class="dot">•</span>
                                <span>${sizeText}</span>
                                ${item.status === 'error' ? '<span class="dot">•</span><span class="text-danger">โปรดแก้ไขแล้วลองใหม่</span>' : ''}
                            </div>
                            <div class="queue-status small ${item.status === 'error' ? 'text-danger' : item.status === 'success' ? 'text-success' : 'text-muted'}">${statusText}</div>
                            ${progressBar}
                        </div>
                    </div>
                `;
            })
            .join('');

        elements.uploadQueueList.innerHTML = html;
        validateUploadQueue();
        updateQueueSummary();
        updateQueueButtons();
    };

    const handleQueueListInput = (event) => {
        const { queueId } = event.target.dataset || {};
        if (!queueId) return;
        const item = state.uploadQueue.find((entry) => entry.id === queueId);
        if (!item) return;
        if (event.target.classList.contains('queue-label-input')) {
            item.label = event.target.value;
            updateQueueSummary();
            updateQueueButtons();
        } else if (event.target.classList.contains('queue-description-input')) {
            item.description = event.target.value;
        }
    };

    const handleQueueListChange = (event) => {
        const { queueId } = event.target.dataset || {};
        if (!queueId) return;
        const item = state.uploadQueue.find((entry) => entry.id === queueId);
        if (!item) return;
        if (event.target.classList.contains('queue-overwrite-checkbox')) {
            item.overwrite = !!event.target.checked;
        }
    };

    const handleQueueListClick = (event) => {
        const button = event.target.closest('.queue-remove-btn');
        if (!button) return;
        const queueId = button.dataset.queueId;
        if (!queueId) return;
        if (button.classList.contains('queue-remove-btn')) {
            if (state.isUploading) return;
            const index = state.uploadQueue.findIndex((entry) => entry.id === queueId);
            if (index >= 0) {
                revokeQueuePreview(state.uploadQueue[index]);
                state.uploadQueue.splice(index, 1);
                renderUploadQueue();
                updateQueueSummary();
                updateQueueButtons();
            }
        }
    };

    const startUploadQueue = async () => {
        if (state.isUploading) return;
        const uploadTargets = state.uploadQueue.filter((item) => item.status === 'pending' || item.status === 'error');
        if (uploadTargets.length === 0) return;

        const { invalidIds, duplicateIds } = validateUploadQueue();
        if (invalidIds.size > 0) {
            showAlert('กรุณาระบุชื่อรูปภาพให้ครบถ้วนก่อนอัปโหลด', 'warning');
            return;
        }
        if (duplicateIds.size > 0) {
            showAlert('พบชื่อรูปภาพซ้ำกัน กรุณาปรับให้ไม่ซ้ำก่อนอัปโหลด', 'warning');
            return;
        }

        state.isUploading = true;
        updateQueueButtons();

        let hasSuccess = false;
        try {
            for (const item of uploadTargets) {
                item.status = 'uploading';
                item.error = null;
                item.progress = 0;
                renderUploadQueue();

                await uploadQueueItem(item);
                if (item.status === 'success') {
                    hasSuccess = true;
                }
            }
        } finally {
            state.isUploading = false;
            renderUploadQueue();
        }

        if (hasSuccess) {
            await fetchAssets();
            await fetchCollections();
            const remaining = [];
            let successCount = 0;
            state.uploadQueue.forEach((item) => {
                if (item.status === 'success') {
                    revokeQueuePreview(item);
                    successCount += 1;
                } else {
                    remaining.push(item);
                }
            });
            state.uploadQueue = remaining;
            renderUploadQueue();
            if (successCount > 0) {
                showAlert(`อัปโหลดรูปภาพสำเร็จ ${successCount} ไฟล์`, 'success');
            }
        }
    };

    const uploadQueueItem = async (item) => {
        const form = new FormData();
        form.append('image', item.file, item.file.name);
        form.append('label', item.label?.trim() || '');
        form.append('description', item.description?.trim() || '');
        form.append('overwrite', item.overwrite ? 'true' : 'false');

        try {
            const response = await fetch('/admin/instructions/assets', {
                method: 'POST',
                body: form,
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'อัปโหลดรูปภาพไม่สำเร็จ');
            }
            item.status = 'success';
            item.error = null;
            item.progress = 100;
        } catch (err) {
            item.status = 'error';
            item.error = err.message || 'อัปโหลดไม่สำเร็จ';
            item.progress = 0;
        }
    };

    const renderAssetsList = () => {
        if (!elements.assetsList) return;

        const assets = Array.isArray(state.assets) ? state.assets : [];
        const filter = state.assetFilter;
        const usedLabels = getLabelsUsedInCollections();

        if (assets.length === 0) {
            elements.assetsList.innerHTML = '<div class="empty-state"><i class="fas fa-image mb-2"></i><div>ยังไม่มีรูปภาพ</div><small class="text-muted">อัปโหลดรูปเพื่อใช้ร่วมกับ AI ได้ทันที</small></div>';
            renderAssetSelectionToolbar();
            return;
        }

        const filtered = filter
            ? assets.filter((asset) => {
                const label = (asset.label || '').toLowerCase();
                const description = (asset.description || asset.alt || '').toLowerCase();
                return label.includes(filter) || description.includes(filter);
            })
            : assets;

        if (filtered.length === 0) {
            elements.assetsList.innerHTML = '<div class="empty-state"><i class="fas fa-search mb-2"></i><div>ไม่พบรูปภาพที่ตรงกับคำค้น</div></div>';
            renderAssetSelectionToolbar();
            return;
        }

        const html = filtered
            .map((asset) => {
                const label = asset.label || asset.fileName || 'unnamed';
                const escapedLabel = escapeHtml(label);
                const labelAttr = escapeAttribute(label);
                const description = escapeHtml(asset.description || asset.alt || '');
                const token = `#[IMAGE:${label}]`;
                const sizeText = formatFileSize(asset.size);
                const thumb = asset.thumbUrl || asset.url || '';
                const usedBadge = usedLabels.has(label)
                    ? '<span class="badge bg-success-soft text-success ms-2"><i class="fas fa-check me-1"></i>ใช้งานในคอลเลกชัน</span>'
                    : '';
                const updated = formatTimestamp(asset.updatedAt || asset.createdAt);
                const isSelected = state.selectedAssetLabels.has(label);
                const editState = state.assetEdits.get(label);
                const editingClass = editState ? ' editing' : '';
                const selectedClass = isSelected ? ' selected' : '';
                const itemClasses = `${editingClass}${selectedClass}`;

                if (editState) {
                    const saving = editState.saving;
                    const isBlank = !editState.label || !editState.label.trim();
                    const isDuplicateLabel = isLabelDuplicate(editState.label, editState.originalLabel);
                    const labelClasses = `${!saving && isBlank ? ' is-invalid' : ''}${!saving && isDuplicateLabel ? ' is-duplicate' : ''}`;
                    const labelValue = escapeHtml(editState.label || '');
                    const descriptionValue = escapeHtml(editState.description || '');
                    const saveBtnLabel = saving
                        ? '<span class="spinner-border spinner-border-sm me-1"></span>กำลังบันทึก'
                        : '<i class="fas fa-save me-1"></i>บันทึก';
                    const errorHtml = editState.error
                        ? `<div class="text-danger small">${escapeHtml(editState.error)}</div>`
                        : '';
                    const duplicateHtml = !saving && isDuplicateLabel && !editState.error
                        ? '<div class="text-warning small">มีชื่อรูปภาพนี้อยู่แล้ว กรุณาใช้ชื่ออื่น</div>'
                        : '';
                    const blankHtml = !saving && isBlank && !editState.error
                        ? '<div class="text-danger small">กรุณาระบุชื่อรูปภาพ</div>'
                        : '';

                    return `
                        <div class="image-asset-item${itemClasses}" data-label="${labelAttr}">
                            <div class="asset-select form-check">
                                <input class="form-check-input asset-select-checkbox" type="checkbox" data-label="${labelAttr}" ${isSelected ? 'checked' : ''} ${saving ? 'disabled' : ''}>
                            </div>
                            <div class="image-asset-thumb">
                                ${thumb ? `<img src="${thumb}" alt="${escapedLabel}">` : '<div class="image-asset-thumb-placeholder"><i class="fas fa-image"></i></div>'}
                            </div>
                            <div class="image-asset-info">
                                <div class="image-asset-edit-form">
                                    <input type="text" class="form-control form-control-sm asset-edit-label-input${labelClasses}" placeholder="ชื่อรูปภาพ" value="${labelValue}" data-original-label="${escapeAttribute(editState.originalLabel)}" ${saving ? 'disabled' : ''}>
                                    <textarea class="form-control form-control-sm asset-edit-description-input" rows="2" placeholder="คำอธิบาย (ไม่บังคับ)" data-original-label="${escapeAttribute(editState.originalLabel)}" ${saving ? 'disabled' : ''}>${descriptionValue}</textarea>
                                    ${blankHtml}
                                    ${duplicateHtml}
                                    ${errorHtml}
                                </div>
                                <div class="queue-meta small text-muted">
                                    <span><i class="fas fa-file me-1"></i>${escapeHtml(asset.fileName || asset.label || '')}</span>
                                    <span class="dot">•</span>
                                    <span>${sizeText}</span>
                                </div>
                            </div>
                            <div class="image-asset-edit-actions">
                                <button type="button" class="btn btn-sm btn-primary asset-save-btn" data-original-label="${escapeAttribute(editState.originalLabel)}" ${saving ? 'disabled' : ''}>${saveBtnLabel}</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary asset-cancel-btn" data-original-label="${escapeAttribute(editState.originalLabel)}" ${saving ? 'disabled' : ''}>
                                    <i class="fas fa-times me-1"></i>ยกเลิก
                                </button>
                            </div>
                        </div>
                    `;
                }

                const normalDescription = description || '<span class="text-muted">ไม่มีคำอธิบาย</span>';
                const actionsHtml = `
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy" data-label="${labelAttr}">
                        <i class="fas fa-copy me-1"></i>โทเคน
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-label="${labelAttr}">
                        <i class="fas fa-edit me-1"></i>แก้ไข
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger asset-delete-btn" data-action="delete" data-label="${labelAttr}">
                        <i class="fas fa-trash me-1"></i>ลบ
                    </button>
                `;

                return `
                    <div class="image-asset-item${itemClasses}" data-label="${labelAttr}">
                        <div class="asset-select form-check">
                            <input class="form-check-input asset-select-checkbox" type="checkbox" data-label="${labelAttr}" ${isSelected ? 'checked' : ''}>
                        </div>
                        <div class="image-asset-thumb">
                            ${thumb ? `<img src="${thumb}" alt="${escapedLabel}">` : '<div class="image-asset-thumb-placeholder"><i class="fas fa-image"></i></div>'}
                        </div>
                        <div class="image-asset-info">
                            <div class="image-asset-title">
                                <strong>${escapedLabel}</strong>
                                ${usedBadge}
                            </div>
                            <div class="image-asset-description">${normalDescription}</div>
                            <div class="image-asset-meta">
                                <span class="token">token: <code>${escapeHtml(token)}</code></span>
                                <span class="dot">•</span>
                                <span>${sizeText}</span>
                                <span class="dot">•</span>
                                <span>อัปเดต ${escapeHtml(updated)}</span>
                            </div>
                        </div>
                        <div class="image-asset-actions">
                            ${actionsHtml}
                        </div>
                    </div>
                `;
            })
            .join('');

        elements.assetsList.innerHTML = html;
        renderAssetSelectionToolbar();
    };

    const renderAssetSelectionToolbar = () => {
        if (!elements.assetSelectionToolbar) return;
        const count = state.selectedAssetLabels.size;
        if (count === 0) {
            elements.assetSelectionToolbar.style.display = 'none';
            if (elements.assetSelectionCount) elements.assetSelectionCount.textContent = '';
            if (elements.bulkDeleteAssetsBtn) elements.bulkDeleteAssetsBtn.disabled = true;
            return;
        }

        elements.assetSelectionToolbar.style.display = 'flex';
        if (elements.assetSelectionCount) {
            elements.assetSelectionCount.textContent = `เลือก ${count} รูป`;
        }
        if (elements.bulkDeleteAssetsBtn) {
            elements.bulkDeleteAssetsBtn.disabled = state.isUploading;
        }
    };

    const toggleAssetSelection = (label, selected) => {
        if (!label) return;
        if (selected) {
            state.selectedAssetLabels.add(label);
        } else {
            state.selectedAssetLabels.delete(label);
        }
        renderAssetsList();
    };

    const pruneSelectionsAndEdits = () => {
        const labelsSet = new Set(state.assets.map((asset) => asset.label));
        state.selectedAssetLabels.forEach((label) => {
            if (!labelsSet.has(label)) {
                state.selectedAssetLabels.delete(label);
            }
        });
        state.assetEdits.forEach((_, key) => {
            if (!labelsSet.has(key)) {
                state.assetEdits.delete(key);
            }
        });
        renderAssetSelectionToolbar();
    };

    const copyAssetToken = async (label) => {
        const token = `#[IMAGE:${label}]`;
        try {
            await navigator.clipboard?.writeText(token);
            showAlert('คัดลอกโทเคนเรียบร้อยแล้ว', 'success');
        } catch (err) {
            console.warn('clipboard copy failed:', err);
            window.prompt('คัดลอกโทเคนด้วยตนเอง:', token);
        }
    };

    const performSingleAssetDelete = async (label) => {
        if (!label) return;
        if (!confirm(`ยืนยันการลบรูปภาพ: ${label}?`)) return;
        try {
            const response = await fetch(`/admin/instructions/assets/${encodeURIComponent(label)}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถลบรูปภาพได้');
            }
            state.selectedAssetLabels.delete(label);
            state.assetEdits.delete(label);
            renderAssetSelectionToolbar();
            showAlert('ลบรูปภาพสำเร็จ', 'success');
            await fetchAssets();
            await fetchCollections();
        } catch (err) {
            console.error('delete asset error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการลบรูปภาพ', 'danger');
        }
    };

    const bulkDeleteSelectedAssets = async () => {
        const labels = Array.from(state.selectedAssetLabels);
        if (labels.length === 0) {
            showAlert('กรุณาเลือกรูปอย่างน้อย 1 รูปก่อนลบ', 'warning');
            return;
        }
        if (!confirm(`ยืนยันการลบรูปภาพ ${labels.length} รูป?`)) return;
        try {
            if (elements.bulkDeleteAssetsBtn) {
                elements.bulkDeleteAssetsBtn.disabled = true;
                elements.bulkDeleteAssetsBtn.classList.add('disabled');
            }
            const response = await fetch('/admin/instructions/assets/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labels })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถลบรูปภาพที่เลือกได้');
            }
            const deletedCount = data.deleted?.length || 0;
            showAlert(`ลบรูปภาพสำเร็จ ${deletedCount} รูป`, 'success');
            if (data.failed && data.failed.length > 0) {
                const failedList = data.failed
                    .map((item) => item.label)
                    .filter(Boolean)
                    .slice(0, 5)
                    .join(', ');
                showAlert(`ไม่สามารถลบบางรูปได้: ${failedList || 'ไม่ทราบชื่อ'}`, 'warning');
            }
            state.selectedAssetLabels.clear();
            renderAssetSelectionToolbar();
            await fetchAssets();
            await fetchCollections();
        } catch (err) {
            console.error('bulk delete assets error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการลบรูปภาพที่เลือก', 'danger');
        } finally {
            if (elements.bulkDeleteAssetsBtn) {
                elements.bulkDeleteAssetsBtn.disabled = false;
                elements.bulkDeleteAssetsBtn.classList.remove('disabled');
            }
        }
    };

    const findAssetByLabel = (label) => state.assets.find((asset) => asset.label === label);

    const enterAssetEdit = (label) => {
        if (!label) return;
        if (state.assetEdits.has(label)) return;
        const asset = findAssetByLabel(label);
        if (!asset) {
            showAlert('ไม่พบรูปภาพที่ต้องการแก้ไข', 'warning');
            return;
        }
        state.assetEdits.set(label, {
            originalLabel: label,
            label,
            description: asset.description || asset.alt || '',
            saving: false,
            error: null,
        });
        renderAssetsList();
    };

    const cancelAssetEdit = (originalLabel) => {
        if (!originalLabel) return;
        state.assetEdits.delete(originalLabel);
        renderAssetsList();
    };

    const isLabelDuplicate = (candidate, originalLabel = '') => {
        if (!candidate) return false;
        const trimmed = candidate.trim().toLowerCase();
        if (!trimmed) return false;
        const original = originalLabel.trim().toLowerCase();
        if (trimmed === original) return false;
        return state.assets.some((asset) => (asset.label || '').trim().toLowerCase() === trimmed);
    };

    const saveAssetEdit = async (originalLabel) => {
        if (!originalLabel) return;
        const editState = state.assetEdits.get(originalLabel);
        if (!editState) return;

        const newLabel = (editState.label || '').trim();
        const description = (editState.description || '').trim();

        if (!newLabel) {
            editState.error = 'กรุณาระบุชื่อรูปภาพ';
            renderAssetsList();
            return;
        }

        if (isLabelDuplicate(newLabel, originalLabel)) {
            editState.error = 'มีชื่อรูปภาพนี้อยู่แล้ว กรุณาใช้ชื่ออื่น';
            renderAssetsList();
            return;
        }

        editState.saving = true;
        editState.error = null;
        renderAssetsList();

        try {
            const response = await fetch(`/admin/instructions/assets/${encodeURIComponent(originalLabel)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newLabel, description }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถแก้ไขข้อมูลรูปภาพได้');
            }

            state.assetEdits.delete(originalLabel);
            if (state.selectedAssetLabels.has(originalLabel)) {
                state.selectedAssetLabels.delete(originalLabel);
                state.selectedAssetLabels.add(newLabel);
            }

            showAlert('บันทึกข้อมูลรูปภาพเรียบร้อยแล้ว', 'success');
            await fetchAssets();
            await fetchCollections();
        } catch (err) {
            console.error('update asset error:', err);
            editState.saving = false;
            editState.error = err.message || 'เกิดข้อผิดพลาดในการบันทึก';
            renderAssetsList();
        }
    };

    const handleAssetsListInput = (event) => {
        const input = event.target;
        if (input.classList.contains('asset-edit-label-input')) {
            const { originalLabel } = input.dataset || {};
            if (!originalLabel) return;
            const editState = state.assetEdits.get(originalLabel);
            if (!editState) return;
            editState.label = input.value;
            input.classList.toggle('is-invalid', !input.value.trim() && !editState.saving);
            input.classList.toggle('is-duplicate', isLabelDuplicate(input.value, originalLabel));
        } else if (input.classList.contains('asset-edit-description-input')) {
            const { originalLabel } = input.dataset || {};
            if (!originalLabel) return;
            const editState = state.assetEdits.get(originalLabel);
            if (!editState) return;
            editState.description = input.value;
        }
    };

    const handleAssetsListChange = (event) => {
        const checkbox = event.target.closest('.asset-select-checkbox');
        if (!checkbox) return;
        const label = checkbox.dataset.label;
        toggleAssetSelection(label, checkbox.checked);
    };

    const handleAssetsListClick = (event) => {
        const saveBtn = event.target.closest('.asset-save-btn');
        if (saveBtn) {
            const { originalLabel } = saveBtn.dataset || {};
            if (originalLabel) saveAssetEdit(originalLabel);
            return;
        }
        const cancelBtn = event.target.closest('.asset-cancel-btn');
        if (cancelBtn) {
            const { originalLabel } = cancelBtn.dataset || {};
            if (originalLabel) cancelAssetEdit(originalLabel);
            return;
        }

        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        const { action, label } = actionBtn.dataset;
        if (!label) return;

        if (action === 'copy') {
            copyAssetToken(label);
        } else if (action === 'delete') {
            performSingleAssetDelete(label);
        } else if (action === 'edit') {
            enterAssetEdit(label);
        }
    };

    const refreshAll = async () => {
        try {
            await Promise.all([
                fetchCollections(),
                fetchAssets(),
                fetchBots()
            ]);
            renderAssignments();
        } catch (err) {
            console.error('refreshAll error:', err);
            showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูลคลังรูปภาพ', 'danger');
        }
    };

    const fetchCollections = async () => {
        try {
            if (elements.collectionsList) {
                elements.collectionsList.innerHTML = '<div class="text-muted small">กำลังโหลดรายการคลังรูปภาพ...</div>';
            }
            const response = await fetch('/api/image-collections');
            if (!response.ok) throw new Error('ไม่สามารถดึงรายการคลังรูปภาพได้');
            const data = await response.json();
            state.collections = Array.isArray(data.collections) ? data.collections : [];
            updateCollectionsCount();
            renderCollectionsList();
            renderAssetsList();
        } catch (err) {
            console.error('fetchCollections error:', err);
            showAlert('โหลดข้อมูลคลังรูปภาพไม่สำเร็จ', 'danger');
            state.collections = [];
            updateCollectionsCount();
            renderCollectionsList();
            renderAssetsList();
        }
    };

    const fetchAssets = async () => {
        try {
            const response = await fetch('/admin/instructions/assets');
            if (!response.ok) throw new Error('ไม่สามารถดึงรายการรูปภาพได้');
            const data = await response.json();
            state.assets = Array.isArray(data.assets) ? data.assets : [];
            updateAssetsCount();
            pruneSelectionsAndEdits();
            renderAssetsList();
        } catch (err) {
            console.error('fetchAssets error:', err);
            showAlert('โหลดรายการรูปภาพไม่สำเร็จ', 'danger');
            state.assets = [];
            updateAssetsCount();
            pruneSelectionsAndEdits();
            renderAssetsList();
        }
    };

    const fetchBots = async () => {
        try {
            const [lineRes, fbRes] = await Promise.all([
                fetch('/api/line-bots'),
                fetch('/api/facebook-bots')
            ]);
            if (!lineRes.ok) throw new Error('ไม่สามารถดึงข้อมูล Line Bot ได้');
            if (!fbRes.ok) throw new Error('ไม่สามารถดึงข้อมูล Facebook Bot ได้');
            state.lineBots = await lineRes.json();
            state.facebookBots = await fbRes.json();
        } catch (err) {
            console.error('fetchBots error:', err);
            showAlert('โหลดข้อมูลบอทไม่สำเร็จ', 'danger');
        }
    };

    const updateCollectionsCount = () => {
        if (!elements.collectionsCount) return;
        const total = state.collections.length;
        elements.collectionsCount.textContent = `${total} ชุด`;
    };

    const handleCollectionAction = (event) => {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        const action = actionBtn.dataset.action;
        const collectionId = actionBtn.dataset.collectionId;
        if (!collectionId) return;

        if (action === 'edit') {
            openCollectionModal(collectionId);
        } else if (action === 'delete') {
            openCollectionModal(collectionId, { openDelete: true });
        } else if (action === 'view') {
            openCollectionModal(collectionId);
        }
    };

    const handleAssignmentAction = (event) => {
        const actionBtn = event.target.closest('[data-action="edit-bot"]');
        if (!actionBtn) return;
        const botType = actionBtn.dataset.botType;
        const botId = actionBtn.dataset.botId;
        if (!botType || !botId) return;
        openBotImageCollectionsModal(botType, botId);
    };

    const renderCollectionsList = () => {
        if (!elements.collectionsList) return;
        if (!Array.isArray(state.collections) || state.collections.length === 0) {
            elements.collectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images mb-2"></i>
                    <div>ยังไม่มีคลังรูปภาพ</div>
                    <small class="text-muted">สร้างคลังเพื่อนำรูปไปใช้ตอบลูกค้าได้อย่างแม่นยำ</small>
                </div>
            `;
            return;
        }

        const filter = state.collectionFilter;
        const filtered = filter
            ? state.collections.filter((collection) => {
                const name = (collection.name || '').toLowerCase();
                const description = (collection.description || '').toLowerCase();
                return name.includes(filter) || description.includes(filter);
            })
            : state.collections;

        const usageFiltered = filtered.filter((collection) => {
            const usage = computeCollectionUsage(collection._id);
            const totalUsage = usage.line + usage.facebook;
            if (state.collectionUsageFilter === 'assigned') {
                return totalUsage > 0;
            }
            if (state.collectionUsageFilter === 'unassigned') {
                return totalUsage === 0;
            }
            return true;
        });

        if (usageFiltered.length === 0) {
            elements.collectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search mb-2"></i>
                    <div>ไม่พบคลังรูปภาพที่ตรงกับคำค้น</div>
                </div>
            `;
            return;
        }

        const html = usageFiltered
            .map((collection) => {
                const imagesCount = Array.isArray(collection.images) ? collection.images.length : 0;
                const usage = computeCollectionUsage(collection._id);
                const isDefault = !!collection.isDefault;
                const safeName = escapeHtml(collection.name || collection._id);
                const description = collection.description ? escapeHtml(collection.description) : 'ไม่มีคำอธิบาย';
                const updatedText = formatTimestamp(collection.updatedAt || collection.createdAt);
                const badge = isDefault ? '<span class="badge bg-success-soft text-success ms-2">ค่าเริ่มต้น</span>' : '';
                const usageBadges = `
                    <span class="collection-stat badge bg-light text-dark"><i class="fab fa-line me-1 text-success"></i>${usage.line}</span>
                    <span class="collection-stat badge bg-light text-dark"><i class="fab fa-facebook-f me-1 text-primary"></i>${usage.facebook}</span>
                `;
                const previewImages = Array.isArray(collection.images) ? collection.images.slice(0, 3) : [];
                const previewHtml = previewImages
                    .map((img) => {
                        const src = img.thumbUrl || img.url || '';
                        const alt = escapeHtml(img.label || 'preview');
                        if (!src) return '';
                        return `<div class="collection-preview-thumb" title="${alt}"><img src="${src}" alt="${alt}"></div>`;
                    })
                    .join('');
                const remaining = imagesCount - previewImages.length;
                const morePreview = remaining > 0 ? `<div class="collection-preview-thumb more">+${remaining}</div>` : '';

                return `
                    <div class="image-collection-card" data-collection-id="${collection._id}">
                        <div class="collection-header">
                            <div>
                                <div class="collection-title">
                                    <strong>${safeName}</strong>
                                    ${badge}
                                </div>
                                <div class="text-muted small">${description}</div>
                            </div>
                            <div class="collection-actions">
                                <button class="btn btn-sm btn-outline-primary" data-action="edit" data-collection-id="${collection._id}">
                                    <i class="fas fa-edit me-1"></i>แก้ไข
                                </button>
                                <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection-id="${collection._id}" ${isDefault ? 'disabled' : ''}>
                                    <i class="fas fa-trash me-1"></i>ลบ
                                </button>
                            </div>
                        </div>
                        <div class="collection-preview">
                            ${previewHtml || '<div class="text-muted small">ยังไม่มีรูปในคลังนี้</div>'}
                            ${morePreview}
                        </div>
                        <div class="collection-meta">
                            <span class="badge bg-secondary-soft text-secondary"><i class="fas fa-image me-1"></i>${imagesCount} รูป</span>
                            ${usageBadges}
                            <span class="text-muted small ms-auto">อัปเดต: ${updatedText}</span>
                        </div>
                    </div>
                `;
            })
            .join('');

        elements.collectionsList.innerHTML = html;
    };

    const openCollectionModal = (collectionId = null, options = {}) => {
        if (!elements.collectionModal || !elements.collectionForm) return;
        state.editingCollectionId = collectionId;
        state.collectionAssetFilter = '';
        if (elements.collectionAssetSearch) {
            elements.collectionAssetSearch.value = '';
        }

        const modalLabel = document.getElementById('imageCollectionModalLabel');
        if (collectionId) {
            const collection = getCollectionById(collectionId);
            if (!collection) {
                showAlert('ไม่พบข้อมูลคลังรูปภาพ', 'warning');
                return;
            }
            if (modalLabel) {
                modalLabel.innerHTML = `<i class="fas fa-images me-2"></i>แก้ไขคลังรูปภาพ: ${escapeHtml(collection.name || '')}`;
            }
            elements.collectionId.value = collection._id;
            elements.collectionName.value = collection.name || '';
            elements.collectionDescription.value = collection.description || '';
            elements.deleteCollectionBtn.style.display = collection.isDefault ? 'none' : 'inline-flex';
        } else {
            state.editingCollectionId = null;
            elements.collectionId.value = '';
            elements.collectionForm.reset();
            if (modalLabel) {
                modalLabel.innerHTML = '<i class="fas fa-images me-2"></i>สร้างคลังรูปภาพใหม่';
            }
            elements.deleteCollectionBtn.style.display = 'none';
        }

        renderCollectionAssetList();

        const modalInstance = bootstrap.Modal.getOrCreateInstance(elements.collectionModal);
        modalInstance.show();

        if (options.openDelete && state.editingCollectionId && !getCollectionById(state.editingCollectionId)?.isDefault) {
            deleteImageCollection();
        }
    };

    const renderCollectionAssetList = () => {
        if (!elements.collectionAssetList) return;
        const selectedLabels = new Set();
        if (state.editingCollectionId) {
            const collection = getCollectionById(state.editingCollectionId);
            if (collection && Array.isArray(collection.images)) {
                collection.images.forEach((img) => {
                    if (img?.label) selectedLabels.add(img.label);
                });
            }
        }

        const filter = state.collectionAssetFilter;
        const filteredAssets = filter
            ? state.assets.filter((asset) => {
                const label = (asset.label || '').toLowerCase();
                const desc = (asset.description || asset.alt || '').toLowerCase();
                return label.includes(filter) || desc.includes(filter);
            })
            : state.assets;

        if (!filteredAssets || filteredAssets.length === 0) {
            elements.collectionAssetList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-image mb-2"></i>
                    <div>ยังไม่มีรูปภาพในระบบ</div>
                    <small class="text-muted">อัปโหลดได้จากส่วนคำสั่ง & โทเคนรูปภาพ</small>
                </div>
            `;
            if (elements.collectionAssetCount) {
                elements.collectionAssetCount.textContent = '0 รูป';
            }
            return;
        }

        const html = filteredAssets
            .map((asset, index) => {
                const id = `collection-asset-${index}`;
                const label = asset.label || '';
                const checked = selectedLabels.has(label) ? 'checked' : '';
                const thumb = asset.thumbUrl || asset.url || '';
                const description = asset.description || asset.alt || '';
                const safeLabel = escapeHtml(label);
                const safeDescription = description ? escapeHtml(description) : 'ไม่มีคำอธิบาย';
                return `
                    <label class="collection-asset-item" for="${id}">
                        <input type="checkbox" class="form-check-input" id="${id}" value="${escapeAttribute(label)}" ${checked}>
                        <span class="collection-asset-thumb">
                            <img src="${thumb}" alt="${safeLabel}">
                        </span>
                        <span class="collection-asset-info">
                            <strong>${safeLabel}</strong>
                            <small class="text-muted">${safeDescription}</small>
                        </span>
                    </label>
                `;
            })
            .join('');

        elements.collectionAssetList.innerHTML = html;
        if (elements.collectionAssetCount) {
            elements.collectionAssetCount.textContent = `${filteredAssets.length} รูป`;
        }
    };

    const saveImageCollection = async () => {
        if (!elements.collectionForm) return;
        if (!elements.collectionName?.value.trim()) {
            showAlert('กรุณาระบุชื่อคลังรูปภาพ', 'warning');
            elements.collectionName?.focus();
            return;
        }
        const labels = Array.from(
            elements.collectionAssetList?.querySelectorAll('input[type="checkbox"]:checked') || []
        ).map((input) => input.value);

        const payload = {
            name: elements.collectionName.value.trim(),
            description: elements.collectionDescription.value.trim(),
            imageLabels: labels
        };

        const collectionId = state.editingCollectionId;
        const method = collectionId ? 'PUT' : 'POST';
        const url = collectionId ? `/admin/image-collections/${collectionId}` : '/admin/image-collections';

        try {
            elements.saveCollectionBtn.disabled = true;
            elements.saveCollectionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถบันทึกคลังรูปภาพได้');
            }

            showAlert(data.message || 'บันทึกคลังรูปภาพเรียบร้อยแล้ว', 'success');

            const modalInstance = bootstrap.Modal.getInstance(elements.collectionModal);
            if (modalInstance) modalInstance.hide();

            await fetchCollections();
            await fetchBots();
            renderAssignments();
        } catch (err) {
            console.error('saveImageCollection error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการบันทึกคลังรูปภาพ', 'danger');
        } finally {
            elements.saveCollectionBtn.disabled = false;
            elements.saveCollectionBtn.innerHTML = '<i class="fas fa-save me-1"></i>บันทึก';
        }
    };

    const deleteImageCollection = async () => {
        const collectionId = state.editingCollectionId;
        if (!collectionId) return;
        const collection = getCollectionById(collectionId);
        if (!collection) {
            showAlert('ไม่พบคลังรูปภาพที่ต้องการลบ', 'warning');
            return;
        }
        if (collection.isDefault) {
            showAlert('ไม่สามารถลบคลังรูปภาพเริ่มต้นของระบบได้', 'warning');
            return;
        }
        if (!confirm(`ยืนยันการลบคลังรูปภาพ "${collection.name}"?`)) {
            return;
        }
        try {
            elements.deleteCollectionBtn.disabled = true;
            const response = await fetch(`/admin/image-collections/${collectionId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถลบคลังรูปภาพได้');
            }
            showAlert(data.message || 'ลบคลังรูปภาพเรียบร้อยแล้ว', 'success');
            const modalInstance = bootstrap.Modal.getInstance(elements.collectionModal);
            if (modalInstance) modalInstance.hide();
            await fetchCollections();
            await fetchBots();
            renderAssignments();
        } catch (err) {
            console.error('deleteImageCollection error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการลบคลังรูปภาพ', 'danger');
        } finally {
            elements.deleteCollectionBtn.disabled = false;
        }
    };

    const renderAssignments = () => {
        renderBotAssignments('line', elements.lineAssignments, state.lineBots);
        renderBotAssignments('facebook', elements.facebookAssignments, state.facebookBots);
    };

    const renderBotAssignments = (type, container, bots) => {
        if (!container) return;
        if (!Array.isArray(bots) || bots.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-robot mb-2"></i>
                    <div>ยังไม่มี ${type === 'line' ? 'LINE Bot' : 'Facebook Bot'}</div>
                    <small class="text-muted">เพิ่มบอทก่อนเพื่อกำหนดคลังรูปภาพ</small>
                </div>
            `;
            return;
        }

        const html = bots
            .map((bot) => {
                const selected = Array.isArray(bot.selectedImageCollections)
                    ? bot.selectedImageCollections
                    : [];
                const count = selected.length;
                const collectionsDisplay = count > 0
                    ? selected.slice(0, 3).map((id) => `<span class="collection-pill">${getCollectionName(id)}</span>`).join('')
                    : '<span class="collection-pill default">ทุกภาพ</span>';
                const remaining = count > 3 ? `<span class="collection-pill more">+${count - 3}</span>` : '';
                const description = bot.description ? `<div class="text-muted small">${bot.description}</div>` : '';
                return `
                    <div class="assignment-item">
                        <div class="assignment-info">
                            <div class="assignment-name">
                                <strong>${bot.name || 'ไม่ระบุชื่อ'}</strong>
                                ${description}
                                <div class="assignment-collections">
                                    ${collectionsDisplay}${remaining}
                                </div>
                                <div class="text-muted small">ใช้ ${count > 0 ? `${count} ชุด` : 'ทุกภาพในระบบ'}</div>
                            </div>
                        </div>
                        <div class="assignment-action">
                            <button class="btn btn-sm btn-outline-primary" data-action="edit-bot" data-bot-type="${type}" data-bot-id="${bot._id}">
                                <i class="fas fa-layer-group me-1"></i>เลือกแกลเลอรี
                            </button>
                        </div>
                    </div>
                `;
            })
            .join('');

        container.innerHTML = html;
    };

    const openBotImageCollectionsModal = (botType, botId) => {
        if (!elements.botModal) return;
        const list = botType === 'line' ? state.lineBots : state.facebookBots;
        const bot = list.find((item) => item._id === botId);
        if (!bot) {
            showAlert('ไม่พบบอทที่เลือก', 'warning');
            return;
        }
        state.editingBot = { botType, botId };
        state.botCollectionFilter = '';
        if (elements.botCollectionsSearch) {
            elements.botCollectionsSearch.value = '';
        }

        if (elements.botModalLabel) {
            const platformIcon = botType === 'line'
                ? '<span class="assignment-icon line me-2"><i class="fab fa-line"></i></span>'
                : '<span class="assignment-icon facebook me-2"><i class="fab fa-facebook-f"></i></span>';
            elements.botModalLabel.innerHTML = `${platformIcon}เลือกคลังรูปภาพสำหรับ ${bot.name || 'ไม่ระบุชื่อ'}`;
        }

        if (elements.botModalSummary) {
            const platformText = botType === 'line' ? 'LINE Bot' : 'Facebook Bot';
            const selected = Array.isArray(bot.selectedImageCollections)
                ? bot.selectedImageCollections.length
                : 0;
            elements.botModalSummary.innerHTML = `
                <div><strong>${platformText}:</strong> ${bot.name || bot._id}</div>
                <div class="text-muted small">กำลังใช้งานอยู่: ${selected > 0 ? `${selected} ชุด` : 'ทุกภาพในระบบ'}</div>
            `;
        }

        renderBotCollectionsChecklist();

        const modalInstance = bootstrap.Modal.getOrCreateInstance(elements.botModal);
        modalInstance.show();
    };

    const renderBotCollectionsChecklist = () => {
        if (!elements.botCollectionsList) return;
        const filter = state.botCollectionFilter;
        const source = filter
            ? state.collections.filter((collection) => {
                const name = (collection.name || '').toLowerCase();
                const description = (collection.description || '').toLowerCase();
                return name.includes(filter) || description.includes(filter);
            })
            : state.collections;

        const currentSelections = new Set();
        if (state.editingBot) {
            const list = state.editingBot.botType === 'line' ? state.lineBots : state.facebookBots;
            const bot = list.find((item) => item._id === state.editingBot.botId);
            if (bot && Array.isArray(bot.selectedImageCollections)) {
                bot.selectedImageCollections.forEach((id) => currentSelections.add(id));
            }
        }

        if (!Array.isArray(source) || source.length === 0) {
            elements.botCollectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images mb-2"></i>
                    <div>ยังไม่มีคลังรูปภาพ</div>
                    <small class="text-muted">สร้างคลังรูปภาพก่อนเพื่อเลือกให้บอทใช้งาน</small>
                </div>
            `;
            elements.saveBotCollectionsBtn.disabled = true;
            return;
        }

        elements.saveBotCollectionsBtn.disabled = false;

        const html = source
            .map((collection, index) => {
                const id = `bot-collection-${index}`;
                const checked = currentSelections.has(collection._id) ? 'checked' : '';
                const imagesCount = Array.isArray(collection.images) ? collection.images.length : 0;
                const badge = collection.isDefault ? '<span class="badge bg-success-soft text-success ms-2">ค่าเริ่มต้น</span>' : '';
                return `
                    <label class="collection-select-item" for="${id}">
                        <input type="checkbox" class="form-check-input" id="${id}" value="${collection._id}" ${checked}>
                        <div class="collection-select-info">
                            <div>
                                <strong>${collection.name}</strong>
                                ${badge}
                            </div>
                            <small class="text-muted">${collection.description || 'ไม่มีคำอธิบาย'}</small>
                        </div>
                        <span class="badge bg-light text-dark"><i class="fas fa-image me-1"></i>${imagesCount}</span>
                    </label>
                `;
            })
            .join('');

        elements.botCollectionsList.innerHTML = html;
    };

    const saveBotImageCollections = async () => {
        if (!state.editingBot) return;
        const { botType, botId } = state.editingBot;
        const selected = Array.from(
            elements.botCollectionsList?.querySelectorAll('input[type="checkbox"]:checked') || []
        ).map((input) => input.value);

        const payload = { selectedImageCollections: selected };
        const url =
            botType === 'line'
                ? `/api/line-bots/${botId}/image-collections`
                : `/api/facebook-bots/${botId}/image-collections`;

        try {
            elements.saveBotCollectionsBtn.disabled = true;
            elements.saveBotCollectionsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก';

            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'ไม่สามารถบันทึกการเลือกคลังรูปภาพได้');
            }

            showAlert(data.message || 'อัปเดตคลังรูปภาพที่ใช้กับบอทเรียบร้อยแล้ว', 'success');

            const modalInstance = bootstrap.Modal.getInstance(elements.botModal);
            if (modalInstance) modalInstance.hide();

            await fetchBots();
            renderAssignments();

            if (typeof loadLineBotSettings === 'function') {
                loadLineBotSettings();
            }
            if (typeof loadFacebookBotSettings === 'function') {
                loadFacebookBotSettings();
            }
        } catch (err) {
            console.error('saveBotImageCollections error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการอัปเดตคลังรูปภาพของบอท', 'danger');
        } finally {
            elements.saveBotCollectionsBtn.disabled = false;
            elements.saveBotCollectionsBtn.innerHTML = '<i class="fas fa-save me-1"></i>บันทึกการเลือก';
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.imageCollectionsManager = {
        refreshAll,
        openCollectionModal,
        openBotImageCollectionsModal
    };
})();
