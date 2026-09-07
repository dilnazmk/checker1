const API_BASE = 'https://checker-api-boj2.onrender.com';
const originalFetch = window.fetch.bind(window);

window.fetch = (url, options = {}) => {
  if (typeof url === 'string' && url.startsWith(API_BASE)) {
    options = { ...options, credentials: 'include' };
  }
  return originalFetch(url, options);
};
const forgotForm = document.querySelector('#forgotForm');
const resetForm = document.querySelector('#resetForm');
const error = document.querySelector('#forgotError, #resetError');

const forgotLink = document.createElement('a');
forgotLink.href = 'forgot.html';
forgotLink.className = 'forgot-link';
forgotLink.textContent = 'Forgot password?';
document.querySelector('#loginForm')?.append(forgotLink);

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

forgotForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  try {
    const response = await fetch(`${API_BASE}/api/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: forgotEmail.value.trim() }) });
    const result = await response.json();
    if (!response.ok) return showError(result.error || 'Could not send reset link.');
    forgotForm.hidden = true;
    document.querySelector('#forgotResult').hidden = false;
    if (result.development_reset_url) {
      const link = document.querySelector('#devResetLink');
      link.href = result.development_reset_url;
      link.hidden = false;
    }
  } catch (requestError) { showError('The server is not running. Start it with: python3 server.py'); }
});

resetForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  if (resetPassword.value !== resetConfirm.value) return showError('Passwords do not match.');
  try {
    const response = await fetch(`${API_BASE}/api/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: new URLSearchParams(window.location.search).get('token'), password: resetPassword.value }) });
    const result = await response.json();
    if (!response.ok) return showError(result.error || 'Could not update password.');
    resetForm.hidden = true;
    document.querySelector('#resetResult').hidden = false;
  } catch (requestError) { showError('The server is not running. Start it with: python3 server.py'); }
});
