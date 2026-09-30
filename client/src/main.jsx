import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import Auth from './Auth';
import Assignments from './Assignments';
import Profile from './Profile';
import { Teacher, TeacherStudent } from './Teacher';
import { ErrorMessage, initials } from './components';
import './styles.css';

function LegacyRoute() {
  const { pathname, search } = useLocation();
  const routes = { '/index.html': '/', '/auth.html': '/auth', '/register.html': '/register', '/forgot.html': '/forgot', '/reset.html': '/reset', '/profile.html': '/profile', '/teacher.html': '/teacher', '/teacher-profile.html': '/teacher/profile' };
  if (pathname === '/teacher-student.html') return <Navigate to={`/teacher/students/${encodeURIComponent(new URLSearchParams(search).get('id') || '')}`} replace />;
  return routes[pathname] ? <Navigate to={routes[pathname] + search} replace /> : <main className="page-main"><h1>Page not found</h1><Link to="/">Back home</Link></main>;
}
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  async function load() {
    setLoading(true); setError('');
    try { setUser((await api('/me')).user); } catch (error) { setError(error.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => { document.body.classList.toggle('teacher-shell', user?.role === 'teacher'); }, [user]);
  async function logout() {
    setBusy(true); setError('');
    try { await api('/logout', {}); setUser(null); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  if (loading) return <div className="app-shell"><p className="page-main" role="status">Loading your workspace…</p></div>;
  const teacher = user?.role === 'teacher';
  const guard = (role, content) => !user ? <Navigate to="/auth" replace /> : user.role !== role ? <Navigate to={teacher ? '/teacher' : '/'} replace /> : content;
  return <div className="app-shell page-shell"><header className="topbar">{user ? <><nav className="site-nav" aria-label="Main navigation"><NavLink to={teacher ? '/teacher' : '/'} end>{teacher ? 'Students' : 'Assignments'}</NavLink><NavLink to={teacher ? '/teacher/profile' : '/profile'}>Profile</NavLink></nav><div className="header-meta"><span className="status-dot" /><span>{teacher ? 'Teacher' : 'Student'}</span><button className="register-link logout-button" onClick={logout} disabled={busy}>Log out ↗</button><Link className="avatar" to={teacher ? '/teacher/profile' : '/profile'} aria-label="Open profile">{initials(user.name)}</Link></div></> : <Link className="brand" to="/auth">Assignment Checker</Link>}</header>
    <ErrorMessage error={error} />{error && !user && <button className="text-button" onClick={load}>Retry connection</button>}
    <Routes><Route path="/" element={guard('student', <Assignments />)} /><Route path="/profile" element={!user ? <Navigate to="/auth" replace /> : teacher ? <Navigate to="/teacher/profile" replace /> : <Profile user={user} />} /><Route path="/teacher" element={guard('teacher', <Teacher />)} /><Route path="/teacher/profile" element={guard('teacher', user && <Profile user={user} />)} /><Route path="/teacher/students/:id" element={guard('teacher', <TeacherStudent />)} />{['/auth', '/register', '/forgot', '/reset'].map(path => <Route key={path} path={path} element={<Auth key={location.pathname} user={user} onLogin={setUser} />} />)}<Route path="*" element={<LegacyRoute />} /></Routes>
    <footer><span>© 2026</span><span>Academic assignment checker</span><span>{teacher ? 'Teacher workspace' : 'SDU'}</span></footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
