// public/js/import-export-manager.js

let importFileToken = null;
let importFileTokenIssuedAt = 0;
let existingInstructions = [];
let sheetPreviews = [];
let allInstructionsForExport = [];
let toastContainer = null;

function ensureToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'app-toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
}

function showToast(message, type = 'info') {
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
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Modal Events
    const importExportModal = document.getElementById('importExportModal');
    if (importExportModal) {
        importExportModal.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            if (button) {
                const tab = button.getAttribute('data-tab');
                if (tab) {
                    // Delay slightly to allow modal to show
                    setTimeout(() => switchIETab(tab), 100);
                }
            }
        });

        // Tab click listeners to update footer
        const tabEls = importExportModal.querySelectorAll('button[data-bs-toggle="tab"]');
        tabEls.forEach(el => {
            el.addEventListener('shown.bs.tab', (event) => {
                const targetId = event.target.getAttribute('data-bs-target');
                if (targetId === '#importPanel') updateFooter('import');
                else if (targetId === '#exportPanel') updateFooter('export');
            });
        });
    }

    // Import Events
    const importFileInput = document.getElementById('importFile');
    if (importFileInput) {
        importFileInput.addEventListener('change', handleFileSelect);
    }

    const btnResetImport = document.getElementById('btnResetImport');
    if (btnResetImport) {
        btnResetImport.addEventListener('click', resetImport);
    }

    const btnConfirmImport = document.getElementById('btnConfirmImport');
    if (btnConfirmImport) {
        btnConfirmImport.addEventListener('click', executeImport);
    }

    // Export Events
    const selectAllExport = document.getElementById('selectAllExport');
    if (selectAllExport) {
        selectAllExport.addEventListener('click', toggleSelectAllExport);
    }

    const btnExecuteExport = document.getElementById('btnExecuteExport');
    if (btnExecuteExport) {
        btnExecuteExport.addEventListener('click', executeExport);
    }
});

function switchIETab(tabName) {
    const triggerEl = document.querySelector(`#ieTabs button[data-bs-target="#${tabName}Panel"]`);
    if (triggerEl) {
        const tab = new bootstrap.Tab(triggerEl);
        tab.show();
        updateFooter(tabName);

        if (tabName === 'export') {
            loadExportList();
        }
    }
}

function updateFooter(tabName) {
    const importFooter = document.getElementById('importFooter');
    const exportFooter = document.getElementById('exportFooter');
    
    if (tabName === 'import') {
        if(importFooter) importFooter.classList.remove('d-none');
        if(exportFooter) exportFooter.classList.add('d-none');
    } else {
        if(importFooter) importFooter.classList.add('d-none');
        if(exportFooter) exportFooter.classList.remove('d-none');
        loadExportList(); // Load list when switching to export
    }
}

// ================= IMPORT LOGIC =================

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show Loading
    document.getElementById('importStep1').classList.add('d-none');
    document.getElementById('importLoading').classList.remove('d-none');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/instructions-v2/import/preview-sheets', {
            method: 'POST',
            body: formData
        });
        const data = await res.json().catch(() => null);

        if (res.ok && data && data.success) {
            importFileToken = data.fileToken;
            importFileTokenIssuedAt = Date.now();
            existingInstructions = data.existingInstructions || [];
            sheetPreviews = data.previews;
            renderMappingTable();
            
            document.getElementById('importLoading').classList.add('d-none');
            document.getElementById('importStep2').classList.remove('d-none');
            document.getElementById('btnConfirmImport').classList.remove('d-none');
        } else {
            showToast((data && data.error) ? data.error : 'อัปโหลดไฟล์ไม่สำเร็จ', 'error');
            resetImport();
        }
    } catch (err) {
        console.error(err);
        showToast('เกิดข้อผิดพลาดในการอัปโหลดไฟล์', 'error');
        resetImport();
    }
}

function resetImport() {
    document.getElementById('importFile').value = '';
    document.getElementById('importStep1').classList.remove('d-none');
    document.getElementById('importStep2').classList.add('d-none');
    document.getElementById('importLoading').classList.add('d-none');
    document.getElementById('btnConfirmImport').classList.add('d-none');
    importFileToken = null;
    importFileTokenIssuedAt = 0;
    sheetPreviews = [];
    document.getElementById('sheetMappingTable').innerHTML = '';
}

function renderMappingTable() {
    const tbody = document.getElementById('sheetMappingTable');
    tbody.innerHTML = '';

    const createTargetControl = (action, sheetName) => {
        if (action === 'create') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm target-input';
            input.value = sheetName || '';
            input.placeholder = 'ชื่อ Instruction';
            return input;
        }

        if (action === 'update') {
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm target-select';

            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '-- เลือก Instruction --';
            select.appendChild(placeholder);

            // Sort alphabetically
            const sorted = [...existingInstructions].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            // Try to match by name (case insensitive)
            sorted.forEach(inst => {
                const opt = document.createElement('option');
                opt.value = inst._id || '';
                opt.textContent = inst.name || '(No Name)';
                const isMatch = (inst.name || '').toLowerCase() === (sheetName || '').toLowerCase();
                if (isMatch) opt.selected = true;
                select.appendChild(opt);
            });

            return select;
        }

        const muted = document.createElement('span');
        muted.className = 'text-muted';
        muted.textContent = '-';
        return muted;
    };

    sheetPreviews.forEach((sheet, index) => {
        const tr = document.createElement('tr');

        // Sheet Name
        const sheetTd = document.createElement('td');
        const sheetName = sheet.sheetName || '';
        const sheetNameDiv = document.createElement('div');
        sheetNameDiv.className = 'fw-bold text-truncate';
        sheetNameDiv.style.maxWidth = '150px';
        sheetNameDiv.title = sheetName;
        sheetNameDiv.textContent = sheetName;

        const sheetMeta = document.createElement('small');
        sheetMeta.className = 'text-muted';
        sheetMeta.textContent = `${sheet.totalRows} rows`;

        sheetTd.appendChild(sheetNameDiv);
        sheetTd.appendChild(sheetMeta);
        tr.appendChild(sheetTd);

        // Action
        const actionTd = document.createElement('td');
        const actionSelect = document.createElement('select');
        actionSelect.className = 'form-select form-select-sm action-select';
        actionSelect.dataset.index = index;
        actionSelect.innerHTML = `
            <option value="create">Create New</option>
            <option value="update">Add to Existing</option>
            <option value="ignore">Ignore</option>
        `;
        actionTd.appendChild(actionSelect);
        tr.appendChild(actionTd);

        // Target
        const targetTd = document.createElement('td');
        targetTd.appendChild(createTargetControl('create', sheetName));
        tr.appendChild(targetTd);

        // Mode
        const modeTd = document.createElement('td');
        const modeSelect = document.createElement('select');
        modeSelect.className = 'form-select form-select-sm mode-select';
        modeSelect.disabled = true;
        modeSelect.innerHTML = `
            <option value="append">Append</option>
            <option value="replace">Replace</option>
        `;
        modeTd.appendChild(modeSelect);
        tr.appendChild(modeTd);

        tbody.appendChild(tr);

        // Event Listener for Action Change
        actionSelect.addEventListener('change', (e) => {
            const action = e.target.value;
            // Update Target Cell
            targetTd.innerHTML = '';
            targetTd.appendChild(createTargetControl(action, sheetName));

            // Update Mode Cell
            modeSelect.disabled = (action !== 'update');
        });
    });
}

async function executeImport() {
    if (!importFileToken) {
        showToast('กรุณาอัปโหลดไฟล์ก่อนเริ่มนำเข้า', 'warning');
        return;
    }
    const rows = document.querySelectorAll('#sheetMappingTable tr');
    const mappings = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const action = row.querySelector('.action-select').value;
        const sheetName = sheetPreviews[i].sheetName;
        
        let mapping = { sheetName, action };

        if (action === 'create') {
            const targetName = row.querySelector('.target-input').value;
            if (!targetName) {
                showToast(`กรุณาระบุชื่อ Instruction สำหรับชีต "${sheetName}"`, 'warning');
                return;
            }
            mapping.targetName = targetName;
        } else if (action === 'update') {
            const targetId = row.querySelector('.target-select').value;
            if (!targetId) {
                showToast(`กรุณาเลือก Instruction เป้าหมายสำหรับชีต "${sheetName}"`, 'warning');
                return;
            }
            mapping.targetId = targetId;
            mapping.mode = row.querySelector('.mode-select').value;
        }

        mappings.push(mapping);
    }

    // Disable button
    const btn = document.getElementById('btnConfirmImport');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Processing...';

    try {
        const res = await fetch('/api/instructions-v2/import/execute-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings, fileToken: importFileToken })
        });
        const data = await res.json().catch(() => null);

        if (res.ok && data && data.success) {
            showToast('นำเข้าข้อมูลสำเร็จ กำลังรีโหลด...', 'success');
            setTimeout(() => location.reload(), 600);
        } else {
            const errorMessage = (data && data.error) ? data.error : 'ไม่สามารถนำเข้าข้อมูลได้';
            showToast(errorMessage, 'error');
            if (errorMessage.includes('ไฟล์หมดอายุ') || errorMessage.includes('อัพโหลดใหม่')) {
                resetImport();
            }
            btn.disabled = false;
            btn.innerHTML = 'ยืนยันการนำเข้า';
        }
    } catch (err) {
        console.error(err);
        showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
        btn.disabled = false;
        btn.innerHTML = 'ยืนยันการนำเข้า';
    }
}


// ================= EXPORT LOGIC =================

async function loadExportList() {
    const container = document.getElementById('exportList');
    if (!container) return;
    
    if (allInstructionsForExport.length === 0) {
         container.innerHTML = `<div class="text-center py-3 text-muted">
             <div class="spinner-border spinner-border-sm mb-2"></div>
             <div>กำลังโหลดข้อมูล...</div>
         </div>`;
    }

    try {
        const res = await fetch('/api/instructions-v2');
        const data = await res.json();
        
        if (data.success) {
            allInstructionsForExport = data.instructions || [];
            renderExportList();
        } else {
            container.innerHTML = `<div class="text-center text-danger p-3">Error loading instructions</div>`;
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="text-center text-danger p-3">Error loading instructions</div>`;
    }
}

function renderExportList() {
    const container = document.getElementById('exportList');
    container.innerHTML = '';

    if (allInstructionsForExport.length === 0) {
        container.innerHTML = '<div class="text-center p-3">No instructions found.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    allInstructionsForExport.forEach(inst => {
        const div = document.createElement('div');
        div.className = 'list-group-item';

        const checkWrap = document.createElement('div');
        checkWrap.className = 'form-check';

        const input = document.createElement('input');
        input.className = 'form-check-input export-checkbox';
        input.type = 'checkbox';
        input.value = inst._id || '';
        input.id = `export_${inst._id || Math.random().toString(36).slice(2)}`;

        const label = document.createElement('label');
        label.className = 'form-check-label w-100';
        label.htmlFor = input.id;
        label.appendChild(document.createTextNode(inst.name || '(No Name) '));

        const meta = document.createElement('span');
        meta.className = 'text-muted small ms-2';
        meta.textContent = `(${inst.instructionId || 'No ID'})`;
        label.appendChild(meta);

        checkWrap.appendChild(input);
        checkWrap.appendChild(label);
        div.appendChild(checkWrap);
        frag.appendChild(div);
    });
    container.appendChild(frag);
}

function toggleSelectAllExport() {
    const checkboxes = document.querySelectorAll('.export-checkbox');
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    
    checkboxes.forEach(c => c.checked = !allChecked);
    
    const btn = document.getElementById('selectAllExport');
    if(btn) {
        btn.innerHTML = !allChecked ? '<i class="fas fa-times me-1"></i>ยกเลิกเลือกทั้งหมด' : '<i class="fas fa-check-double me-1"></i>เลือกทั้งหมด';
    }
}

async function executeExport() {
    const checkboxes = document.querySelectorAll('.export-checkbox:checked');
    const ids = Array.from(checkboxes).map(c => c.value);
    
    if (ids.length === 0) {
        showToast('กรุณาเลือก Instruction อย่างน้อย 1 รายการ', 'warning');
        return;
    }
    
    const btn = document.getElementById('btnExecuteExport');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Exporting...';

    try {
        const res = await fetch('/api/instructions-v2/export-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructionIds: ids })
        });
        
        if (res.ok) {
            // Trigger download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `instructions_export_${new Date().toISOString().slice(0,10)}.xlsx`;
            
            const disposition = res.headers.get('Content-Disposition');
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) { 
                    a.download = matches[1].replace(/['"]/g, '');
                }
            }
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            const json = await res.json();
            showToast(json.error || 'ส่งออกไม่สำเร็จ', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('ส่งออกไม่สำเร็จ', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
