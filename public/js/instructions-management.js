// Instructions Management JavaScript

const INSTRUCTION_SOURCE = {
  V2: "v2",
  LEGACY: "legacy"
};

// Clean up modal backdrops
function cleanupModalBackdrop() {
  setTimeout(() => {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }, 300);
}

function cloneBotInstructionSelections(selections) {
  if (!Array.isArray(selections)) return [];
  return selections.map((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return { ...entry };
    }
    return entry;
  });
}

function isSelectionObject(entry) {
  return !!entry && typeof entry === "object" && !Array.isArray(entry) && entry.instructionId;
}

function getLibrarySelectionKey(library) {
  if (!library) return "";
  if (library.source === INSTRUCTION_SOURCE.V2 && library.instructionId) {
    return `${INSTRUCTION_SOURCE.V2}:${library.instructionId}`;
  }
  if (library.date) {
    return `${INSTRUCTION_SOURCE.LEGACY}:${library.date}`;
  }
  return `${library.source || "library"}:${library.name || ""}`;
}

function findLibraryByKey(key) {
  if (!key || !Array.isArray(availableLibraries)) return null;
  return availableLibraries.find((lib) => getLibrarySelectionKey(lib) === key) || null;
}

function selectionMatchesLibrary(selection, library) {
  if (!library) return false;
  if (library.source === INSTRUCTION_SOURCE.V2 && library.instructionId) {
    if (isSelectionObject(selection)) {
      return selection.instructionId === library.instructionId;
    }
    return typeof selection === "string" && selection === library.instructionId;
  }
  return typeof selection === "string" && selection === library.date;
}

function isLibrarySelected(library) {
  if (!library || !Array.isArray(currentBotInstructions)) return false;
  return currentBotInstructions.some((selection) =>
    selectionMatchesLibrary(selection, library),
  );
}

function getCurrentSelectedLibrary() {
  if (!Array.isArray(availableLibraries)) return null;
  return availableLibraries.find((lib) => isLibrarySelected(lib)) || null;
}

function safeRefreshInstructionAssetUsage() {
  if (typeof refreshInstructionAssetUsage === "function") {
    try {
      const result = refreshInstructionAssetUsage();
      if (result && typeof result.then === "function") {
        return result;
      }
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return Promise.resolve();
}

function buildSelectionPayload(library) {
  if (!library) return null;
  if (library.source === INSTRUCTION_SOURCE.V2 && library.instructionId) {
    return { instructionId: library.instructionId };
  }
  return library.date || null;
}

function setCurrentSelectionFromLibrary(library) {
  if (!library) {
    currentBotInstructions = [];
    return;
  }
  const payload = buildSelectionPayload(library);
  if (!payload) {
    currentBotInstructions = [];
    return;
  }
  currentBotInstructions = [payload];
}

// Setup modal event listeners
function setupModalEventListeners() {
  const modalElement = document.getElementById("manageInstructionsModal");
  if (modalElement && !modalElement.hasAttribute('data-listeners-attached')) {
    modalElement.addEventListener('hidden.bs.modal', cleanupModalBackdrop);
    modalElement.setAttribute('data-listeners-attached', 'true');
  }
}

async function loadInstructionLibraries(options = {}) {
  const { showError = false } = options;
  try {
    const response = await fetch("/api/instructions/library");
    if (!response.ok) {
      throw new Error("ไม่สามารถดึงรายการ instruction library ได้");
    }
    const result = await response.json();
    availableLibraries = Array.isArray(result.libraries) ? result.libraries : [];
    if (
      window.adminSettings &&
      typeof window.adminSettings.setInstructionLibraryCache === "function"
    ) {
      window.adminSettings.setInstructionLibraryCache(availableLibraries);
    }
    // Update overview badge immediately ifมี
    if (typeof displayInstructionsOverview === "function") {
      displayInstructionsOverview(availableLibraries);
    }
    return availableLibraries;
  } catch (error) {
    console.error("Error loading instruction libraries:", error);
    if (showError) {
      showAlert("ไม่สามารถโหลดคลัง Instructions ได้", "danger");
    }
    return [];
  }
}

function setConvertButtonLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  const defaultLabel = button.querySelector(".default-label");
  const loadingLabel = button.querySelector(".loading-label");
  if (defaultLabel) defaultLabel.classList.toggle("d-none", isLoading);
  if (loadingLabel) loadingLabel.classList.toggle("d-none", !isLoading);
}

async function convertLegacyLibraryToV2(libraryDate, triggerButton) {
  if (!libraryDate) {
    showAlert("ไม่พบข้อมูลคลัง instruction ที่ต้องการแปลง", "warning");
    return;
  }

  setConvertButtonLoading(triggerButton, true);

  try {
    const response = await fetch(
      `/api/instructions/library/${encodeURIComponent(
        libraryDate,
      )}/convert-to-v2`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      const message =
        data?.error || "ไม่สามารถแปลง instruction library เป็น V2 ได้";
      showAlert(message, "danger");
      return;
    }

    if (data.alreadyConverted) {
      showAlert("คลังนี้ถูกแปลงเป็น Instruction Set แล้ว", "info");
    } else {
      showAlert("แปลง Instruction Library เป็น V2 เรียบร้อยแล้ว", "success");
    }

    await loadInstructionLibraries({ showError: true });

    if (data.instruction?.instructionId) {
      const newLibrary = availableLibraries.find(
        (lib) =>
          lib &&
          lib.source === INSTRUCTION_SOURCE.V2 &&
          lib.instructionId === data.instruction.instructionId,
      );
      if (newLibrary) {
        setCurrentSelectionFromLibrary(newLibrary);
      }
    }

    displayInstructionLibraries();
    displaySelectedInstructions();
    updateInstructionCounts();
    safeRefreshInstructionAssetUsage().catch((err) =>
      console.error("refreshInstructionAssetUsage error:", err),
    );
  } catch (error) {
    console.error("Error converting instruction library:", error);
    showAlert("เกิดข้อผิดพลาดระหว่างแปลง instruction library", "danger");
  } finally {
    setConvertButtonLoading(triggerButton, false);
  }
}

// Manage Instructions for Line Bot
async function manageInstructions(botId) {
  currentBotType = "line";
  currentBotId = botId;
  currentBotInstructions = [];
  
  // Setup modal cleanup listeners
  setupModalEventListeners();

  try {
    // Load Line Bot details
    const botResponse = await fetch(`/api/line-bots/${botId}`);
    if (botResponse.ok) {
      const bot = await botResponse.json();
      currentBotInstructions = cloneBotInstructionSelections(bot.selectedInstructions);
      
      // Load keyword settings
      loadKeywordSettingsToForm(bot.keywordSettings);
    }

    // Load available instruction libraries
    await loadInstructionLibraries({ showError: true });

    // Display data
    displayInstructionLibraries();
    displaySelectedInstructions();
    updateInstructionCounts();

    // Show modal
    const manageInstructionsModalLabel = document.getElementById(
      "manageInstructionsModalLabel",
    );
    if (manageInstructionsModalLabel) {
      manageInstructionsModalLabel.innerHTML =
        '<i class="fab fa-line me-2"></i>จัดการ Instructions - Line Bot';
    }

    const modalElement = document.getElementById("manageInstructionsModal");
    let modal = bootstrap.Modal.getInstance(modalElement);
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    modal.show();
  } catch (error) {
    console.error("Error loading instruction data:", error);
    showAlert("เกิดข้อผิดพลาดในการโหลดข้อมูล instructions", "danger");
  }
}

// Manage Instructions for Facebook Bot
async function manageFacebookInstructions(botId) {
  currentBotType = "facebook";
  currentBotId = botId;
  currentBotInstructions = [];
  
  // Setup modal cleanup listeners
  setupModalEventListeners();

  try {
    // Load Facebook Bot details
    const botResponse = await fetch(`/api/facebook-bots/${botId}`);
    if (botResponse.ok) {
      const bot = await botResponse.json();
      currentBotInstructions = cloneBotInstructionSelections(bot.selectedInstructions);
      
      // Load keyword settings
      loadKeywordSettingsToForm(bot.keywordSettings);
    }

    // Load available instruction libraries
    await loadInstructionLibraries({ showError: true });

    // Display data
    displayInstructionLibraries();
    displaySelectedInstructions();
    updateInstructionCounts();

    // Show modal
    const manageInstructionsModalLabel = document.getElementById(
      "manageInstructionsModalLabel",
    );
    if (manageInstructionsModalLabel) {
      manageInstructionsModalLabel.innerHTML =
        '<i class="fab fa-facebook me-2"></i>จัดการ Instructions - Facebook Bot';
    }

    const modalElement = document.getElementById("manageInstructionsModal");
    let modal = bootstrap.Modal.getInstance(modalElement);
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    modal.show();
  } catch (error) {
    console.error("Error loading facebook instruction data:", error);
    showAlert("เกิดข้อผิดพลาดในการโหลดข้อมูล instructions", "danger");
  }
}

// Display available instruction libraries (Single-Select UI)
function displayInstructionLibraries() {
  const container = document.getElementById("instructionLibraries");
  if (!container) return;

  if (!availableLibraries || availableLibraries.length === 0) {
    container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                ยังไม่มีคลัง instructions ในระบบ
            </div>
        `;
    return;
  }

  let html = '<div class="mb-2 text-muted small"><i class="fas fa-info-circle me-1"></i>คลิกเพื่อเลือก instruction (เลือกได้เพียง 1 อัน)</div>';
  availableLibraries.forEach((library) => {
    const isSelected = isLibrarySelected(library);
    const selectionKey = getLibrarySelectionKey(library);
    const selectedClass = isSelected
      ? "border-primary bg-light shadow-sm"
      : "border-secondary";
    const selectedIcon = isSelected
      ? '<i class="fas fa-dot-circle text-primary me-2"></i>'
      : '<i class="far fa-circle text-muted me-2"></i>';
    const selectedBadge = isSelected 
      ? '<span class="badge bg-primary ms-2"><i class="fas fa-check me-1"></i>ใช้งานอยู่</span>' 
      : '';
    const typeBadgeLabel =
      library.source === INSTRUCTION_SOURCE.V2
        ? "Instruction Set"
        : library.type === "auto"
          ? "อัตโนมัติ"
          : "ด้วยตนเอง";
    const typeBadgeClass =
      library.source === INSTRUCTION_SOURCE.V2 ? "bg-info text-dark" : library.type === "auto" ? "bg-primary" : "bg-success";
    const extraMeta =
      library.source === INSTRUCTION_SOURCE.V2
        ? `<div class="small text-muted"><i class="fas fa-layer-group me-1"></i>${library.dataItemCount || 0} data items</div>`
        : "";
    let actionArea = "";
    if (library.source !== INSTRUCTION_SOURCE.V2) {
      if (library.convertedInstructionId) {
        const convertedAtText = library.convertedAt
          ? new Date(library.convertedAt).toLocaleString("th-TH", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        actionArea = `
                <div class="text-muted small mt-2">
                    <i class="fas fa-check text-success me-1"></i>
                    แปลงเป็น Instruction Set แล้ว
                    ${convertedAtText ? `(${convertedAtText})` : ""}
                </div>
            `;
      } else if (library.date) {
        actionArea = `
                <button type="button" class="btn btn-sm btn-outline-primary convert-library-btn mt-2" data-library-date="${library.date}">
                    <span class="default-label"><i class="fas fa-magic me-1"></i>แปลงเป็น Instruction V2</span>
                    <span class="loading-label d-none"><i class="fas fa-circle-notch fa-spin me-1"></i>กำลังแปลง...</span>
                </button>
            `;
      }
    }

    html += `
            <div class="card mb-2 ${selectedClass} library-item" data-selection-key="${selectionKey}" style="cursor: pointer; transition: all 0.2s;">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            ${selectedIcon}
                            <strong>${library.name || library.displayDate}</strong>
                            ${selectedBadge}
                            <br>
                            <small class="text-muted">${library.description || "ไม่มีคำอธิบาย"}</small>
                            <br>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>${library.displayDate}
                                <i class="fas fa-clock me-1 ms-2"></i>${library.displayTime}
                            </small>
                            ${extraMeta}
                            ${actionArea}
                        </div>
                        <div class="text-end">
                            <small class="badge ${typeBadgeClass}">${typeBadgeLabel}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
  });

  container.innerHTML = html;

  // Add click events with hover effect
  document.querySelectorAll(".library-item").forEach((item) => {
    item.addEventListener("click", function () {
      const selectionKey = this.dataset.selectionKey;
      toggleLibrarySelection(selectionKey);
    });
    
    // Add hover effect
    item.addEventListener("mouseenter", function() {
      if (!this.classList.contains("bg-light")) {
        this.style.backgroundColor = "#f8f9fa";
      }
    });
    
    item.addEventListener("mouseleave", function() {
      if (!this.classList.contains("bg-light")) {
        this.style.backgroundColor = "";
      }
    });
  });

  container.querySelectorAll(".convert-library-btn").forEach((btn) => {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      const libraryDate = this.dataset.libraryDate;
      convertLegacyLibraryToV2(libraryDate, this);
    });
  });
}

// Display selected instructions (Single-Select UI)
function displaySelectedInstructions() {
  const container = document.getElementById("selectedInstructions");
  if (!container) return;

  if (currentBotInstructions.length === 0) {
    container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ยังไม่ได้เลือก instruction จากคลัง
                <div class="small mt-2 text-muted">
                    <i class="fas fa-lightbulb me-1"></i>คลิกที่รายการด้านซ้ายเพื่อเลือก instruction ที่ต้องการใช้
                </div>
            </div>
        `;
    return;
  }

  let html = '<div class="mb-2"><strong>Instruction ที่เลือกใช้:</strong></div>';
  
  const library = getCurrentSelectedLibrary();
  if (library) {
    const selectionKey = getLibrarySelectionKey(library);
    const metaText =
      library.source === INSTRUCTION_SOURCE.V2
        ? `<div class="text-muted small"><i class="fas fa-layer-group me-1"></i>${library.dataItemCount || 0} data items</div>`
        : `<div class="text-muted small"><i class="fas fa-archive me-1"></i>Instruction Library (Legacy)</div>`;
    const convertAction =
      library.source === INSTRUCTION_SOURCE.V2 || !library.date
        ? ""
        : `
                <div class="alert alert-warning mt-3 mb-0 small">
                    <div class="d-flex flex-wrap align-items-center gap-2">
                        <div>
                            <i class="fas fa-info-circle me-1"></i>
                            แปลงคลังนี้เป็น Instruction Set เพื่อแก้ไขบนแดชบอร์ดใหม่
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-primary convert-selected-legacy" data-library-date="${library.date}">
                            <span class="default-label"><i class="fas fa-magic me-1"></i>แปลงเป็น Instruction V2</span>
                            <span class="loading-label d-none"><i class="fas fa-circle-notch fa-spin me-1"></i>กำลังแปลง...</span>
                        </button>
                    </div>
                </div>
            `;

    html += `
            <div class="card border-primary shadow-sm">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-2">
                                <i class="fas fa-check-circle text-primary me-2"></i>
                                <strong class="text-primary">${library.name || library.displayDate}</strong>
                                <span class="badge bg-primary ms-2">กำลังใช้งาน</span>
                            </div>
                            <div class="text-muted small mb-2">
                                ${library.description || "ไม่มีคำอธิบาย"}
                            </div>
                            <div class="text-muted small">
                                <i class="fas fa-calendar me-1"></i>${library.displayDate}
                                <i class="fas fa-clock me-1 ms-2"></i>${library.displayTime}
                            </div>
                            ${metaText}
                            ${convertAction}
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeLibrarySelection('${selectionKey}')" title="ยกเลิกการเลือก">
                            <i class="fas fa-times me-1"></i>ยกเลิก
                        </button>
                    </div>
                </div>
            </div>
            <div class="alert alert-info mt-2 mb-0 small">
                <i class="fas fa-info-circle me-1"></i>
                <strong>หมายเหตุ:</strong> เลือกได้เพียง 1 instruction ต่อ 1 เพจ/ไลน์ หากต้องการเปลี่ยน กรุณาคลิกเลือก instruction ใหม่ทางด้านซ้าย
            </div>
        `;
  } else {
    // Fallback if library not found
    html += `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                ไม่พบข้อมูล instruction ที่เลือก
            </div>
        `;
  }

  container.innerHTML = html;

  container.querySelectorAll(".convert-selected-legacy").forEach((btn) => {
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      const libraryDate = this.dataset.libraryDate;
      convertLegacyLibraryToV2(libraryDate, this);
    });
  });
}

// Toggle library selection (Single-Select Mode)
function toggleLibrarySelection(selectionKey) {
  const library = findLibraryByKey(selectionKey);
  if (!library) return;

  if (isLibrarySelected(library)) {
    currentBotInstructions = [];
  } else {
    setCurrentSelectionFromLibrary(library);
  }

  // Refresh display
  displayInstructionLibraries();
  displaySelectedInstructions();
  updateInstructionCounts();
  safeRefreshInstructionAssetUsage().catch((err) =>
    console.error("refreshInstructionAssetUsage error:", err),
  );
}

// Remove library selection
function removeLibrarySelection(selectionKey) {
  const library = findLibraryByKey(selectionKey);
  if (!library) {
    currentBotInstructions = [];
  } else {
    currentBotInstructions = currentBotInstructions.filter(
      (selection) => !selectionMatchesLibrary(selection, library),
    );
  }
  displayInstructionLibraries();
  displaySelectedInstructions();
  updateInstructionCounts();
  safeRefreshInstructionAssetUsage().catch((err) =>
    console.error("refreshInstructionAssetUsage error:", err),
  );
}

// Update instruction counts in badges
function updateInstructionCounts() {
  // Update libraries count
  const librariesCountEl = document.getElementById('librariesCount');
  if (librariesCountEl) {
    const totalLibraries = Array.isArray(availableLibraries) ? availableLibraries.length : 0;
    librariesCountEl.textContent = totalLibraries;
  }
  
  // Update selected count
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) {
    const count = currentBotInstructions.length;
    selectedCountEl.textContent = `${count} / 1`;
    
    // Change badge color based on selection
    selectedCountEl.className = 'badge';
    if (count === 0) {
      selectedCountEl.classList.add('bg-secondary');
    } else {
      selectedCountEl.classList.add('bg-primary');
    }
  }
}

// Save selected instructions
// Load keyword settings to form
function loadKeywordSettingsToForm(keywordSettings) {
  const normalizeKeywordSetting = (setting) => {
    if (!setting) return { keyword: '', response: '' };
    if (typeof setting === 'string') return { keyword: setting, response: '' };
    return { keyword: setting.keyword || '', response: setting.response || '' };
  };
  
  const enableAI = normalizeKeywordSetting(keywordSettings?.enableAI);
  const disableAI = normalizeKeywordSetting(keywordSettings?.disableAI);
  const disableFollowUp = normalizeKeywordSetting(keywordSettings?.disableFollowUp);
  
  const keywordEnableAI = document.getElementById('instructionsKeywordEnableAI');
  const keywordEnableAIResponse = document.getElementById('instructionsKeywordEnableAIResponse');
  
  const keywordDisableAI = document.getElementById('instructionsKeywordDisableAI');
  const keywordDisableAIResponse = document.getElementById('instructionsKeywordDisableAIResponse');
  
  const keywordDisableFollowUp = document.getElementById('instructionsKeywordDisableFollowUp');
  const keywordDisableFollowUpResponse = document.getElementById('instructionsKeywordDisableFollowUpResponse');
  
  if (keywordEnableAI) keywordEnableAI.value = enableAI.keyword || '';
  if (keywordEnableAIResponse) keywordEnableAIResponse.value = enableAI.response || '';
  
  if (keywordDisableAI) keywordDisableAI.value = disableAI.keyword || '';
  if (keywordDisableAIResponse) keywordDisableAIResponse.value = disableAI.response || '';
  
  if (keywordDisableFollowUp) keywordDisableFollowUp.value = disableFollowUp.keyword || '';
  if (keywordDisableFollowUpResponse) keywordDisableFollowUpResponse.value = disableFollowUp.response || '';
}

async function saveSelectedInstructions() {
  if (!currentBotId || !currentBotType) {
    showAlert("ไม่พบ Bot ID", "danger");
    return;
  }

  try {
    // Save instructions
    const instructionsUrl =
      currentBotType === "facebook"
        ? `/api/facebook-bots/${currentBotId}/instructions`
        : `/api/line-bots/${currentBotId}/instructions`;

    const instructionsResponse = await fetch(instructionsUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedInstructions: currentBotInstructions,
      }),
    });

    // Save keyword settings
    const keywordEnableAI = document.getElementById('instructionsKeywordEnableAI');
    const keywordEnableAIResponse = document.getElementById('instructionsKeywordEnableAIResponse');
    
    const keywordDisableAI = document.getElementById('instructionsKeywordDisableAI');
    const keywordDisableAIResponse = document.getElementById('instructionsKeywordDisableAIResponse');
    
    const keywordDisableFollowUp = document.getElementById('instructionsKeywordDisableFollowUp');
    const keywordDisableFollowUpResponse = document.getElementById('instructionsKeywordDisableFollowUpResponse');
    
    const keywordSettings = {
      enableAI: {
        keyword: keywordEnableAI?.value?.trim() || '',
        response: keywordEnableAIResponse?.value?.trim() || ''
      },
      disableAI: {
        keyword: keywordDisableAI?.value?.trim() || '',
        response: keywordDisableAIResponse?.value?.trim() || ''
      },
      disableFollowUp: {
        keyword: keywordDisableFollowUp?.value?.trim() || '',
        response: keywordDisableFollowUpResponse?.value?.trim() || ''
      }
    };

    const keywordsUrl =
      currentBotType === "facebook"
        ? `/api/facebook-bots/${currentBotId}/keywords`
        : `/api/line-bots/${currentBotId}/keywords`;

    const keywordsResponse = await fetch(keywordsUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keywordSettings }),
    });

    if (instructionsResponse.ok && keywordsResponse.ok) {
      showAlert("บันทึก instructions และ keyword settings เรียบร้อยแล้ว", "success");

      // Refresh bot list
      if (currentBotType === "facebook") {
        await loadFacebookBotSettings();
      } else {
        await loadLineBotSettings();
      }

      // Close modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("manageInstructionsModal"),
      );
      if (modal) {
        modal.hide();
        // Cleanup will be handled by the hidden.bs.modal event listener
      }
    } else {
      showAlert("ไม่สามารถบันทึกข้อมูลได้", "danger");
    }
  } catch (error) {
    console.error("Error saving instructions and keywords:", error);
    showAlert("เกิดข้อผิดพลาดในการบันทึกข้อมูล", "danger");
  }
}

// Load overview data
async function loadOverviewData() {
  try {
    // โหลดข้อมูล Line Bot
    const lineBotResponse = await fetch("/api/line-bots");
    if (lineBotResponse.ok) {
      const lineBots = await lineBotResponse.json();
      displayLineBotOverview(lineBots);
    }

    // โหลดข้อมูล Facebook Bot
    const facebookBotResponse = await fetch("/api/facebook-bots");
    if (facebookBotResponse.ok) {
      const facebookBots = await facebookBotResponse.json();
      displayFacebookBotOverview(facebookBots);
    }

    // โหลดข้อมูล AI Models
    displayAiModelOverview();

    // โหลดข้อมูล Instructions
    const instructionsResponse = await fetch("/api/instructions/library");
    if (instructionsResponse.ok) {
      const result = await instructionsResponse.json();
      displayInstructionsOverview(result.libraries || []);
    }

    // โหลดข้อมูลความปลอดภัย
    displaySecurityOverview();
  } catch (error) {
    console.error("Error loading overview data:", error);
  }
}

// Display Line Bot overview
function displayLineBotOverview(lineBots) {
  const container = document.getElementById("lineBotOverview");
  if (!container) {
    console.log("Line Bot Overview container not found");
    return;
  }

  const total = lineBots.length;
  const active = lineBots.filter((bot) => bot.status === "active").length;

  if (total === 0) {
    container.innerHTML = '<p class="text-muted mb-0">ยังไม่มี Line Bot</p>';
    return;
  }

  container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>Bot ทั้งหมด</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-success">${active}</h6>
                <small>Bot ที่ใช้งาน</small>
            </div>
        </div>
    `;
}

// Display Facebook Bot overview
function displayFacebookBotOverview(facebookBots) {
  const container = document.getElementById("facebookBotOverview");
  if (!container) {
    console.log("Facebook Bot Overview container not found");
    return;
  }

  const total = facebookBots.length;
  const active = facebookBots.filter((bot) => bot.status === "active").length;

  if (total === 0) {
    container.innerHTML =
      '<p class="text-muted mb-0">ยังไม่มี Facebook Bot</p>';
    return;
  }

  container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>เพจที่เชื่อมต่อ</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-primary">${active}</h6>
                <small>พร้อมตอบกลับ</small>
            </div>
        </div>
    `;
}

// Display AI Model overview
function displayAiModelOverview() {
  const container = document.getElementById("aiModelOverview");
  if (!container) {
    console.log("AI Model Overview container not found");
    return;
  }

  container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">7</h4>
                <small>Models ที่รองรับ</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-primary">GPT-5</h6>
                <small>Model หลัก</small>
            </div>
        </div>
    `;
}

// Display Instructions overview
function displayInstructionsOverview(libraries) {
  const container = document.getElementById("instructionsOverview");
  if (!container) {
    console.log("Instructions Overview container not found");
    return;
  }

  const total = libraries.length;

  if (total === 0) {
    container.innerHTML =
      '<p class="text-muted mb-0">ยังไม่มี Instructions</p>';
    return;
  }

  container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>คลัง Instructions</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-info">พร้อมใช้งาน</h6>
                <small>เลือกใช้ได้ทันที</small>
            </div>
        </div>
    `;

  // อัปเดตจำนวน Instructions ในแท็บ AI
  const instructionsCountElement = document.getElementById("instructionsCount");
  if (instructionsCountElement) {
    instructionsCountElement.textContent = total;
  }
}

// Display Security overview
function displaySecurityOverview() {
  const container = document.getElementById("securityOverview");
  if (!container) {
    console.log("Security Overview container not found");
    return;
  }

  container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">3</h4>
                <small>ฟีเจอร์ความปลอดภัย</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-warning">เปิดใช้งาน</h6>
                <small>ระบบป้องกัน</small>
            </div>
        </div>
    `;
}

// Export functions for use in other modules
window.instructionsManagement = {
  manageInstructions,
  manageFacebookInstructions,
  displayInstructionLibraries,
  displaySelectedInstructions,
  toggleLibrarySelection,
  removeLibrarySelection,
  saveSelectedInstructions,
  updateInstructionCounts,
  loadOverviewData,
  displayLineBotOverview,
  displayFacebookBotOverview,
  displayAiModelOverview,
  displayInstructionsOverview,
  displaySecurityOverview,
  convertLegacyLibraryToV2,
};
