const API_BASE = 'https://checker-api-boj2.onrender.com';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

document.querySelector('#logoutButton')?.addEventListener('click', async () => {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST' });
  window.location.replace('auth.html');
});

async function loadTeacherProfile() {
  try {
    const meResponse = await fetch(`${API_BASE}/api/me`);
    const meResult = await meResponse.json();
    if (!meResult.user) return window.location.replace('auth.html');
    if (meResult.user.role !== 'teacher') return window.location.replace('index.html');
    const user = meResult.user;
    const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    document.querySelector('#teacherName').textContent = user.name;
    document.querySelector('#teacherAvatar').textContent = initials || 'T';
    document.querySelector('#avatarInitials').textContent = initials || 'T';
    document.querySelector('#teacherEmail').textContent = user.email;

    const [groupsResponse, studentsResponse] = await Promise.all([
      fetch(`${API_BASE}/api/groups`),
      fetch(`${API_BASE}/api/students`),
    ]);
    const groupsResult = await groupsResponse.json();
    const studentsResult = await studentsResponse.json();
    const groups = groupsResult.groups || [];
    const students = studentsResult.students || [];
    document.querySelector('#groupCount').textContent = groups.length;
    document.querySelector('#studentCount').textContent = students.length;

    const list = document.querySelector('#groupsSummaryList');
    if (!groups.length) {
      list.innerHTML = '<p class="empty-note">You have not created any groups yet. Create one from the Students page.</p>';
      return;
    }
    list.innerHTML = groups.map((group) => `<div class="group-item" style="cursor:default;"><span>${escapeHtml(group.name)}</span><span class="group-count">${group.student_count} students</span></div>`).join('');
  } catch (error) {
    console.warn('Could not load teacher profile.', error);
  }
}

loadTeacherProfile();
