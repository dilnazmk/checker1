import base64
import binascii
import hashlib
import io
import json
import os
import re
import secrets
import smtplib
import sqlite3
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from email.message import EmailMessage
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None

try:
    import pytesseract
    from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:
    pytesseract = None
    Image = None
    ImageOps = None
    UnidentifiedImageError = OSError

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, 'checker.db')
DATABASE_URL = os.getenv('DATABASE_URL')
EMAIL_PATTERN = re.compile(r'^[^\s@]+@sdu\.edu\.kz$', re.IGNORECASE)
STUDENT_EMAIL_PATTERN = re.compile(r'^\d+@sdu\.edu\.kz$', re.IGNORECASE)
TEACHER_EMAIL_PATTERN = re.compile(r'^[A-Za-z][^@]*@sdu\.edu\.kz$', re.IGNORECASE)


def database():
    if DATABASE_URL:
        if psycopg is None:
            raise RuntimeError('Install psycopg[binary] to use PostgreSQL.')
        return psycopg.connect(DATABASE_URL, row_factory=dict_row)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    return connection


def init_database():
    with database() as connection:
        sqlite_schema = '''
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                joined_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(teacher_id) REFERENCES students(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                attempt_number INTEGER NOT NULL DEFAULT 1,
                file_name TEXT NOT NULL,
                image_data TEXT,
                score INTEGER NOT NULL,
                feedback TEXT NOT NULL,
                teacher_grade INTEGER,
                status TEXT NOT NULL DEFAULT 'Checked',
                created_at TEXT NOT NULL,
                FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                student_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS password_resets (
                token_hash TEXT PRIMARY KEY,
                student_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
            );
        '''
        if DATABASE_URL:
            postgres_schema = '''
                CREATE TABLE IF NOT EXISTS students (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    joined_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS groups (
                    id BIGSERIAL PRIMARY KEY,
                    teacher_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS checks (
                    id BIGSERIAL PRIMARY KEY,
                    student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    title TEXT NOT NULL DEFAULT '',
                    attempt_number INTEGER NOT NULL DEFAULT 1,
                    file_name TEXT NOT NULL,
                    image_data TEXT,
                    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
                    feedback TEXT NOT NULL,
                    teacher_grade INTEGER,
                    status TEXT NOT NULL DEFAULT 'Checked',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS password_resets (
                    token_hash TEXT PRIMARY KEY,
                    student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    expires_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS students_email_lower_idx
                    ON students (LOWER(email));
            '''
            for statement in postgres_schema.split(';'):
                if statement.strip():
                    connection.execute(statement)
        else:
            connection.executescript(sqlite_schema)
        if DATABASE_URL:
            connection.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'")
            connection.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL")
            connection.execute("ALTER TABLE checks ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''")
            connection.execute("ALTER TABLE checks ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1")
            connection.execute("ALTER TABLE checks ADD COLUMN IF NOT EXISTS teacher_grade INTEGER")
            connection.execute("ALTER TABLE checks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Checked'")
        else:
            columns = {row['name'] for row in connection.execute('PRAGMA table_info(students)').fetchall()}
            if 'role' not in columns:
                connection.execute("ALTER TABLE students ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
            if 'group_id' not in columns:
                connection.execute("ALTER TABLE students ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL")
            check_columns = {row['name'] for row in connection.execute('PRAGMA table_info(checks)').fetchall()}
            if 'title' not in check_columns:
                connection.execute("ALTER TABLE checks ADD COLUMN title TEXT NOT NULL DEFAULT ''")
            if 'attempt_number' not in check_columns:
                connection.execute("ALTER TABLE checks ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1")
            if 'teacher_grade' not in check_columns:
                connection.execute("ALTER TABLE checks ADD COLUMN teacher_grade INTEGER")
            if 'status' not in check_columns:
                connection.execute("ALTER TABLE checks ADD COLUMN status TEXT NOT NULL DEFAULT 'Checked'")


def execute(connection, query, parameters=()):
    if DATABASE_URL:
        query = query.replace('?', '%s')
    return connection.execute(query, parameters)


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 120000).hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(connection, student_id):
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(days=7)).replace(microsecond=0).isoformat() + 'Z'
    execute(connection, 'INSERT INTO sessions (token, student_id, expires_at) VALUES (?, ?, ?)', (token, student_id, expires_at))
    return token


def extract_assignment_text(image_data):
    """Extract assignment text from an image using Gemini."""

    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY is not configured.')

    if not image_data or ',' not in image_data:
        raise ValueError('Upload a valid image.')

    try:
        header, encoded_image = image_data.split(',', 1)
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError('The uploaded image data is invalid.') from error

    if len(image_bytes) > 10 * 1024 * 1024:
        raise ValueError('The image must be smaller than 10 MB.')

    mime_match = re.match(r'data:(image/[^;]+);base64', header)
    mime_type = mime_match.group(1) if mime_match else 'image/jpeg'

    prompt = """
Read the practical assignment shown in this image.

Extract all readable student-written text as accurately as possible.

The text may be in English, Russian, Kazakh, or a mixture of these languages.

Rules:
- Preserve the original language.
- Do not translate.
- Do not rewrite or improve the student's writing.
- Do not answer the assignment.
- Do not add explanations.
- Ignore interface elements or irrelevant background text.
- Return only the text that is actually visible in the student's work.
"""

    payload = {
        'contents': [{
            'parts': [
                {'text': prompt},
                {
                    'inline_data': {
                        'mime_type': mime_type,
                        'data': encoded_image
                    }
                }
            ]
        }],
        'generationConfig': {
            'temperature': 0,
            'maxOutputTokens': 8192
        }
    }

    url = (
        'https://generativelanguage.googleapis.com/v1beta/'
        'models/gemini-2.5-flash:generateContent'
        f'?key={api_key}'
    )

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        details = error.read().decode('utf-8', errors='replace')
        print('Gemini API error:', details)
        raise ValueError('Gemini could not read this assignment.') from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise ValueError('Gemini took too long. Please try again.') from error

    try:
        text = result['candidates'][0]['content']['parts'][0]['text'].strip()
    except (KeyError, IndexError, TypeError):
        raise ValueError('Gemini did not return readable text.')

    if len(text.split()) < 20:
        raise ValueError(
            'Too little text was recognized. Use a clear image with at least 20 words.'
        )

    return text


def public_student(row):
    data = dict(row)
    return {
        'id': data['id'],
        'name': data['name'],
        'email': data['email'],
        'joined': data['joined_at'],
        'group_id': data.get('group_id'),
        'group_name': data.get('group_name'),
    }


GROUP_ID_RE = re.compile(r'^/api/groups/(\d+)$')
GROUP_RENAME_RE = re.compile(r'^/api/groups/(\d+)/rename$')
GROUP_STUDENTS_RE = re.compile(r'^/api/groups/(\d+)/students$')
CHECK_GRADE_RE = re.compile(r'^/api/checks/(\d+)/grade$')


class CheckerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Access-Control-Allow-Origin', 'https://checker1-v443.onrender.com')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_redirect(self, location):
        self.send_response(302)
        self.send_header('Location', location)
        self.end_headers()

    def current_user(self):
        cookie = self.headers.get('Cookie', '')
        token = next((part.split('=', 1)[1] for part in cookie.split('; ') if part.startswith('checker_session=')), None)
        if not token:
            return None
        with database() as connection:
            return execute(connection, '''SELECT students.id, students.name, students.email, students.role
                FROM sessions JOIN students ON students.id = sessions.student_id
                WHERE sessions.token = ? AND sessions.expires_at > ?''', (token, datetime.utcnow().replace(microsecond=0).isoformat() + 'Z')).fetchone()

    def require_user(self, role=None):
        user = self.current_user()
        if not user or (role and user['role'] != role):
            self.send_json({'error': 'Authentication required.' if not user else 'Forbidden.'}, 401 if not user else 403)
            return None
        return user

    def read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        if length > 15 * 1024 * 1024:
            raise ValueError('Request is too large')
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.send_json({'status': 'ok'})
        if path == '/api/me':
            user = self.current_user()
            return self.send_json({'user': dict(user) if user else None})
        if path == '/api/students':
            if not self.require_user('teacher'):
                return
            query_params = dict(pair.split('=', 1) for pair in urlparse(self.path).query.split('&') if '=' in pair)
            with database() as connection:
                sql = '''SELECT students.id, students.name, students.email, students.joined_at, students.role,
                    students.group_id, groups.name AS group_name FROM students
                    LEFT JOIN groups ON groups.id = students.group_id WHERE students.role = ?'''
                parameters = ('student',)
                if query_params.get('group_id') == 'none':
                    sql += ' AND students.group_id IS NULL'
                elif query_params.get('group_id'):
                    sql += ' AND students.group_id = ?'
                    parameters += (query_params['group_id'],)
                sql += ' ORDER BY students.joined_at DESC'
                rows = execute(connection, sql, parameters).fetchall()
            return self.send_json({'students': [public_student(row) for row in rows]})
        if path == '/api/groups':
            if not self.require_user('teacher'):
                return
            with database() as connection:
                rows = execute(connection, '''SELECT groups.id, groups.name, groups.created_at,
                    COUNT(students.id) AS student_count FROM groups
                    LEFT JOIN students ON students.group_id = groups.id
                    WHERE groups.teacher_id = ? GROUP BY groups.id, groups.name, groups.created_at
                    ORDER BY groups.created_at ASC''', (self.current_user()['id'],)).fetchall()
            return self.send_json({'groups': [dict(row) for row in rows]})
        group_match = GROUP_ID_RE.match(path)
        if group_match:
            if not self.require_user('teacher'):
                return
            group_id = int(group_match.group(1))
            with database() as connection:
                group = execute(connection, 'SELECT id, name, created_at FROM groups WHERE id = ? AND teacher_id = ?', (group_id, self.current_user()['id'])).fetchone()
                if not group:
                    return self.send_json({'error': 'Group not found.'}, 404)
                rows = execute(connection, '''SELECT students.id, students.name, students.email, students.joined_at, students.role,
                    students.group_id, groups.name AS group_name FROM students
                    LEFT JOIN groups ON groups.id = students.group_id
                    WHERE students.group_id = ? ORDER BY students.name ASC''', (group_id,)).fetchall()
            return self.send_json({'group': dict(group), 'students': [public_student(row) for row in rows]})
        if path == '/api/checks':
            user = self.require_user()
            if not user:
                return
            query_params = dict(pair.split('=', 1) for pair in urlparse(self.path).query.split('&') if '=' in pair)
            with database() as connection:
                sql = '''SELECT checks.id, checks.student_id, checks.title, checks.attempt_number, checks.file_name,
                    checks.score, checks.feedback, checks.teacher_grade, checks.status, checks.created_at,
                    students.name, students.email FROM checks
                    JOIN students ON students.id = checks.student_id WHERE students.role = ?'''
                parameters = ('student',)
                if user['role'] == 'student':
                    sql += ' AND checks.student_id = ?'
                    parameters += (user['id'],)
                elif query_params.get('student_id'):
                    sql += ' AND checks.student_id = ?'
                    parameters += (query_params['student_id'],)
                sql += ' ORDER BY checks.created_at DESC'
                rows = execute(connection, sql, parameters).fetchall()
            return self.send_json({'checks': [dict(row) for row in rows]})
        if path in ('/', '/index.html', '/teacher.html', '/profile.html', '/teacher-profile.html', '/teacher-student.html', '/register.html'):
            user = self.current_user()
            if not user:
                return self.send_redirect('/auth.html')
            if path == '/register.html':
                return self.send_redirect('/index.html' if user['role'] == 'student' else '/teacher.html')
            if path in ('/teacher.html', '/teacher-profile.html', '/teacher-student.html') and user['role'] != 'teacher':
                return self.send_redirect('/index.html')
            if path == '/profile.html' and user['role'] == 'teacher':
                return self.send_redirect('/teacher-profile.html')
            if path == '/index.html' and user['role'] == 'teacher':
                return self.send_redirect('/teacher.html')
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == '/api/logout':
                return self.logout()
            data = self.read_json()
            if path == '/api/register':
                return self.register(data)
            if path == '/api/login':
                return self.login(data)
            if path == '/api/forgot-password':
                return self.forgot_password(data)
            if path == '/api/reset-password':
                return self.reset_password(data)
            if path == '/api/ocr':
                return self.ocr(data)
            if path == '/api/checks':
                return self.create_check(data)
            grade_match = CHECK_GRADE_RE.match(path)
            if grade_match:
                return self.grade_check(int(grade_match.group(1)), data)
            if path == '/api/groups':
                return self.create_group(data)
            rename_match = GROUP_RENAME_RE.match(path)
            if rename_match:
                return self.rename_group(int(rename_match.group(1)), data)
            students_match = GROUP_STUDENTS_RE.match(path)
            if students_match:
                return self.assign_group(int(students_match.group(1)), data)
            self.send_json({'error': 'Not found'}, 404)
        except ValueError as error:
            self.send_json({'error': str(error)}, 400)
        except sqlite3.IntegrityError:
            self.send_json({'error': 'This email is already registered.'}, 409)
        except Exception as error:
            if psycopg is not None and isinstance(error, psycopg.IntegrityError):
                return self.send_json({'error': 'This email is already registered.'}, 409)
            print(f'Request failed: {error}')
            self.send_json({'error': 'The server could not complete this request.'}, 500)

    def register(self, data):
        name = str(data.get('name', '')).strip()
        email = str(data.get('email', '')).strip().lower()
        password = str(data.get('password', ''))
        role = 'student' if STUDENT_EMAIL_PATTERN.fullmatch(email) else 'teacher' if TEACHER_EMAIL_PATTERN.fullmatch(email) else None
        if not name or not EMAIL_PATTERN.fullmatch(email) or role is None:
            return self.send_json({'error': 'Email must start with numbers for Student or letters for Teacher.'}, 400)
        if len(password) < 8:
            return self.send_json({'error': 'Your password must contain at least 8 characters.'}, 400)
        salt = secrets.token_bytes(16)
        joined_at = datetime.utcnow().isoformat(timespec='seconds') + 'Z'
        with database() as connection:
            if DATABASE_URL:
                cursor = execute(connection, '''INSERT INTO students (name, email, password_hash, password_salt, joined_at, role)
                    VALUES (?, ?, ?, ?, ?, ?) RETURNING id''', (name, email, password_hash(password, salt), salt.hex(), joined_at, role))
                student_id = cursor.fetchone()['id']
            else:
                cursor = execute(connection, '''INSERT INTO students (name, email, password_hash, password_salt, joined_at, role)
                    VALUES (?, ?, ?, ?, ?, ?)''', (name, email, password_hash(password, salt), salt.hex(), joined_at, role))
                student_id = cursor.lastrowid
            token = create_session(connection, student_id)
        return self.set_session({'user': {'id': student_id, 'name': name, 'email': email, 'role': role, 'joined': joined_at}}, token, 201)

    def set_session(self, payload, token, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        secure = '; Secure' if os.getenv('APP_ORIGIN', '').startswith('https://') else ''
        self.send_header('Set-Cookie', f'checker_session={token}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=604800')
        self.end_headers()
        self.wfile.write(body)

    def login(self, data):
        email = str(data.get('email', '')).strip().lower()
        password = str(data.get('password', ''))
        role = 'student' if STUDENT_EMAIL_PATTERN.fullmatch(email) else 'teacher' if TEACHER_EMAIL_PATTERN.fullmatch(email) else None
        if role is None:
            return self.send_json({'error': 'Use an SDU email that starts with numbers or letters.'}, 400)
        with database() as connection:
            user = execute(connection, 'SELECT * FROM students WHERE email = ?', (email,)).fetchone()
            if not user or password_hash(password, bytes.fromhex(user['password_salt'])) != user['password_hash']:
                return self.send_json({'error': 'Email or password is incorrect.'}, 401)
            execute(connection, 'UPDATE students SET role = ? WHERE id = ?', (role, user['id']))
            token = create_session(connection, user['id'])
        return self.set_session({'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': role}}, token)

    def forgot_password(self, data):
        email = str(data.get('email', '')).strip().lower()
        reset_url = None
        with database() as connection:
            user = execute(connection, 'SELECT id, email FROM students WHERE email = ?', (email,)).fetchone()
            if user:
                token = secrets.token_urlsafe(32)
                expires_at = (datetime.utcnow() + timedelta(minutes=30)).replace(microsecond=0).isoformat() + 'Z'
                execute(connection, 'DELETE FROM password_resets WHERE student_id = ?', (user['id'],))
                execute(connection, 'INSERT INTO password_resets (token_hash, student_id, expires_at) VALUES (?, ?, ?)', (token_hash(token), user['id'], expires_at))
                origin = os.getenv('APP_ORIGIN', 'http://127.0.0.1:8000').rstrip('/')
                reset_url = f'{origin}/reset.html?token={token}'
                self.send_reset_email(user['email'], reset_url)
        payload = {'message': 'If an account exists for this email, reset instructions have been sent.'}
        if reset_url and os.getenv('APP_ENV', 'development') != 'production':
            payload['development_reset_url'] = reset_url
        return self.send_json(payload)

    def send_reset_email(self, recipient, reset_url):
        host = os.getenv('SMTP_HOST')
        if not host:
            return
        message = EmailMessage()
        message['Subject'] = 'Reset your assignment checker password'
        message['From'] = os.getenv('SMTP_FROM', os.getenv('SMTP_USER', 'no-reply@checker.app'))
        message['To'] = recipient
        message.set_content(f'Open this link within 30 minutes to reset your password:\n\n{reset_url}')
        with smtplib.SMTP(host, int(os.getenv('SMTP_PORT', '587'))) as smtp:
            smtp.starttls()
            smtp.login(os.getenv('SMTP_USER', ''), os.getenv('SMTP_PASSWORD', ''))
            smtp.send_message(message)

    def reset_password(self, data):
        token = str(data.get('token', ''))
        password = str(data.get('password', ''))
        if len(password) < 8 or not token:
            return self.send_json({'error': 'A valid token and password of at least 8 characters are required.'}, 400)
        with database() as connection:
            reset = execute(connection, '''SELECT student_id FROM password_resets
                WHERE token_hash = ? AND expires_at > ?''', (token_hash(token), datetime.utcnow().replace(microsecond=0).isoformat() + 'Z')).fetchone()
            if not reset:
                return self.send_json({'error': 'This reset link is invalid or has expired.'}, 400)
            salt = secrets.token_bytes(16)
            execute(connection, 'UPDATE students SET password_hash = ?, password_salt = ? WHERE id = ?', (password_hash(password, salt), salt.hex(), reset['student_id']))
            execute(connection, 'DELETE FROM password_resets WHERE token_hash = ?', (token_hash(token),))
            execute(connection, 'DELETE FROM sessions WHERE student_id = ?', (reset['student_id'],))
        return self.send_json({'message': 'Password updated. You can now log in.'})

    def logout(self):
        user = self.current_user()
        if user:
            cookie = self.headers.get('Cookie', '')
            token = next((part.split('=', 1)[1] for part in cookie.split('; ') if part.startswith('checker_session=')), None)
            with database() as connection:
                execute(connection, 'DELETE FROM sessions WHERE token = ?', (token,))
        self.send_response(204)
        self.send_header('Set-Cookie', f'checker_session={token}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=604800')
        self.end_headers()

    def ocr(self, data):
        if not self.require_user('student'):
            return
        text = extract_assignment_text(data.get('image_data'))
        return self.send_json({'text': text, 'word_count': len(text.split()), 'languages': ['eng', 'rus', 'kaz']})

    def create_check(self, data):
        user = self.require_user('student')
        if not user:
            return
        student_id = user['id']
        title = str(data.get('title', '')).strip()
        file_name = str(data.get('file_name', '')).strip()
        score = int(data.get('score', 0))
        feedback = str(data.get('feedback', '')).strip()
        if not student_id or not title or not file_name or score < 0 or score > 100 or not feedback:
            return self.send_json({'error': 'An assignment title, file, score, and feedback are required.'}, 400)
        with database() as connection:
            student = execute(connection, 'SELECT id FROM students WHERE id = ?', (student_id,)).fetchone()
            if not student:
                return self.send_json({'error': 'Student profile was not found.'}, 404)
            previous = execute(connection, 'SELECT COUNT(*) AS total FROM checks WHERE student_id = ? AND LOWER(title) = LOWER(?)', (student_id, title)).fetchone()
            attempt_number = int(previous['total']) + 1
            created_at = datetime.utcnow().isoformat(timespec='seconds') + 'Z'
            if DATABASE_URL:
                cursor = execute(connection, '''INSERT INTO checks (student_id, title, attempt_number, file_name, image_data, score, feedback, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id''',
                    (student_id, title, attempt_number, file_name, None, score, feedback, 'Checked', created_at))
                check_id = cursor.fetchone()['id']
            else:
                cursor = execute(connection, '''INSERT INTO checks (student_id, title, attempt_number, file_name, image_data, score, feedback, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (student_id, title, attempt_number, file_name, None, score, feedback, 'Checked', created_at))
                check_id = cursor.lastrowid
        return self.send_json({'check_id': check_id, 'title': title, 'attempt_number': attempt_number, 'score': score, 'feedback': feedback}, 201)

    def grade_check(self, check_id, data):
        if not self.require_user('teacher'):
            return
        grade = data.get('grade', None)
        try:
            grade = int(grade)
        except (TypeError, ValueError):
            return self.send_json({'error': 'A numeric grade between 0 and 100 is required.'}, 400)
        if grade < 0 or grade > 100:
            return self.send_json({'error': 'Grade must be between 0 and 100.'}, 400)
        with database() as connection:
            check = execute(connection, 'SELECT id FROM checks WHERE id = ?', (check_id,)).fetchone()
            if not check:
                return self.send_json({'error': 'Submission was not found.'}, 404)
            execute(connection, "UPDATE checks SET teacher_grade = ?, status = 'Graded' WHERE id = ?", (grade, check_id))
        return self.send_json({'check_id': check_id, 'teacher_grade': grade, 'status': 'Graded'})

    def create_group(self, data):
        user = self.require_user('teacher')
        if not user:
            return
        name = str(data.get('name', '')).strip()
        if not name:
            return self.send_json({'error': 'A group name is required.'}, 400)
        created_at = datetime.utcnow().isoformat(timespec='seconds') + 'Z'
        with database() as connection:
            if DATABASE_URL:
                cursor = execute(connection, 'INSERT INTO groups (teacher_id, name, created_at) VALUES (?, ?, ?) RETURNING id', (user['id'], name, created_at))
                group_id = cursor.fetchone()['id']
            else:
                cursor = execute(connection, 'INSERT INTO groups (teacher_id, name, created_at) VALUES (?, ?, ?)', (user['id'], name, created_at))
                group_id = cursor.lastrowid
        return self.send_json({'id': group_id, 'name': name, 'created_at': created_at, 'student_count': 0}, 201)

    def rename_group(self, group_id, data):
        user = self.require_user('teacher')
        if not user:
            return
        name = str(data.get('name', '')).strip()
        if not name:
            return self.send_json({'error': 'A group name is required.'}, 400)
        with database() as connection:
            group = execute(connection, 'SELECT id FROM groups WHERE id = ? AND teacher_id = ?', (group_id, user['id'])).fetchone()
            if not group:
                return self.send_json({'error': 'Group not found.'}, 404)
            execute(connection, 'UPDATE groups SET name = ? WHERE id = ?', (name, group_id))
        return self.send_json({'id': group_id, 'name': name})

    def assign_group(self, group_id, data):
        user = self.require_user('teacher')
        if not user:
            return
        student_id = data.get('student_id')
        if not student_id:
            return self.send_json({'error': 'A student id is required.'}, 400)
        with database() as connection:
            group = execute(connection, 'SELECT id FROM groups WHERE id = ? AND teacher_id = ?', (group_id, user['id'])).fetchone()
            if not group:
                return self.send_json({'error': 'Group not found.'}, 404)
            student = execute(connection, "SELECT id FROM students WHERE id = ? AND role = 'student'", (student_id,)).fetchone()
            if not student:
                return self.send_json({'error': 'Student not found.'}, 404)
            execute(connection, 'UPDATE students SET group_id = ? WHERE id = ?', (group_id, student_id))
        return self.send_json({'student_id': student_id, 'group_id': group_id})


if __name__ == '__main__':
    init_database()
    host = '0.0.0.0' if os.getenv('PORT') else '127.0.0.1'
    port = int(os.getenv('PORT', '8000'))
    server = ThreadingHTTPServer((host, port), CheckerHandler)
    print(f'Server running at http://{host}:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped')
