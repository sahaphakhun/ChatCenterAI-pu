/* ===================================
   ERROR HANDLING SYSTEM
   ChatCenter AI - Centralized Error Management
   =================================== */

class ErrorHandler {
    constructor() {
        this.toastContainer = null;
        this.init();
    }
    
    init() {
        // สร้าง toast container
        this.createToastContainer();
        
        // จับ unhandled errors
        window.addEventListener('error', (event) => {
            console.error('Uncaught error:', event.error);
            this.showError('เกิดข้อผิดพลาดในระบบ กรุณารีเฟรชหน้าเว็บ');
        });
        
        // จับ unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.showError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        });
    }
    
    createToastContainer() {
        if (this.toastContainer && document.body.contains(this.toastContainer)) return;
        
        this.toastContainer = document.createElement('div');
        this.toastContainer.className = 'toast-container';
        this.toastContainer.id = 'errorToastContainer';
        document.body.appendChild(this.toastContainer);
    }
    
    /**
     * แสดง Toast Notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = this.createToast(message, type);
        this.toastContainer.appendChild(toast);
        
        // แสดง toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // ซ่อน toast
        setTimeout(() => {
            this.hideToast(toast);
        }, duration);
        
        return toast;
    }
    
    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const icon = icons[type] || icons.info;
        
        const iconWrap = document.createElement('div');
        iconWrap.className = 'toast-icon';

        const iconEl = document.createElement('i');
        iconEl.className = `fas ${icon}`;
        iconWrap.appendChild(iconEl);

        const messageEl = document.createElement('div');
        messageEl.className = 'toast-message';
        messageEl.textContent = message ?? '';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'ปิดการแจ้งเตือน');

        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeBtn.appendChild(closeIcon);

        closeBtn.addEventListener('click', () => toast.remove());

        toast.appendChild(iconWrap);
        toast.appendChild(messageEl);
        toast.appendChild(closeBtn);
        
        return toast;
    }
    
    hideToast(toast) {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }
    
    /**
     * แสดง Error
     */
    showError(message) {
        return this.showToast(message, 'error', 5000);
    }
    
    /**
     * แสดง Success
     */
    showSuccess(message) {
        return this.showToast(message, 'success', 3000);
    }
    
    /**
     * แสดง Warning
     */
    showWarning(message) {
        return this.showToast(message, 'warning', 4000);
    }
    
    /**
     * แสดง Info
     */
    showInfo(message) {
        return this.showToast(message, 'info', 3000);
    }
    
    /**
     * Handle API Errors
     */
    handleApiError(error, customMessage = null) {
        console.error('API Error:', error);
        
        let message = customMessage || 'เกิดข้อผิดพลาด';
        
        if (error.message) {
            // Parse error message
            if (error.message.includes('Failed to fetch')) {
                message = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
            } else if (error.message.includes('HTTP 401')) {
                message = 'คุณไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
            } else if (error.message.includes('HTTP 403')) {
                message = 'คุณไม่มีสิทธิ์ในการทำงานนี้';
            } else if (error.message.includes('HTTP 404')) {
                message = 'ไม่พบข้อมูลที่ต้องการ';
            } else if (error.message.includes('HTTP 500')) {
                message = 'เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่ภายหลัง';
            } else if (error.message.includes('timeout')) {
                message = 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง';
            }
        }
        
        this.showError(message);
        return message;
    }
    
    /**
     * Handle Network Errors
     */
    handleNetworkError() {
        this.showError('ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ');
    }
    
    /**
     * Handle Validation Errors
     */
    handleValidationError(field, message) {
        const fieldElement = document.querySelector(`[name="${field}"]`);
        if (fieldElement) {
            fieldElement.classList.add('is-invalid');
            
            // สร้าง error message
            let errorDiv = fieldElement.nextElementSibling;
            if (!errorDiv || !errorDiv.classList.contains('invalid-feedback')) {
                errorDiv = document.createElement('div');
                errorDiv.className = 'invalid-feedback';
                fieldElement.parentNode.insertBefore(errorDiv, fieldElement.nextSibling);
            }
            errorDiv.textContent = message;
        }
        
        this.showError(message);
    }
    
    /**
     * Clear Validation Errors
     */
    clearValidationErrors() {
        document.querySelectorAll('.is-invalid').forEach(el => {
            el.classList.remove('is-invalid');
        });
        document.querySelectorAll('.invalid-feedback').forEach(el => {
            el.remove();
        });
    }
    
    /**
     * Confirm Dialog
     */
    confirm(message, title = 'ยืนยันการทำงาน') {
        return new Promise((resolve) => {
            // สร้าง modal
            const modal = document.createElement('div');
            modal.className = 'confirm-modal';

            const overlay = document.createElement('div');
            overlay.className = 'confirm-modal-overlay';

            const content = document.createElement('div');
            content.className = 'confirm-modal-content';

            const titleEl = document.createElement('h5');
            titleEl.textContent = title ?? '';

            const bodyEl = document.createElement('p');
            bodyEl.textContent = message ?? '';

            const actions = document.createElement('div');
            actions.className = 'confirm-modal-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.type = 'button';
            cancelBtn.dataset.action = 'cancel';
            cancelBtn.textContent = 'ยกเลิก';

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn-primary';
            confirmBtn.type = 'button';
            confirmBtn.dataset.action = 'confirm';
            confirmBtn.textContent = 'ยืนยัน';

            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);

            content.appendChild(titleEl);
            content.appendChild(bodyEl);
            content.appendChild(actions);

            modal.appendChild(overlay);
            modal.appendChild(content);
            
            document.body.appendChild(modal);
            
            // แสดง modal
            setTimeout(() => modal.classList.add('show'), 10);
            
            // Handle actions
            modal.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (action) {
                    modal.classList.remove('show');
                    setTimeout(() => modal.remove(), 300);
                    resolve(action === 'confirm');
                }
            });
        });
    }
}

// Create global instance
window.errorHandler = new ErrorHandler();

// Convenience functions
window.showToast = (message, type, duration) => {
    return window.errorHandler.showToast(message, type, duration);
};

window.showError = (message) => {
    return window.errorHandler.showError(message);
};

window.showSuccess = (message) => {
    return window.errorHandler.showSuccess(message);
};

window.showWarning = (message) => {
    return window.errorHandler.showWarning(message);
};

window.showInfo = (message) => {
    return window.errorHandler.showInfo(message);
};

window.confirmAction = (message, title) => {
    return window.errorHandler.confirm(message, title);
};
