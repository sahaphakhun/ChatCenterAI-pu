(() => {
  // State
  let messageItems = [];
  let pollInterval = null;
  let isSubmitting = false;

  // DOM Elements
  const messageList = document.getElementById('messageList');
  const addTextBtn = document.getElementById('addTextBtn');
  const addImageBtn = document.getElementById('addImageBtn');
  const messagesInput = document.getElementById('messagesInput');
  const audienceStats = document.getElementById('audienceStats');
  const audienceTotal = document.getElementById('audienceTotal');
  const audienceLine = document.getElementById('audienceLine');
  const audienceFb = document.getElementById('audienceFb');
  const progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
  const toastContainer = document.getElementById('broadcastToastContainer');
  const broadcastForm = document.getElementById('broadcastForm');
  const submitBtn = document.getElementById('submitBroadcastBtn');
  const cancelBtn = document.getElementById('cancelBroadcastBtn');
  const previewMessage = document.getElementById('previewMessage');
  const previewStatus = document.getElementById('previewStatus');
  const previewAudienceLabel = document.getElementById('previewAudienceLabel');
  const previewChannelsLabel = document.getElementById('previewChannelsLabel');
  const previewBtn = document.getElementById('previewBtn');
  const previewBtnInline = document.getElementById('previewBtnInline');
  const previewCard = document.getElementById('broadcastPreview');

  // Progress Elements
  const progressBar = document.querySelector('#progressModal .progress-bar');
  const sentCountEl = document.getElementById('sentCount');
  const totalCountEl = document.getElementById('totalCount');
  const cancelButton = document.getElementById('cancelBroadcastBtn');

  // --- Utilities ---
  const ensureToastContainer = () => toastContainer;

  const showToast = (message, type = 'info') => {
    const container = ensureToastContainer();
    if (!container) return;
    const typeMap = {
      success: { icon: 'fa-check-circle', className: 'app-toast--success' },
      error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
      warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
      info: { icon: 'fa-info-circle', className: 'app-toast--info' },
    };
    const { icon, className } = typeMap[type] || typeMap.info;
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
    setTimeout(removeToast, 3500);
  };

  const getSelectedAudienceLabel = () => {
    const selectedCard = document.querySelector('.audience-card.active');
    const title = selectedCard?.querySelector('.audience-title');
    return (title?.textContent || '').trim() || 'ไม่ระบุ';
  };

  const getSelectedChannelsLabel = () => {
    const selected = Array.from(document.querySelectorAll('input[name="channels"]:checked'));
    if (!selected.length) return 'ยังไม่เลือก';
    const labels = selected.map(input => {
      const labelEl = document.querySelector(`label[for="${input.id}"]`);
      const raw = labelEl ? labelEl.textContent : input.value;
      return (raw || '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    return labels.length ? labels.join(', ') : 'ยังไม่เลือก';
  };

  const formatPreviewItem = (item, index, total) => {
    const prefix = total > 1 ? `${index + 1}. ` : '';
    if (item.type === 'image') {
      const filename = item.file?.name ? ` (${item.file.name})` : '';
      return `${prefix}รูปภาพ${filename}`;
    }
    const text = (item.content || '').trim();
    return `${prefix}${text || '(ข้อความว่าง)'}`;
  };

  const updatePreview = () => {
    if (previewAudienceLabel) {
      previewAudienceLabel.textContent = getSelectedAudienceLabel();
    }
    if (previewChannelsLabel) {
      previewChannelsLabel.textContent = getSelectedChannelsLabel();
    }
    if (!previewMessage) return;
    if (!messageItems.length) {
      previewMessage.textContent = 'พิมพ์ข้อความเพื่อดูตัวอย่าง...';
      if (previewStatus) previewStatus.textContent = 'ยังไม่มีข้อความ';
      return;
    }
    const lines = messageItems.map((item, index) =>
      formatPreviewItem(item, index, messageItems.length)
    );
    previewMessage.textContent = lines.join('\n\n');
    if (previewStatus) {
      previewStatus.textContent = `มีข้อความ ${messageItems.length} รายการ`;
    }
  };

  const handlePreviewClick = () => {
    updatePreview();
    if (previewCard && previewCard.scrollIntoView) {
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // --- Audience Preview ---
  const updateAudiencePreview = async () => {
    const channels = Array.from(document.querySelectorAll('input[name="channels"]:checked')).map(c => c.value);
    const audience = document.querySelector('input[name="audience"]:checked')?.value || 'all';

    if (channels.length === 0) {
      audienceStats.style.display = 'none';
      updatePreview();
      return;
    }

    try {
      audienceTotal.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      audienceStats.style.display = 'block';

      const res = await fetch('/admin/broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, audience })
      });
      const data = await res.json();

      if (data.success) {
        audienceTotal.textContent = data.counts.total.toLocaleString();
        audienceLine.textContent = data.counts.line.toLocaleString();
        audienceFb.textContent = data.counts.facebook.toLocaleString();
      } else {
        audienceTotal.textContent = '-';
      }
    } catch (e) {
      console.error("Preview error", e);
      audienceTotal.textContent = '?';
    } finally {
      updatePreview();
    }
  };

  // Listeners for Audience
  document.querySelectorAll('input[name="channels"], input[name="audience"]').forEach(input => {
    input.addEventListener('change', updateAudiencePreview);
  });
  // Setup Audience Card clicks
  document.querySelectorAll('.audience-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.audience-card').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const radio = btn.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        updateAudiencePreview();
      }
    });
  });


  // --- Message Editor ---
  const renderMessageList = () => {
    messageList.innerHTML = '';

    if (messageItems.length === 0) {
      messageList.innerHTML = `<div class="message-item empty-state text-center p-3 border rounded border-dashed bg-light text-muted">ยังไม่มีข้อความ กดปุ่มด้านล่างเพื่อเพิ่ม</div>`;
      updatePreview();
      return;
    }

    messageItems.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'card mb-2 message-item';

      const body = document.createElement('div');
      body.className = 'card-body p-2 d-flex align-items-center gap-2';

      const indexBadge = document.createElement('div');
      indexBadge.className = 'badge bg-secondary';
      indexBadge.textContent = String(index + 1);

      const contentWrap = document.createElement('div');
      contentWrap.className = 'flex-grow-1';

      if (item.type === 'text') {
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control';
        textarea.rows = 2;
        textarea.placeholder = 'พิมพ์ข้อความ...';
        textarea.value = item.content || '';
        textarea.addEventListener('input', (e) => {
          item.content = e.target.value;
          updatePreview();
        });
        contentWrap.appendChild(textarea);
      } else {
        const group = document.createElement('div');
        group.className = 'input-group';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'form-control';
        fileInput.accept = 'image/*';
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            item.file = e.target.files[0];
            renderMessageList();
            updatePreview();
          }
        });

        group.appendChild(fileInput);

        if (item.file) {
          const ok = document.createElement('span');
          ok.className = 'input-group-text bg-success text-white';
          ok.innerHTML = '<i class="fas fa-check"></i>';
          group.appendChild(ok);
        }

        contentWrap.appendChild(group);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-outline-danger btn-sm remove-msg';
      removeBtn.setAttribute('aria-label', 'ลบข้อความ');
      removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
      removeBtn.addEventListener('click', () => {
        messageItems.splice(index, 1);
        renderMessageList();
        updatePreview();
      });

      body.appendChild(indexBadge);
      body.appendChild(contentWrap);
      body.appendChild(removeBtn);
      div.appendChild(body);

      messageList.appendChild(div);
    });
    updatePreview();
  };

  addTextBtn.addEventListener('click', () => {
    if (messageItems.length >= 5) return showToast('ส่งได้สูงสุด 5 ข้อความ', 'warning');
    messageItems.push({ type: 'text', content: '' });
    renderMessageList();
    updatePreview();
  });

  addImageBtn.addEventListener('click', () => {
    if (messageItems.length >= 5) return showToast('ส่งได้สูงสุด 5 ข้อความ', 'warning');
    messageItems.push({ type: 'image', file: null });
    renderMessageList();
    updatePreview();
  });


  // --- Submission & Progress ---
  broadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validation
    if (messageItems.length === 0) return showToast('กรุณาเพิ่มข้อความอย่างน้อย 1 ข้อความ', 'warning');

    const textItems = messageItems.filter(m => m.type === 'text');
    if (textItems.some(m => !m.content.trim())) return showToast('กรุณากรอกข้อความให้ครบถ้วน', 'warning');

    const imgItems = messageItems.filter(m => m.type === 'image');
    if (imgItems.some(m => !m.file)) return showToast('กรุณาเลือกรูปภาพให้ครบถ้วน', 'warning');

    const channels = document.querySelectorAll('input[name="channels"]:checked');
    if (channels.length === 0) return showToast('กรุณาเลือกช่องทาง', 'warning');

    // Prepare Data
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> กำลังเริ่ม...';

    const formData = new FormData(broadcastForm);

    // Construct Messages JSON & Append Files
    const messagesPayload = [];
    messageItems.forEach(msg => {
      if (msg.type === 'text') {
        messagesPayload.push({ type: 'text', content: msg.content.trim() });
      } else if (msg.type === 'image') {
        messagesPayload.push({ type: 'image' });
        formData.append('images', msg.file);
      }
    });
    formData.set('messages', JSON.stringify(messagesPayload));

    // JSON-ify other fields just to be safe if backend expects parsing
    const channelsArr = Array.from(channels).map(c => c.value);
    formData.set('channels', JSON.stringify(channelsArr));

    const audienceVal = document.querySelector('input[name="audience"]:checked')?.value || 'all';
    formData.set('audience', JSON.stringify(audienceVal));

    const settings = {
      batchSize: document.querySelector('input[name="settings_batchSize"]').value,
      batchDelay: document.querySelector('input[name="settings_batchDelay"]').value,
      messageDelay: document.querySelector('input[name="settings_messageDelay"]').value
    };
    formData.set('settings', JSON.stringify(settings));

    try {
      const res = await fetch('/admin/broadcast', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();

      if (result.success) {
        // Start Polling
        progressModal.show();
        startPolling(result.broadcastId);
      } else {
        showToast(result.error || 'การส่งล้มเหลว', 'error');
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
    }
  });

  const startPolling = (jobId) => {
    // Setup cancel button
    cancelButton.onclick = async () => {
      if (confirm('ต้องการยกเลิกการส่งหรือไม่?')) {
        await fetch(`/admin/broadcast/cancel/${jobId}`, { method: 'DELETE' });
        showToast('ยกเลิกการส่งแล้ว', 'info');
      }
    };

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/admin/broadcast/status/${jobId}`);
        const data = await res.json();

	        if (!data.success) {
	          clearInterval(pollInterval);
	          showToast(`ไม่สามารถตรวจสอบสถานะได้: ${data.error || 'unknown'}`, 'error');
	          resetForm();
	          return;
	        }

        const { stats } = data;
        updateProgressUI(stats);

        if (['completed', 'cancelled', 'failed'].includes(stats.status)) {
          clearInterval(pollInterval);
          setTimeout(() => {
            progressModal.hide();
            showToast(`การส่งจบลงด้วยสถานะ: ${stats.status}`, stats.status === 'completed' ? 'success' : 'warning');
            resetForm();
          }, 1000);
        }

      } catch (e) {
        console.error("Polling error", e);
      }
    }, 2000);
  };

  const updateProgressUI = (stats) => {
    const percent = Math.round(((stats.sent + stats.failed) / stats.total) * 100) || 0;
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
    sentCountEl.textContent = (stats.sent + stats.failed).toLocaleString();
    totalCountEl.textContent = stats.total.toLocaleString();
  };

  const resetForm = () => {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
    // Optional: Clear form
    // messageItems = [];
    // renderMessageList();
    updatePreview();
  };

  // Init
  if (previewBtn) {
    previewBtn.addEventListener('click', handlePreviewClick);
  }
  if (previewBtnInline) {
    previewBtnInline.addEventListener('click', handlePreviewClick);
  }

  updateAudiencePreview();
  updatePreview();

})();
