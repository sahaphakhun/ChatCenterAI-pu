document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('adminLoginForm');
  const passcodeInput = document.getElementById('adminPasscode');
  const submitBtn = document.getElementById('loginSubmitBtn');
  const errorBox = document.getElementById('loginErrorBox');
  const defaultLabel = submitBtn.querySelector('.default-label');
  const loadingLabel = submitBtn.querySelector('.loading-label');

  function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
      defaultLabel.classList.add('d-none');
      loadingLabel.classList.remove('d-none');
    } else {
      defaultLabel.classList.remove('d-none');
      loadingLabel.classList.add('d-none');
    }
  }

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('d-none');
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.classList.add('d-none');
    errorBox.textContent = '';
  }

  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const passcode = (passcodeInput.value || '').trim();
    if (!passcode) {
      showError('กรุณากรอกรหัสผ่าน');
      passcodeInput.focus();
      return;
    }

    setLoadingState(true);

    try {
      const response = await fetch('/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passcode }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          payload && payload.error
            ? payload.error
            : 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่';
        showError(message);
        setLoadingState(false);
        passcodeInput.focus();
        passcodeInput.select();
        return;
      }

      window.location.href = '/admin/dashboard';
    } catch (error) {
      console.error('[Auth] login error:', error);
      showError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
      setLoadingState(false);
    }
  });
});
