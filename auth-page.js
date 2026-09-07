const API_BASE = 'https://checker-api-boj2.onrender.com';
const loginForm = document.querySelector('#loginForm');
const signupForm = document.querySelector('#signupForm');
const tabs = document.querySelectorAll('.auth-tab');
document.querySelector('#signupForm small').textContent = 'Students use a numeric email ID. Teachers use a name-based SDU email.';
document.querySelector('.auth-note').textContent = 'Numeric SDU emails become Students. Name-based SDU emails become Teachers.';
const forgotLink = document.createElement('a');
forgotLink.href = 'forgot.html';
forgotLink.className = 'forgot-link';
forgotLink.textContent = 'Forgot password?';
loginForm.append(forgotLink);

async function redirectIfSignedIn() {
  try {
    const response = await fetch(`${API_BASE}/api/me`);
    const result = await response.json();
    if (result.user) window.location.replace(result.user.role === 'teacher' ? 'teacher.html' : 'index.html');
  } catch (error) { console.warn('Auth server unavailable.', error); }
}

function showError(id, message) {
  const element = document.querySelector(id);
  element.textContent = message;
  element.hidden = false;
}

tabs.forEach((tab) => tab.addEventListener('click', () => {
  const signup = tab.dataset.authMode === 'signup';
  tabs.forEach((item) => item.classList.toggle('active', item === tab));
  loginForm.hidden = signup;
  signupForm.hidden = !signup;
}));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  document.querySelector('#loginError').hidden = true;
  try {
    const response = await fetch(`${API_BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value }) });
    const result = await response.json();
    if (!response.ok) return showError('#loginError', result.error || 'Could not log in.');
    window.location.replace(result.user.role === 'teacher' ? 'teacher.html' : 'index.html');
  } catch (error) { showError('#loginError', 'The server is not running. Start it with: python3 server.py'); }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  document.querySelector('#signupError').hidden = true;
  try {
    const response = await fetch(`${API_BASE}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: signupName.value.trim(), email: signupEmail.value.trim(), password: signupPassword.value }) });
    const result = await response.json();
    if (!response.ok) return showError('#signupError', result.error || 'Could not create account.');
    window.location.replace('index.html');
  } catch (error) { showError('#signupError', 'The server is not running. Start it with: python3 server.py'); }
});

redirectIfSignedIn();
