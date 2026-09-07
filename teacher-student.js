const API_BASE = 'https://checker-api-boj2.onrender.com';
const studentId = new URLSearchParams(window.location.search).get('id');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

document.querySelector('#logoutButton')?.addEventListener('click', async () => {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST' });
  window.location.replace('auth.html');
});

function attemptRowHtml(check) {
  const statusClass = check.status === 'Graded' ? 'status-graded' : 'status-checked';
  const gradeValue = check.teacher_grade === null || check.teacher_grade === undefined ? '' : check.teacher_grade;
  return `<div class="dashboard-card" style="margin-bottom: 14px;">
    <div class="card-topline">
      <div>
        <strong style="font-size:15px;">${escapeHtml(check.title || check.file_name)}</strong>
        <div class="attempt-meta">Attempt ${check.attempt_number} · submitted ${escapeHtml((check.created_at || '').slice(0, 10))} · file: ${escapeHtml(check.file_name)}</div>
      </div>
      <span class="status-pill ${statusClass}">${check.status}</span>
    </div>
    <div class="attempt-scores">
      <div class="attempt-score-block"><span>Check result</span><strong>${check.score}%</strong></div>
      <div class="attempt-score-block"><span>Current grade</span><strong>${check.teacher_grade === null || check.teacher_grade === undefined ? '—' : check.teacher_grade + '/100'}</strong></div>
    </div>
    <p class="result-summary">${escapeHtml(check.feedback)}</p>
    <form class="grade-form" data-check="${check.id}">
      <input type="number" min="0" max="100" placeholder="0-100" value="${gradeValue}" required />
      <button type="submit">Save grade</button>
      <span class="grade-hint">Grading this attempt shares it with the student as “Graded.”</span>
    </form>
  </div>`;
}

async function loadStudent() {
  if (!studentId) return window.location.replace('teacher.html');
  try {
    const meResponse = await fetch(`${API_BASE}/api/me`);
    const meResult = await meResponse.json();
    if (!meResult.user) return window.location.replace('auth.html');
    if (meResult.user.role !== 'teacher') return window.location.replace('index.html');
    const initials = meResult.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    document.querySelector('#avatarInitials').textContent = initials || 'T';

    const studentsResponse = await fetch(`${API_BASE}/api/students`);
    const studentsResult = await studentsResponse.json();
    const student = (studentsResult.students || []).find((candidate) => String(candidate.id) === String(studentId));
    if (!student) {
      document.querySelector('#studentName').textContent = 'Student not found';
      return;
    }
    const initialsStudent = student.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    document.querySelector('#studentAvatar').textContent = initialsStudent;
    document.querySelector('#studentName').textContent = student.name;
    document.querySelector('#studentMeta').textContent = `Student · ${student.email} · Joined ${(student.joined || '').slice(0, 10)}`;
    document.querySelector('#studentGroupBadge').textContent = student.group_name ? student.group_name : 'Ungrouped';

    const checksResponse = await fetch(`${API_BASE}/api/checks?student_id=${studentId}`);
    const checksResult = await checksResponse.json();
    const checks = checksResult.checks || [];
    document.querySelector('#attemptCount').textContent = `${checks.length} attempt${checks.length === 1 ? '' : 's'}`;
    const list = document.querySelector('#attemptsList');
    if (!checks.length) {
      list.innerHTML = '<p class="empty-note">This student has not submitted any attempts yet.</p>';
      return;
    }
    list.innerHTML = checks.map(attemptRowHtml).join('');
    list.querySelectorAll('.grade-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const checkId = form.dataset.check;
        const grade = form.querySelector('input').value;
        const response = await fetch(`${API_BASE}/api/checks/${checkId}/grade`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: Number(grade) }),
        });
        if (response.ok) loadStudent();
        else alert('Could not save this grade. Enter a whole number between 0 and 100.');
      });
    });
  } catch (error) {
    console.warn('Could not load this student.', error);
  }
}

loadStudent();
