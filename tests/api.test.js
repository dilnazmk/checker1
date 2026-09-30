import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { decodeImage, normalizeAnalysis } from '../server/analysis.js';
import { hashToken } from '../server/auth.js';

let db, app, student, teacher, other, studentId, groupId, checkId;
const password = 'test-password-123';
before(async () => {
  db = await openDatabase({ url: null, filename: ':memory:' });
  app = await createApp({ db, env: { APP_ORIGIN: 'http://localhost:5173' }, limit: false,
    analyze: async () => ({ text: 'Example assignment text', score: 62, chunks: [{ text: 'Example', score: 62 }], word_count: 25, languages: ['eng'] }),
    mail: async () => {},
  });
  student = request.agent(app); teacher = request.agent(app); other = request.agent(app);
});
after(async () => { await db.close(); });

test('authentication, legacy password compatibility, and session cookies', async () => {
  await request(app).get('/api/health').expect(200, { status: 'ok' });
  await request(app).get('/api/checks').expect(401);
  await student.post('/api/register').send({ name: 'Invalid', email: 'test@example.com', password }).expect(400);
  await student.post('/api/register').send({ name: 'Student', email: '123@sdu.edu.kz', password: 'short' }).expect(400);
  const result = await student.post('/api/register').send({ name: 'Student One', email: '123@sdu.edu.kz', password }).expect(201);
  studentId = result.body.user.id;
  assert.match(result.headers['set-cookie'][0], /HttpOnly/);
  assert.match(result.headers['set-cookie'][0], /SameSite=Lax/);
  assert.doesNotMatch(result.headers['set-cookie'][0], /Secure/);
  assert.equal((await student.get('/api/me')).body.user.role, 'student');
  await request(app).post('/api/register').send({ name: 'Duplicate', email: '123@SDU.EDU.KZ', password }).expect(409);
  await request(app).post('/api/login').send({ email: '123@sdu.edu.kz', password: 'incorrect' }).expect(401);
  await teacher.post('/api/register').send({ name: 'Teacher One', email: 'teacher@sdu.edu.kz', password }).expect(201);
  await other.post('/api/register').send({ name: 'Student Two', email: '456@sdu.edu.kz', password }).expect(201);
  // Fixture uses the exact hash emitted by Python hashlib.pbkdf2_hmac.
  await db.query('INSERT INTO students (name,email,password_hash,password_salt,joined_at,role) VALUES (?,?,?,?,?,?)', [
    'Legacy', '789@sdu.edu.kz', '815d25d0a563094f910fcbb7d1e580673d92f4565584b7c0109c20b5b1515e98', '00112233445566778899aabbccddeeff', '2026-01-01T00:00:00Z', 'student',
  ]);
  await request(app).post('/api/login').send({ email: '789@sdu.edu.kz', password }).expect(200);
});

test('teacher groups, ownership, rename, and student assignment', async () => {
  await student.get('/api/students').expect(403);
  await student.post('/api/groups').send({ name: 'No' }).expect(403);
  const group = await teacher.post('/api/groups').send({ name: 'CS 101' }).expect(201);
  groupId = group.body.id;
  await teacher.post(`/api/groups/${groupId}/students`).send({ student_id: studentId }).expect(200);
  const roster = await teacher.get(`/api/students?group_id=${groupId}`).expect(200);
  assert.equal(roster.body.students.length, 1);
  assert.equal(roster.body.students[0].group_name, 'CS 101');
  await teacher.post(`/api/groups/${groupId}/rename`).send({ name: 'CS 102' }).expect(200);
  assert.equal((await teacher.get(`/api/groups/${groupId}`)).body.group.name, 'CS 102');
  const secondTeacher = request.agent(app);
  await secondTeacher.post('/api/register').send({ name: 'Other Teacher', email: 'other@sdu.edu.kz', password }).expect(201);
  await secondTeacher.post(`/api/groups/${groupId}/rename`).send({ name: 'Stolen' }).expect(404);
  await secondTeacher.post(`/api/students/${studentId}/ungroup`).send({}).expect(403);
  await teacher.post(`/api/groups/${groupId}/students`).send({ student_id: 99999 }).expect(404);
});

test('analysis is bound to its student, stored server-side, and consumed once', async () => {
  await teacher.post('/api/ocr').send({ image_data: 'x' }).expect(403);
  const analysis = await student.post('/api/ocr').send({ image_data: 'mock image' }).expect(200);
  const payload = { title: 'Practical One', file_name: 'work.png', analysis_id: analysis.body.analysis_id, score: 0, feedback: 'forged' };
  await other.post('/api/checks').send(payload).expect(400);
  const saved = await student.post('/api/checks').send(payload).expect(201);
  checkId = saved.body.check_id;
  assert.equal(saved.body.score, 62);
  assert.notEqual(saved.body.feedback, 'forged');
  assert.equal(saved.body.attempt_number, 1);
  await student.post('/api/checks').send(payload).expect(400);
  const next = await student.post('/api/ocr').send({ image_data: 'mock' });
  const second = await student.post('/api/checks').send({ ...payload, title: 'practical one', analysis_id: next.body.analysis_id }).expect(201);
  assert.equal(second.body.attempt_number, 2);
  const expired = await student.post('/api/ocr').send({ image_data: 'mock' });
  await db.query("UPDATE analysis_results SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", [expired.body.analysis_id]);
  await student.post('/api/checks').send({ ...payload, analysis_id: expired.body.analysis_id }).expect(400);
  assert.equal((await other.get(`/api/checks?student_id=${studentId}`)).body.checks.length, 0);
  assert.equal((await teacher.get(`/api/checks?student_id=${studentId}`)).body.checks.length, 2);
});

test('grading validates whole numbers and updates student history', async () => {
  await student.post(`/api/checks/${checkId}/grade`).send({ grade: 99 }).expect(403);
  for (const grade of [-1, 101, 1.5, null, '80']) await teacher.post(`/api/checks/${checkId}/grade`).send({ grade }).expect(400);
  await teacher.post('/api/checks/99999/grade').send({ grade: 90 }).expect(404);
  await teacher.post(`/api/checks/${checkId}/grade`).send({ grade: 0 }).expect(200);
  const check = (await student.get('/api/checks')).body.checks.find(check => check.id === checkId);
  assert.equal(check.teacher_grade, 0); assert.equal(check.status, 'Graded');
  await teacher.post(`/api/students/${studentId}/ungroup`).send({}).expect(200);
  assert.equal((await teacher.get(`/api/groups/${groupId}`)).body.students.length, 0);
});

test('concurrent submissions get sequential attempt numbers without losing writes', async () => {
  const analyses = await Promise.all([student.post('/api/ocr').send({ image_data: 'mock' }), student.post('/api/ocr').send({ image_data: 'mock' })]);
  const results = await Promise.all(analyses.map(result => student.post('/api/checks').send({ title: 'Concurrent', file_name: 'work.png', analysis_id: result.body.analysis_id }).expect(201)));
  assert.deepEqual(results.map(result => result.body.attempt_number).sort(), [1, 2]);
});

test('password reset expiry, single use, old session revocation, and logout', async () => {
  const forgotten = await request(app).post('/api/forgot-password').send({ email: '123@sdu.edu.kz' }).expect(200);
  const token = new URL(forgotten.body.development_reset_url).searchParams.get('token');
  await db.query("INSERT INTO password_resets (token_hash, student_id, expires_at) VALUES (?, ?, '2000-01-01T00:00:00Z')", [hashToken('expired'), studentId]);
  await request(app).post('/api/reset-password').send({ token: 'expired', password }).expect(400);
  await request(app).post('/api/reset-password').send({ token, password: 'new-password-123' }).expect(200);
  assert.equal((await student.get('/api/me')).body.user, null);
  await request(app).post('/api/reset-password').send({ token, password }).expect(400);
  await student.post('/api/login').send({ email: '123@sdu.edu.kz', password }).expect(401);
  await student.post('/api/login').send({ email: '123@sdu.edu.kz', password: 'new-password-123' }).expect(200);
  await student.post('/api/logout').send({}).expect(204);
  await student.get('/api/checks').expect(401);
  await request(app).post('/api/logout').send({}).expect(204);
});

test('request validation, source protection, and OCR validation', async () => {
  await request(app).post('/api/login').set('Origin', 'https://evil.example').send({ email: '123@sdu.edu.kz', password }).expect(403);
  await request(app).post('/api/login').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).get('/api/unknown').expect(404);
  await request(app).get('/checker.db').expect(404);
  await request(app).get('/server/app.js').expect(404);
  assert.throws(() => decodeImage('garbage'), /invalid/);
  assert.throws(() => decodeImage('data:image/png;base64,!!!!'), /invalid/);
  assert.equal(decodeImage('data:image/png;base64,YWJj').toString(), 'abc');
  assert.throws(() => normalizeAnalysis({ score: 'bad' }, 'text'), /invalid analysis/);
  assert.equal(normalizeAnalysis({ score: 20 }, 'text').chunks[0].text, 'text');
});
