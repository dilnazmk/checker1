import { useEffect, useState } from 'react';
import { api } from './api';
import { ErrorMessage, initials, PageTitle } from './components';

export default function Profile({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const teacher = user.role === 'teacher';
  useEffect(() => {
    (teacher ? Promise.all([api('/groups'), api('/students')]).then(([groups, students]) => ({ ...groups, ...students })) : api('/checks'))
      .then(setData).catch(error => setError(error.message));
  }, [teacher]);
  const graded = data?.checks?.filter(check => check.teacher_grade != null) || [];
  const stats = teacher ? [['Groups', data?.groups.length || 0], ['Students', data?.students.length || 0]] : [['Total attempts', data?.checks.length || 0], ['Graded', graded.length], ['Average grade', graded.length ? `${Math.round(graded.reduce((sum, check) => sum + check.teacher_grade, 0) / graded.length)}/100` : '—']];
  return <main className="page-main"><PageTitle eyebrow={`${user.role} profile`} title="Your" emphasis="progress." /><div className="profile-row"><div className="profile-avatar">{initials(user.name)}</div><div className="profile-info"><strong>{user.name}</strong><span>{user.email}</span></div></div><ErrorMessage error={error} />{!data ? <p role="status">Loading profile…</p> : <><div className="attempts-grid section-spacing">{stats.map(([label, value]) => <div className="dashboard-card attempt-score-block" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><section className="dashboard-card section-spacing"><div className="card-topline"><span className="section-label">{teacher ? 'Your groups' : 'Submission history'}</span><span>{teacher ? `${data.groups.length} groups` : `${data.checks.length} submissions`}</span></div>{teacher ? data.groups.length ? data.groups.map(group => <div className="group-item" key={group.id}><span>{group.name}</span><span className="group-count">{group.student_count} students</span></div>) : <p className="empty-note">Create your first group from the Students page.</p> : data.checks.length ? <div className="history-scroll"><table className="history-table"><thead><tr><th>Assignment</th><th>Submitted</th><th>Check result</th><th>Grade</th><th>Status</th></tr></thead><tbody>{data.checks.map(check => <tr key={check.id}><td><strong>{check.title || check.file_name}</strong><br /><small>Attempt {check.attempt_number} · {check.file_name}</small></td><td>{check.created_at?.slice(0, 10)}</td><td>{check.score}%</td><td>{check.teacher_grade == null ? '—' : `${check.teacher_grade}/100`}</td><td><span className={`status-pill ${check.status === 'Graded' ? 'status-graded' : 'status-checked'}`}>{check.status}</span></td></tr>)}</tbody></table></div> : <p className="empty-note">You have not submitted any assignments yet.</p>}</section></>}</main>;
}
