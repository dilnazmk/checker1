import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from './api';
import { AttemptCard, ErrorMessage, initials, PageTitle } from './components';

export function Teacher() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('all');
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function reload() { const [students, groups] = await Promise.all([api('/students'), api('/groups')]); setData({ ...students, ...groups }); }
  useEffect(() => { reload().catch(error => setError(error.message)); }, []);
  async function save(event, renaming = false) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(renaming ? `/groups/${selected}/rename` : '/groups', { name: renaming ? rename : name }); setName(''); await reload(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  const students = data?.students || [];
  const groups = data?.groups || [];
  const group = groups.find(group => String(group.id) === selected);
  const visible = students.filter(student => selected === 'all' || (selected === 'none' ? !student.group_id : String(student.group_id) === selected));
  function choose(value) { setSelected(value); setRename(groups.find(group => String(group.id) === value)?.name || ''); }
  return <main className="page-main"><PageTitle eyebrow="Teacher workspace / 01" title="Your" emphasis="students.">Organize students into groups and review their submitted attempts.</PageTitle><ErrorMessage error={error} />{!data ? <p role="status">Loading students…</p> : <section className="students-layout"><aside className="sidebar-panel group-panel"><div className="card-topline"><span className="section-label">Groups</span><span>{groups.length} groups</span></div><div className="group-list">{[{ id: 'all', name: 'All students', student_count: students.length }, { id: 'none', name: 'Ungrouped', student_count: students.filter(student => !student.group_id).length }, ...groups].map(group => <button key={group.id} className={`group-item ${selected === String(group.id) ? 'active' : ''}`} onClick={() => choose(String(group.id))}><span>{group.name}</span><span className="group-count">{group.student_count}</span></button>)}</div><form className="add-group-form" onSubmit={save}><input aria-label="New group name" placeholder="New group name" required maxLength="250" value={name} onChange={event => setName(event.target.value)} /><button disabled={busy} aria-label="Create group">+</button></form></aside><section className="dashboard-card roster-card"><div className="card-topline"><span className="section-label">{group?.name || (selected === 'none' ? 'Ungrouped' : 'All students')}</span><span>{visible.length} enrolled</span></div>{group && <form className="add-group-form" onSubmit={event => save(event, true)}><input aria-label="Rename group" value={rename} onChange={event => setRename(event.target.value)} maxLength="250" required /><button disabled={busy}>Rename</button></form>}<div className="profile-list">{visible.map(student => <Link className="profile-row" key={student.id} to={`/teacher/students/${student.id}`}><div className="profile-avatar">{initials(student.name)}</div><div className="profile-info"><strong>{student.name}</strong><span>{student.email}</span></div><div className="profile-meta">{student.group_name || 'Ungrouped'}</div></Link>)}{!visible.length && <p className="empty-note">No students in this group yet.</p>}</div></section></section>}</main>;
}

export function TeacherStudent() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [group, setGroup] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function reload() {
    const [roster, groups, checks] = await Promise.all([api('/students'), api('/groups'), api(`/checks?student_id=${encodeURIComponent(id)}`)]);
    const student = roster.students.find(student => String(student.id) === id);
    setData({ student, ...groups, ...checks }); setGroup(student?.group_id == null ? '' : String(student.group_id));
  }
  useEffect(() => { reload().catch(error => setError(error.message)); }, [id]);
  async function assign(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(group ? `/groups/${group}/students` : `/students/${id}/ungroup`, { student_id: Number(id) }); await reload(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <main className="page-main"><Link className="text-button" to="/teacher">← All students</Link><ErrorMessage error={error} />{!data ? <p role="status">Loading student…</p> : !data.student ? <h1>Student not found</h1> : <><PageTitle eyebrow="Student profile" title={data.student.name} emphasis="Submitted work.">{data.student.email} · Joined {data.student.joined?.slice(0, 10)}</PageTitle><section className="dashboard-card"><span className="section-label">{data.student.group_name || 'Ungrouped'}</span><form className="grade-form" onSubmit={assign}><select aria-label="Student group" value={group} onChange={event => setGroup(event.target.value)}><option value="">Ungrouped</option>{data.student.group_id && !data.groups.some(group => String(group.id) === String(data.student.group_id)) && <option value={data.student.group_id} disabled>{data.student.group_name} (another teacher)</option>}{data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button disabled={busy}>Save group</button></form></section><div className="card-topline section-spacing"><span className="section-label">Submitted attempts</span><span>{data.checks.length} attempts</span></div><div className="attempt-list">{data.checks.map(check => <AttemptCard check={check} key={check.id} grading onUpdate={reload} />)}{!data.checks.length && <p className="empty-note">This student has not submitted any attempts yet.</p>}</div></>}</main>;
}
