const API_BASE = 'https://checker-api-boj2.onrender.com';
const originalFetch = window.fetch.bind(window);

window.fetch = (url, options = {}) => {
  if (typeof url === 'string' && url.startsWith(API_BASE)) {
    options = { ...options, credentials: 'include' };
  }
  return originalFetch(url, options);
};
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function historyRowHtml(check) {
  const date = (check.created_at || '').slice(0, 10);
  const scoreClass = check.score < 30 ? 'low' : check.score < 60 ? 'medium' : 'high';
  const gradeDisplay = check.teacher_grade === null || check.teacher_grade === undefined ? '—' : `${check.teacher_grade}/100`;
  return `<div class="history-row">
    <span><strong>${escapeHtml(check.title || check.file_name)}</strong><br><small style="color:var(--muted-soft)">Attempt ${check.attempt_number} · ${escapeHtml(check.file_name)}</small></span>
    <span>${date}</span>
    <strong class="${scoreClass}">${check.score}%</strong>
    <span>${gradeDisplay}</span>
    <span class="status-pill ${check.status === 'Graded' ? 'status-graded' : 'status-checked'}">${check.status}</span>
  </div>`;
}

async function loadProfile() {
  try {
    const meResponse = await fetch(`${API_BASE}/api/me`);
    const meResult = await meResponse.json();
    if (!meResult.user) return window.location.replace('auth.html');
    if (meResult.user.role === 'teacher') return window.location.replace('teacher-profile.html');
    const user = meResult.user;
    const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    document.querySelector('#profileName').textContent = user.name;
    document.querySelector('#profileMeta').textContent = `Student · ${user.email}`;
    document.querySelector('#profileAvatar').textContent = initials || 'S';
    document.querySelector('#avatarInitials').textContent = initials || 'S';

    const checksResponse = await fetch(`${API_BASE}/api/checks`);
    const checksResult = await checksResponse.json();
    const checks = checksResult.checks || [];
    const rows = document.querySelector('#historyRows');
    document.querySelector('#historyCount').textContent = `${checks.length} submission${checks.length === 1 ? '' : 's'}`;
    document.querySelector('#summaryCount').textContent = `${checks.length} submission${checks.length === 1 ? '' : 's'}`;
    document.querySelector('#totalAttempts').textContent = checks.length;
    const graded = checks.filter((check) => check.status === 'Graded');
    document.querySelector('#gradedCount').textContent = graded.length;
    const average = graded.length ? Math.round(graded.reduce((sum, check) => sum + Number(check.teacher_grade), 0) / graded.length) : null;
    document.querySelector('#averageGrade').textContent = average === null ? '—' : `${average}/100`;

    if (!checks.length) {
      rows.innerHTML = '<p class="empty-note">You have not submitted any assignments yet.</p>';
      return;
    }
    rows.innerHTML = checks.map(historyRowHtml).join('');
  } catch (error) {
    console.warn('Could not load your profile.', error);
    window.location.replace('auth.html');
  }
}

document.querySelector('#logoutButton')?.addEventListener('click', async () => {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST' });
  window.location.replace('auth.html');
});

loadProfile();
