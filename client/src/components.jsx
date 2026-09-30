import { useState } from 'react';
import { api } from './api';

export const initials = name => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
export function ErrorMessage({ error }) { return error ? <p className="form-error" role="alert">{error}</p> : null; }
export function PageTitle({ eyebrow, title, emphasis, children }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}<br /><em>{emphasis}</em></h1>{children && <p className="page-lede">{children}</p>}</div></div>;
}
export function AttemptCard({ check, grading = false, onUpdate }) {
  const [grade, setGrade] = useState(check.teacher_grade ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/checks/${check.id}/grade`, { grade: Number(grade) }); await onUpdate(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <article className="dashboard-card attempt-card">
    <div className="attempt-card-top"><h3 className="attempt-title">{check.title || check.file_name}</h3><span className="attempt-tag">Attempt {check.attempt_number}</span></div>
    <p className="attempt-meta">Submitted {check.created_at?.slice(0, 10)} · {check.file_name}</p>
    <div className="attempt-scores"><div className="attempt-score-block"><span>Check result</span><strong>{check.score}%</strong></div><div className="attempt-score-block"><span>Teacher grade</span><strong>{check.teacher_grade == null ? '—' : `${check.teacher_grade}/100`}</strong></div></div>
    <span className={`status-pill ${check.status === 'Graded' ? 'status-graded' : 'status-checked'}`}>{check.status}</span>
    {grading && <><p className="result-summary">{check.feedback}</p><form className="grade-form" onSubmit={save}><input aria-label={`Grade for ${check.title}, attempt ${check.attempt_number}`} type="number" min="0" max="100" step="1" required value={grade} onChange={event => setGrade(event.target.value)} /><button disabled={busy}>{busy ? 'Saving…' : 'Save grade'}</button></form><ErrorMessage error={error} /></>}
  </article>;
}
