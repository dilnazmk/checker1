import { randomBytes, pbkdf2, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
import { fail } from './errors.js';

const derive = promisify(pbkdf2);
export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const expires = ms => new Date(Date.now() + ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
export const token = () => randomBytes(32).toString('base64url');
export const hashToken = value => createHash('sha256').update(value).digest('hex');
export const roleFor = email => /^\d+@sdu\.edu\.kz$/i.test(email) ? 'student' : /^[a-z][^\s@]*@sdu\.edu\.kz$/i.test(email) ? 'teacher' : null;
export const publicUser = row => row ? ({ id: row.id, name: row.name, email: row.email, role: row.role, joined: row.joined_at, group_id: row.group_id, group_name: row.group_name }) : null;

export async function passwordFields(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) fail(400, 'Your password must contain between 8 and 1024 characters.');
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: (await derive(password, salt, 120000, 32, 'sha256')).toString('hex') };
}
export async function matchesPassword(password, row) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const actual = await derive(password, Buffer.from(row.password_salt, 'hex'), 120000, 32, 'sha256');
  const expected = Buffer.from(row.password_hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function cookieOptions(env) {
  return { httpOnly: true, sameSite: 'lax', secure: env.APP_ORIGIN?.startsWith('https://') || env.NODE_ENV === 'production', path: '/' };
}
export async function createSession(db, id, res, env) {
  const value = token();
  await db.query('INSERT INTO sessions (token, student_id, expires_at) VALUES (?, ?, ?)', [value, id, expires(7 * 86400000)]);
  res.cookie('checker_session', value, { ...cookieOptions(env), maxAge: 7 * 86400000 });
}
export async function sendResetEmail(recipient, url, env) {
  if (!env.SMTP_HOST) {
    if (env.NODE_ENV === 'production' || env.APP_ENV === 'production') fail(503, 'Password recovery email is not configured.');
    return;
  }
  const smtp = nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_PORT === '465',
    requireTLS: env.SMTP_PORT !== '465',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  await smtp.sendMail({ from: env.SMTP_FROM || env.SMTP_USER || 'no-reply@checker.app', to: recipient,
    subject: 'Reset your assignment checker password', text: `Open this link within 30 minutes to reset your password:\n\n${url}` });
}
