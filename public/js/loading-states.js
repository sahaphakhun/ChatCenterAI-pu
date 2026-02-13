/* ===================================
   LOADING STATES SYSTEM
   ChatCenter AI - Loading & Skeleton Components
   =================================== */

class LoadingStateManager {
    /**
     * 1. Inline Spinner
     */
    static createSpinner(size = 'md', color = 'primary') {
        const sizes = {
            sm: '16px',
            md: '24px',
            lg: '32px',
            xl: '48px'
        };
        
        const colors = {
            primary: '#68B984',
            white: '#ffffff',
            secondary: '#6C757D',
            success: '#68B984',
            danger: '#FF6868'
        };
        
        return `
            <div class="loading-spinner loading-spinner-${size}" 
                 style="--spinner-size: ${sizes[size]}; --spinner-color: ${colors[color] || colors.primary};">
                <svg viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
            </div>
        `;
    }
    
    /**
     * 2. Skeleton Loading
     */
    static createSkeleton(type = 'text', count = 1) {
        const skeletons = {
            text: `<div class="skeleton skeleton-text"></div>`,
            title: `<div class="skeleton skeleton-title"></div>`,
            avatar: `<div class="skeleton skeleton-avatar"></div>`,
            image: `<div class="skeleton skeleton-image"></div>`,
            card: `
                <div class="skeleton-card">
                    <div class="skeleton skeleton-image"></div>
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width: 60%;"></div>
                </div>
            `,
            userItem: `
                <div class="skeleton-user-item">
                    <div class="skeleton skeleton-avatar"></div>
                    <div class="skeleton-user-details">
                        <div class="skeleton skeleton-text" style="width: 70%; margin-bottom: 8px;"></div>
                        <div class="skeleton skeleton-text" style="width: 90%;"></div>
                    </div>
                </div>
            `,
            message: `
                <div class="skeleton-message">
                    <div class="skeleton skeleton-avatar"></div>
                    <div class="skeleton-message-content">
                        <div class="skeleton skeleton-text" style="width: 80%;"></div>
                        <div class="skeleton skeleton-text" style="width: 60%;"></div>
                    </div>
                </div>
            `
        };
        
        return Array(count).fill(skeletons[type] || skeletons.text).join('');
    }
    
    /**
     * 3. Progress Bar
     */
    static createProgressBar(current, total, label = '') {
        const percent = Math.min(100, Math.round((current / total) * 100));
        
        return `
            <div class="progress-container">
                ${label ? `<div class="progress-label">${label}</div>` : ''}
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" style="width: ${percent}%">
                        <span class="progress-text">${percent}%</span>
                    </div>
                </div>
                <div class="progress-info">
                    <span>${current} / ${total}</span>
                </div>
            </div>
        `;
    }
    
    /**
     * 4. Loading Overlay
     */
    static showOverlay(container, message = 'กำลังโหลด...', cancellable = false) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-overlay-content">
                ${this.createSpinner('lg')}
                <p class="loading-message">${message}</p>
                ${cancellable ? '<button class="btn btn-sm btn-outline-secondary mt-3" onclick="this.closest(\'.loading-overlay\').remove()">ยกเลิก</button>' : ''}
            </div>
        `;
        
        const targetContainer = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        if (targetContainer) {
            targetContainer.style.position = 'relative';
            targetContainer.appendChild(overlay);
        }
        
        return overlay;
    }
    
    static hideOverlay(container) {
        const targetContainer = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
            
        if (!targetContainer) return;
        
        const overlay = targetContainer.querySelector('.loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    }
    
    /**
     * 5. Button Loading State
     */
    static setButtonLoading(button, loading = true, text = '') {
        if (!button) return;
        
        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.classList.add('loading');
            button.innerHTML = `
                ${this.createSpinner('sm', 'white')}
                <span class="ms-2">${text || 'กำลังดำเนินการ...'}</span>
            `;
        } else {
            button.disabled = false;
            button.classList.remove('loading');
            button.innerHTML = button.dataset.originalText || text;
        }
    }
    
    /**
     * 6. Dots Animation
     */
    static createDotsAnimation() {
        return `
            <span class="loading-dots">
                <span>.</span><span>.</span><span>.</span>
            </span>
        `;
    }
    
    /**
     * 7. Empty State
     */
    static createEmptyState(config = {}) {
        const {
            icon = 'fas fa-inbox',
            title = 'ไม่มีข้อมูล',
            message = '',
            actionText = '',
            actionCallback = null
        } = config;
        
        return `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="${icon}"></i>
                </div>
                <h5>${title}</h5>
                ${message ? `<p>${message}</p>` : ''}
                ${actionText ? `<button class="btn btn-primary" onclick="${actionCallback}">${actionText}</button>` : ''}
            </div>
        `;
    }
    
    /**
     * 8. Error State
     */
    static createErrorState(message = 'เกิดข้อผิดพลาด', retryCallback = null) {
        return `
            <div class="error-state">
                <div class="error-icon">
                    <i class="fas fa-exclamation-circle text-danger"></i>
                </div>
                <h5>เกิดข้อผิดพลาด</h5>
                <p>${message}</p>
                ${retryCallback ? `<button class="btn btn-primary" onclick="${retryCallback}">ลองใหม่อีกครั้ง</button>` : ''}
            </div>
        `;
    }
}

// Export
window.LoadingStateManager = LoadingStateManager;

console.log('✅ Loading state manager loaded');

