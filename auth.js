const form = document.querySelector('#registerForm');
const errorMessage = document.querySelector('#formError');
const successPanel = document.querySelector('#registerSuccess');
const emailPattern = /^[^\s@]+@sdu\.edu\.kz$/i;
const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.querySelector('#registerName').value.trim();
  const email = document.querySelector('#registerEmail').value.trim().toLowerCase();
  const password = document.querySelector('#registerPassword').value;
  errorMessage.hidden = true;
  if (!name || !email || !password) return showError('Please fill in every field.');
  if (!emailPattern.test(email)) return showError('Use your official SDU email ending in @sdu.edu.kz.');
  if (password.length < 8) return showError('Your password must contain at least 8 characters.');
  try {
    const response = await fetch(`${API_BASE}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    const result = await response.json();
    if (!response.ok) return showError(result.error || 'Registration failed.');
    localStorage.setItem('checker:student', JSON.stringify(result.user));
    document.querySelector('#successName').textContent = name;
    form.hidden = true;
    successPanel.hidden = false;
  } catch (error) {
    showError('The server is not running. Start it with: python3 server.py');
  }
});

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}
