import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AttemptCard, ErrorMessage } from './components';
import { feedbackFor } from '../../shared/feedback';

export default function Assignments() {
  const [checks, setChecks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  async function reload() { const data = await api('/checks'); setChecks(data.checks); setLoaded(true); }
  useEffect(() => { reload().catch(error => setError(error.message)); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function selectFile(value) {
    if (busy) return;
    if (!value) return;
    if (!/^image\/(png|jpeg|webp|gif|heic|heif)$/.test(value.type)) return setError('Choose a JPG, PNG, WebP, GIF, or HEIC image.');
    if (value.size > 10 * 1024 * 1024) return setError('The image must be at most 10 MB.');
    setFile(value); setError(''); setResult(null); setSaved(false);
  }
  function reset() { setFile(null); setTitle(''); setResult(null); setSaved(false); setError(''); if (input.current) input.current.value = ''; }
  async function saveAnalysis(analysis) {
    await api('/checks', { title: title.trim(), file_name: file.name, analysis_id: analysis.analysis_id });
    setSaved(true);
    await reload();
  }
  async function submit(event) {
    event.preventDefault();
    if (!file || !title.trim()) return setError('Enter an assignment title and choose an image.');
    setBusy(true); setError('');
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file);
      });
      const analysis = await api('/ocr', { image_data: image });
      setResult(analysis); setSaved(false);
      await saveAnalysis(analysis);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function retrySave() {
    setBusy(true); setError('');
    try { await saveAnalysis(result); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  const feedback = result ? feedbackFor(result.score, result.chunks) : null;
  return <main><section className="intro"><div><p className="eyebrow">Assignment checker / 01</p><h1>Check your<br /><em>practical assignment.</em></h1></div><p className="intro-copy">Upload each attempt, see your check result, and track the grade your teacher assigns.</p></section>
    <ErrorMessage error={error} />
    <section className="attempts-section"><div className="card-topline"><span className="section-label">Your assignments</span><span className="count-label">{loaded ? `${checks.length} attempts` : 'Loading…'}</span></div><div className="attempts-grid"><div className="dashboard-card attempt-card new-attempt-card"><button className="new-attempt-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><span>+</span> New attempt</button></div>{checks.map(check => <AttemptCard key={check.id} check={check} />)}{loaded && !checks.length && <p className="empty-note">You have not submitted any attempts yet.</p>}</div></section>
    {open && <section className="workspace" aria-label="Assignment checker"><form className="upload-panel" onSubmit={submit}><div className="panel-heading"><div><p className="section-label">New attempt</p><h2>Submit your practical work</h2></div><span className="step-count">01 / 01</span></div>
      <div className="assignment-title-field"><label htmlFor="title">Assignment / practical work title</label><input id="title" required maxLength="250" value={title} onChange={event => setTitle(event.target.value)} disabled={busy || !!result} placeholder="e.g. Practical Work #1 – HTML Basics" /></div>
      <label className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif" disabled={busy} onChange={event => selectFile(event.target.files[0])} aria-label="Assignment image" />
        <div className="drop-art" aria-hidden="true"><span className="paper paper-back" /><span className="paper paper-front"><span className="paper-line" /><span className="paper-line short" /><span className="paper-line" /></span><span className="upload-arrow">↑</span></div><div className="drop-copy"><strong>Choose a photo or drag it here</strong><span>JPG, PNG, WebP, GIF, or HEIC · up to 10 MB</span></div><span className="browse-link">Browse files ↗</span>
      </label>
      <p className="privacy-note">Images are processed by Cloudflare AI. Your check result is saved for teacher review.</p>
      {file && <div className="selected-file"><img className="file-preview" src={preview} alt="Selected assignment" /><div className="file-details"><span className="file-name">{file.name}</span><span className="file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div><button className="remove-file" type="button" onClick={reset} disabled={busy} aria-label="Remove selected file">×</button></div>}
      <button className="analyze-button" disabled={busy || !file || !!result}><span>{busy ? 'Checking and saving…' : 'Check my assignment'}</span><span>↗</span></button>
    </form><aside className="insight-panel"><div className="insight-topline"><span className="section-label">Check result</span><span className="live-pill">Visible to your teacher</span></div>
      {busy && !result ? <div className="loading-state" role="status"><div className="loading-ring" /><p className="loading-label">Reading your assignment…</p><span className="loading-subtext">Looking for patterns and signals</span></div> : result ? <div className="result-state"><div className="score-row"><strong>{result.score}</strong><span>%</span></div><div className="score-track"><span style={{ width: `${result.score}%` }} /></div><h3>{feedback.verdict}</h3><p className="result-summary">{feedback.summary}</p><div className="feedback-list">{feedback.items.map((item, index) => <div className="feedback-item" key={index}><span className={`feedback-icon ${item.icon}`}>{item.symbol}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div><p role="status">{saved ? 'Saved to your assignments.' : 'This result has not been saved yet.'}</p>{!saved && <button className="text-button" onClick={retrySave} disabled={busy}>Retry saving result ↗</button>}<button className="text-button" disabled={busy} onClick={reset}>Check another attempt ↗</button></div> : <div className="empty-state"><div className="orbit" aria-hidden="true"><span /><span /><span /></div><h3>Your result<br /><em>will land here.</em></h3><p>We’ll look at your submission for writing patterns, phrasing, and consistency.</p></div>}
    </aside></section>}
    <section className="bottom-note"><span className="note-line" /><p><strong>A helpful signal, not a final grade.</strong> Your teacher reviews the attempt and assigns the final grade.</p></section>
  </main>;
}
