import express from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { analyzeImage } from './analysis.js';
import { fail, requiredText, numericId } from './errors.js';
import { now, expires, token, hashToken, roleFor, publicUser, passwordFields, matchesPassword, cookieOptions, createSession, sendResetEmail } from './auth.js';
import { feedbackFor } from '../shared/feedback.js';

export async function createApp({ db, env = process.env, analyze = data => analyzeImage(data, env), mail = (email, url) => sendResetEmail(email, url, env), limit = true, dist = path.resolve('dist') }) {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', Number(env.TRUST_PROXY));
  await db.query(`CREATE TABLE IF NOT EXISTS analysis_results (id TEXT PRIMARY KEY, student_id ${env.DATABASE_URL ? 'BIGINT' : 'INTEGER'} NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score INTEGER NOT NULL, feedback TEXT NOT NULL, expires_at TEXT NOT NULL)`);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const allowed = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : `${req.protocol}://${req.get('host')}`;
      if (req.headers.origin !== allowed) return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  app.use('/api', async (req, res, next) => {
    if (req.cookies.checker_session) req.user = await db.one(`SELECT students.* FROM sessions JOIN students ON students.id = sessions.student_id
      WHERE sessions.token = ? AND sessions.expires_at > ?`, [req.cookies.checker_session, now()]);
    next();
  });
  const requireUser = role => (req, res, next) => {
    if (!req.user) fail(401, 'Authentication required.');
    if (role && req.user.role !== role) fail(403, 'Forbidden.');
    next();
  };
  const student = requireUser('student');
  const teacher = requireUser('teacher');
  if (limit) app.use(['/api/login', '/api/register', '/api/forgot-password', '/api/reset-password'], rateLimit({
    windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/register', async (req, res) => {
    const name = requiredText(req.body?.name, 'Full name');
    const email = requiredText(req.body?.email, 'Email').toLowerCase();
    const role = roleFor(email);
    if (!role) fail(400, 'Use an SDU email beginning with numbers for Student or letters for Teacher.');
    const { hash, salt } = await passwordFields(req.body.password);
    const user = await db.transaction(async tx => {
      const row = await tx.one(`INSERT INTO students (name, email, password_hash, password_salt, joined_at, role)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING *`, [name, email, hash, salt, now(), role]);
      await createSession(tx, row.id, res, env);
      return row;
    });
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/login', async (req, res) => {
    const email = requiredText(req.body?.email, 'Email').toLowerCase();
    const role = roleFor(email);
    if (!role) fail(400, 'Use an SDU email that starts with numbers or letters.');
    const user = await db.one('SELECT * FROM students WHERE LOWER(email) = ?', [email]);
    if (!user || !(await matchesPassword(req.body.password, user))) fail(401, 'Email or password is incorrect.');
    await db.transaction(async tx => {
      await tx.query('UPDATE students SET role = ? WHERE id = ?', [role, user.id]);
      await createSession(tx, user.id, res, env);
    });
    res.json({ user: publicUser({ ...user, role }) });
  });
  app.post('/api/logout', async (req, res) => {
    if (req.cookies.checker_session) await db.query('DELETE FROM sessions WHERE token = ?', [req.cookies.checker_session]);
    res.clearCookie('checker_session', cookieOptions(env)).sendStatus(204);
  });
  app.post('/api/forgot-password', async (req, res) => {
    const email = requiredText(req.body?.email, 'Email').toLowerCase();
    const production = env.NODE_ENV === 'production' || env.APP_ENV === 'production';
    if (production && !env.SMTP_HOST) fail(503, 'Password recovery email is not configured.');
    const user = await db.one('SELECT id, email FROM students WHERE LOWER(email) = ?', [email]);
    const payload = { message: 'If an account exists for this email, reset instructions have been sent.' };
    if (user) {
      const value = token();
      const url = `${(env.APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')}/reset?token=${value}`;
      await db.transaction(async tx => {
        await tx.query('DELETE FROM password_resets WHERE student_id = ?', [user.id]);
        await tx.query('INSERT INTO password_resets (token_hash, student_id, expires_at) VALUES (?, ?, ?)', [hashToken(value), user.id, expires(30 * 60000)]);
      });
      await mail(user.email, url);
      if (!production) payload.development_reset_url = url;
    }
    res.json(payload);
  });
  app.post('/api/reset-password', async (req, res) => {
    const value = requiredText(req.body?.token, 'Reset token');
    const { hash, salt } = await passwordFields(req.body.password);
    await db.transaction(async tx => {
      const reset = await tx.one('DELETE FROM password_resets WHERE token_hash = ? AND expires_at > ? RETURNING student_id', [hashToken(value), now()]);
      if (!reset) fail(400, 'This reset link is invalid or has expired.');
      await tx.query('UPDATE students SET password_hash = ?, password_salt = ? WHERE id = ?', [hash, salt, reset.student_id]);
      await tx.query('DELETE FROM sessions WHERE student_id = ?', [reset.student_id]);
    });
    res.json({ message: 'Password updated. You can now log in.' });
  });
  app.get('/api/students', teacher, async (req, res) => {
    let sql = `SELECT students.*, groups.name AS group_name FROM students LEFT JOIN groups ON groups.id = students.group_id WHERE role = 'student'`;
    const params = [];
    if (req.query.group_id === 'none') sql += ' AND students.group_id IS NULL';
    else if (req.query.group_id) { sql += ' AND students.group_id = ?'; params.push(numericId(req.query.group_id)); }
    res.json({ students: (await db.query(`${sql} ORDER BY students.joined_at DESC, students.id DESC`, params)).map(publicUser) });
  });
  app.get('/api/groups', teacher, async (req, res) => res.json({ groups: await db.query(`SELECT groups.id, groups.name, groups.created_at, COUNT(students.id) AS student_count
    FROM groups LEFT JOIN students ON students.group_id = groups.id WHERE groups.teacher_id = ?
    GROUP BY groups.id, groups.name, groups.created_at ORDER BY groups.created_at, groups.id`, [req.user.id]) }));
  async function ownedGroup(req, tx = db) {
    const group = await tx.one('SELECT id, name, created_at FROM groups WHERE id = ? AND teacher_id = ?', [numericId(req.params.id), req.user.id]);
    if (!group) fail(404, 'Group not found.');
    return group;
  }
  app.get('/api/groups/:id', teacher, async (req, res) => {
    const group = await ownedGroup(req);
    res.json({ group, students: (await db.query("SELECT * FROM students WHERE group_id = ? AND role = 'student' ORDER BY name", [group.id])).map(row => publicUser({ ...row, group_name: group.name })) });
  });
  app.post('/api/groups', teacher, async (req, res) => {
    const name = requiredText(req.body?.name, 'Group name');
    const group = await db.one('INSERT INTO groups (teacher_id, name, created_at) VALUES (?, ?, ?) RETURNING id, name, created_at', [req.user.id, name, now()]);
    res.status(201).json({ ...group, student_count: 0 });
  });
  app.post('/api/groups/:id/rename', teacher, async (req, res) => {
    const group = await ownedGroup(req);
    const name = requiredText(req.body?.name, 'Group name');
    await db.query('UPDATE groups SET name = ? WHERE id = ?', [name, group.id]);
    res.json({ id: group.id, name });
  });
  app.post('/api/groups/:id/students', teacher, async (req, res) => {
    const group = await ownedGroup(req);
    const id = numericId(req.body?.student_id);
    if (!(await db.one("SELECT id FROM students WHERE id = ? AND role = 'student'", [id]))) fail(404, 'Student not found.');
    await db.query('UPDATE students SET group_id = ? WHERE id = ?', [group.id, id]);
    res.json({ student_id: id, group_id: group.id });
  });
  app.post('/api/students/:id/ungroup', teacher, async (req, res) => {
    const id = numericId(req.params.id);
    const row = await db.one("SELECT students.id, groups.teacher_id FROM students LEFT JOIN groups ON groups.id = students.group_id WHERE students.id = ? AND role = 'student'", [id]);
    if (!row) fail(404, 'Student not found.');
    if (row.teacher_id && String(row.teacher_id) !== String(req.user.id)) fail(403, 'Only the group owner can remove this student.');
    await db.query('UPDATE students SET group_id = NULL WHERE id = ?', [id]);
    res.json({ student_id: id, group_id: null });
  });
  app.get('/api/checks', requireUser(), async (req, res) => {
    let sql = `SELECT checks.id, checks.student_id, checks.title, checks.attempt_number, checks.file_name, checks.score,
      checks.feedback, checks.teacher_grade, checks.status, checks.created_at, students.name, students.email
      FROM checks JOIN students ON students.id = checks.student_id WHERE students.role = 'student'`;
    const params = [];
    if (req.user.role === 'student' || req.query.student_id) {
      sql += ' AND checks.student_id = ?';
      params.push(req.user.role === 'student' ? req.user.id : numericId(req.query.student_id));
    }
    res.json({ checks: await db.query(`${sql} ORDER BY checks.created_at DESC, checks.id DESC`, params) });
  });
  if (limit) app.use('/api/ocr', student, rateLimit({ windowMs: 15 * 60000, limit: 20, message: { error: 'Too many checks. Please try again later.' } }));
  app.post('/api/ocr', student, async (req, res) => {
    const result = await analyze(req.body?.image_data);
    const id = token();
    const feedback = feedbackFor(result.score, result.chunks).summary;
    await db.transaction(async tx => {
      await tx.query('DELETE FROM analysis_results WHERE expires_at <= ?', [now()]);
      await tx.query('INSERT INTO analysis_results (id, student_id, score, feedback, expires_at) VALUES (?, ?, ?, ?, ?)', [id, req.user.id, result.score, feedback, expires(60 * 60000)]);
    });
    res.json({ ...result, analysis_id: id });
  });
  app.post('/api/checks', student, async (req, res) => {
    const title = requiredText(req.body?.title, 'Assignment title');
    const file = requiredText(req.body?.file_name, 'File name');
    const analysisId = requiredText(req.body?.analysis_id, 'Analysis id');
    const check = await db.transaction(async tx => {
      // A single-use server result prevents score tampering and duplicate saves.
      const result = await tx.one('DELETE FROM analysis_results WHERE id = ? AND student_id = ? AND expires_at > ? RETURNING score, feedback', [analysisId, req.user.id, now()]);
      if (!result) fail(400, 'This analysis has expired or was already saved. Run a new check.');
      // Serialize attempts per student on PostgreSQL; SQLite uses BEGIN IMMEDIATE.
      await tx.query('UPDATE students SET name = name WHERE id = ?', [req.user.id]);
      const previous = await tx.one('SELECT COUNT(*) AS total FROM checks WHERE student_id = ? AND LOWER(title) = LOWER(?)', [req.user.id, title]);
      return tx.one(`INSERT INTO checks (student_id, title, attempt_number, file_name, score, feedback, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, [req.user.id, title, Number(previous.total) + 1, file, result.score, result.feedback, 'Checked', now()]);
    });
    res.status(201).json({ ...check, check_id: check.id });
  });
  app.post('/api/checks/:id/grade', teacher, async (req, res) => {
    const grade = req.body?.grade;
    if (!Number.isInteger(grade) || grade < 0 || grade > 100) fail(400, 'Enter a whole number between 0 and 100.');
    const check = await db.one("UPDATE checks SET teacher_grade = ?, status = 'Graded' WHERE id = ? RETURNING id", [grade, numericId(req.params.id)]);
    if (!check) fail(404, 'Submission was not found.');
    res.json({ check_id: check.id, teacher_grade: grade, status: 'Graded' });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => {
      const routes = /^\/(?:|index\.html|auth(?:\.html)?|register(?:\.html)?|forgot(?:\.html)?|reset(?:\.html)?|profile(?:\.html)?|teacher(?:\.html)?|teacher-profile\.html|teacher-student\.html|teacher\/profile|teacher\/students\/\d+)$/;
      if (!routes.test(req.path)) return res.sendStatus(404);
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === '23505' || /UNIQUE constraint failed/.test(error.message)) return res.status(409).json({ error: 'This email is already registered.' });
    const status = error.status || 500;
    if (status >= 500) console.error('Request failed:', error.message);
    res.status(status).json({ error: status === 500 ? 'The server could not complete this request.' : error.type === 'entity.parse.failed' ? 'Invalid JSON.' : error.message });
  });
  return app;
}
