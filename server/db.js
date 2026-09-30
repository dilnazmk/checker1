import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import path from 'node:path';

// Keep the original table names, timestamp format, and PBKDF2 credentials so
// existing Python deployments can switch runtimes without exporting their data.
export async function openDatabase({ url = process.env.DATABASE_URL, filename = process.env.DB_PATH || path.resolve('checker.db') } = {}) {
  const pool = url ? new pg.Pool({ connectionString: url }) : null;
  const sqlite = pool ? null : new DatabaseSync(filename);
  sqlite?.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  function adapter(client) {
    return {
      async query(sql, params = []) {
        if (pool) {
          let index = 0;
          return (await client.query(sql.replace(/\?/g, () => `$${++index}`), params)).rows;
        }
        const statement = sqlite.prepare(sql);
        return statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
      },
      async one(sql, params = []) { return (await this.query(sql, params))[0]; },
    };
  }
  const db = adapter(pool);
  // Queue SQLite transactions so awaited operations cannot interleave on one connection.
  let queue = Promise.resolve();
  function enqueue(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }
  if (!pool) {
    const query = db.query.bind(db);
    db.query = (sql, params) => enqueue(() => query(sql, params));
  }
  db.transaction = async (work) => {
    const run = async () => {
      const client = pool ? await pool.connect() : null;
      const tx = adapter(client);
      try {
        await tx.query(pool ? 'BEGIN' : 'BEGIN IMMEDIATE');
        const result = await work(tx);
        await tx.query('COMMIT');
        return result;
      } catch (error) {
        await tx.query('ROLLBACK');
        throw error;
      } finally { client?.release(); }
    };
    if (pool) return run();
    return enqueue(run);
  };
  const id = pool ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const fk = pool ? 'BIGINT' : 'INTEGER';
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS students (id ${id}, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, joined_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS groups (id ${id}, teacher_id ${fk} NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      name TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS checks (id ${id}, student_id ${fk} NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '', attempt_number INTEGER NOT NULL DEFAULT 1, file_name TEXT NOT NULL,
      image_data TEXT, score INTEGER NOT NULL, feedback TEXT NOT NULL, teacher_grade INTEGER,
      status TEXT NOT NULL DEFAULT 'Checked', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, student_id ${fk} NOT NULL REFERENCES students(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, student_id ${fk} NOT NULL REFERENCES students(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)`,
  ]) await db.query(sql);
  for (const [table, column, type] of [
    ['students', 'role', "TEXT NOT NULL DEFAULT 'student'"],
    ['students', 'group_id', `${fk} REFERENCES groups(id) ON DELETE SET NULL`],
    ['checks', 'title', "TEXT NOT NULL DEFAULT ''"],
    ['checks', 'attempt_number', 'INTEGER NOT NULL DEFAULT 1'],
    ['checks', 'teacher_grade', 'INTEGER'],
    ['checks', 'status', "TEXT NOT NULL DEFAULT 'Checked'"],
  ]) {
    if (pool) await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    else if (!(await db.query(`PRAGMA table_info(${table})`)).some(row => row.name === column)) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS students_email_lower_idx ON students (LOWER(email))');
  db.close = async () => pool ? pool.end() : sqlite.close();
  return db;
}
