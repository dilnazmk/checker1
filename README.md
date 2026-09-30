# Assignment Checker

React frontend (Vite and React Router) and Express backend. Students upload assignment images, view analysis and submission history, and track grades. Teachers organize groups and grade attempts. Login, signup, profiles, and password recovery are included.

## Run locally

Install Node.js 22.16 or newer, then:

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Express on port 8000. If you use a different browser origin, set `APP_ORIGIN` to match it. Add your Cloudflare account ID and API token to `.env` to enable image analysis. Other workflows work without Cloudflare credentials.

Production build:

```sh
npm run build
APP_ORIGIN=http://localhost:8000 npm start
```

Open http://localhost:8000. Express serves only the built frontend and API. Production HTTPS deployments should set `NODE_ENV=production`, `APP_ENV=production`, and `APP_ORIGIN=https://your-host`.

## Data and compatibility

- SQLite defaults to the original `checker.db`; `DB_PATH` overrides it. `DATABASE_URL` selects PostgreSQL.
- Existing tables, IDs, attempts, groups, sessions, and Python PBKDF2 password hashes remain compatible. Startup adds missing columns and an `analysis_results` table without clearing data. Back up the database before changing a deployed runtime.
- Numeric SDU email addresses register as students; SDU email addresses beginning with a letter register as teachers, matching the existing application. Email ownership is not verified. Teachers retain the existing shared student roster and grading access; group management is restricted to the group owner.
- Old `.html` page links redirect to React routes, including password reset links and teacher student profiles.
- AI analysis uses the existing Cloudflare vision and text models. Images are sent to Cloudflare but not stored in the database. Analysis is a screening signal, not proof of authorship.
- `/api/ocr` returns a one-use `analysis_id`. `/api/checks` requires that ID with `title` and `file_name`; scores and feedback come from the server. Existing third-party API clients must adopt this save contract. Unsaved results expire after an hour.
- Development password recovery shows a local reset link. Production uses SMTP and never returns reset tokens. Configure the SMTP variables in `.env.example`.

## Structure

- `client/src/`: React routes, reusable components, and the preserved application styling.
- `server/`: Express API, authentication, SQLite/PostgreSQL adapter, and Cloudflare integration.
- `shared/feedback.js`: existing score interpretation and feedback.
- `tests/`: HTTP integration and browser workflow tests.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

API tests use an in-memory SQLite database and mock AI/email providers. Browser tests exercise the built React frontend against a real Express server with a separate temporary SQLite database and deterministic AI output. They never send mail or call Cloudflare. Live Cloudflare, SMTP, and PostgreSQL require configured services for additional deployment validation.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker and Render setup.
