const API_BASE = 'https://checker-api-boj2.onrender.com';

const originalFetch = window.fetch.bind(window);

window.fetch = (url, options = {}) => {
  if (typeof url === 'string' && url.startsWith(API_BASE)) {
    options = { ...options, credentials: 'include' };
  }
  return originalFetch(url, options);
};

const groupList = document.querySelector('#groupList');
const studentList = document.querySelector('#studentList');
const createGroupForm = document.querySelector('#createGroupForm');
const newGroupName = document.querySelector('#newGroupName');

const groupTotalCount = document.querySelector('#groupTotalCount');
const allStudentsCount = document.querySelector('#allStudentsCount');
const ungroupedCount = document.querySelector('#ungroupedCount');
const enrollmentCount = document.querySelector('#enrollmentCount');
const rosterLabel = document.querySelector('#rosterLabel');

let groups = [];
let students = [];
let selectedGroup = 'all';

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char])
  );
}

async function checkTeacherAccess() {
  const response = await fetch(`${API_BASE}/api/me`);
  const result = await response.json();

  if (!result.user) {
    window.location.replace('auth.html');
    return false;
  }

  if (result.user.role !== 'teacher') {
    window.location.replace('index.html');
    return false;
  }

  const roleLabel = document.querySelector('#roleLabel');

  if (roleLabel) {
    roleLabel.textContent = 'Teacher';
  }

  const avatar = document.querySelector('#avatarInitials');

  if (avatar) {
    const initials = result.user.name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    avatar.textContent = initials || 'T';
  }

  return true;
}

async function loadData() {
  try {
    const [groupsResponse, studentsResponse] = await Promise.all([
      fetch(`${API_BASE}/api/groups`),
      fetch(`${API_BASE}/api/students`)
    ]);

    const groupsResult = await groupsResponse.json();
    const studentsResult = await studentsResponse.json();

    if (!groupsResponse.ok) {
      throw new Error(groupsResult.error || 'Could not load groups.');
    }

    if (!studentsResponse.ok) {
      throw new Error(studentsResult.error || 'Could not load students.');
    }

    groups = groupsResult.groups || [];
    students = studentsResult.students || [];

    renderGroups();
    renderStudents();
  } catch (error) {
    console.error('Teacher dashboard error:', error);

    studentList.innerHTML = `
      <p class="empty-note">
        ${escapeHtml(error.message || 'Could not load students.')}
      </p>
    `;
  }
}

function renderGroups() {
  const dynamicGroups = groupList.querySelectorAll(
    '.group-item[data-dynamic="true"]'
  );

  dynamicGroups.forEach(element => element.remove());

  groupTotalCount.textContent =
    `${groups.length} group${groups.length === 1 ? '' : 's'}`;

  allStudentsCount.textContent = students.length;

  const ungrouped = students.filter(student => !student.group_id);
  ungroupedCount.textContent = ungrouped.length;

  groups.forEach(group => {
    const count = students.filter(
      student => Number(student.group_id) === Number(group.id)
    ).length;

    const button = document.createElement('button');

    button.className = 'group-item';
    button.type = 'button';
    button.dataset.group = String(group.id);
    button.dataset.dynamic = 'true';

    button.innerHTML = `
      <span>${escapeHtml(group.name)}</span>
      <span class="group-count">${count}</span>
    `;

    groupList.appendChild(button);
  });

  updateActiveGroup();
}

function getVisibleStudents() {
  if (selectedGroup === 'all') {
    return students;
  }

  if (selectedGroup === 'none') {
    return students.filter(student => !student.group_id);
  }

  return students.filter(
    student => Number(student.group_id) === Number(selectedGroup)
  );
}

function renderStudents() {
  const visibleStudents = getVisibleStudents();

  enrollmentCount.textContent =
    `${visibleStudents.length} enrolled`;

  if (selectedGroup === 'all') {
    rosterLabel.textContent = 'All students';
  } else if (selectedGroup === 'none') {
    rosterLabel.textContent = 'Ungrouped';
  } else {
    const group = groups.find(
      item => Number(item.id) === Number(selectedGroup)
    );

    rosterLabel.textContent = group ? group.name : 'Students';
  }

  studentList.innerHTML = '';

  if (!visibleStudents.length) {
    studentList.innerHTML = `
      <p class="empty-note">
        No students in this group yet.
      </p>
    `;
    return;
  }

  visibleStudents.forEach(student => {
    const group = groups.find(
      item => Number(item.id) === Number(student.group_id)
    );

    const link = document.createElement('a');

    link.className = 'profile-row';
    link.href =
      `teacher-student.html?student_id=${encodeURIComponent(student.id)}`;

    link.innerHTML = `
      <div class="profile-avatar">
        ${escapeHtml(
          student.name
            .split(' ')
            .map(part => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        )}
      </div>

      <div class="profile-info">
        <strong>${escapeHtml(student.name)}</strong>
        <span>${escapeHtml(student.email)}</span>
      </div>

      <div class="profile-meta">
        ${escapeHtml(group ? group.name : 'Ungrouped')}
      </div>
    `;

    studentList.appendChild(link);
  });
}

function updateActiveGroup() {
  groupList.querySelectorAll('.group-item').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.group === String(selectedGroup)
    );
  });
}

groupList.addEventListener('click', event => {
  const button = event.target.closest('.group-item');

  if (!button) return;

  selectedGroup = button.dataset.group;

  updateActiveGroup();
  renderStudents();
});

createGroupForm.addEventListener('submit', async event => {
  event.preventDefault();

  const name = newGroupName.value.trim();

  if (!name) return;

  try {
    const response = await fetch(`${API_BASE}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Could not create group.');
    }

    newGroupName.value = '';

    await loadData();
  } catch (error) {
    console.error('Create group error:', error);
    alert(error.message || 'Could not create group.');
  }
});

document
  .querySelector('#logoutButton')
  ?.addEventListener('click', async () => {
    await fetch(`${API_BASE}/api/logout`, {
      method: 'POST'
    });

    window.location.replace('auth.html');
  });

async function initTeacherDashboard() {
  try {
    const allowed = await checkTeacherAccess();

    if (!allowed) return;

    await loadData();
  } catch (error) {
    console.error('Teacher initialization error:', error);
  }
}

initTeacherDashboard();