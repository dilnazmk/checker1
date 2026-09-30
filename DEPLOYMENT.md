# Deployment

The Docker image builds the React frontend and runs Express. No Python, Tesseract, or browser-downloaded AI model is needed. Image reading and analysis use Cloudflare Workers AI and require its credentials.

## Render

Use the existing `render.yaml` Blueprint. It connects the service to PostgreSQL through `DATABASE_URL`. Set these service environment variables:

- `APP_ORIGIN`: the public HTTPS service URL, without a trailing slash.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`: credentials permitted to run Workers AI.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`: password recovery email settings. Port 587 uses STARTTLS; 465 uses implicit TLS.

The Blueprint sets production mode and one trusted reverse proxy. Serve the frontend and API from the same service; the React app uses relative `/api` URLs. Existing accounts and data remain in the connected PostgreSQL database. Back up existing data before deployment. Check `/api/health` after deployment, then verify login, an AI check, a teacher grade, and a password reset using configured services.

## Docker

```sh
docker build -t assignment-checker .
docker run --rm -p 8000:8000 --env-file .env \
  -e APP_ORIGIN=http://localhost:8000 -e NODE_ENV=development -e APP_ENV=development \
  -v checker-data:/data assignment-checker
```

The development overrides allow session cookies over local HTTP. For production, keep production mode and use an HTTPS origin. Use PostgreSQL or persist `/data` to retain SQLite data. Database files and `.env` are excluded from the image. The image runs as the non-root `node` user.

## Existing deployment migration

1. Back up SQLite/PostgreSQL and stop the old Python process.
2. Install with `npm ci`, build with `npm run build`, and configure the same database.
3. Run `npm start` or deploy the Docker image. Startup adds missing schema fields and the temporary analysis table.
4. Verify the workflows above. Old `.html` links continue to work.

For rollback, restore the earlier code revision; existing tables and password hashes retain their format. Do not run both versions concurrently during migration. The new frontend requires the new Express API because saved checks use server-issued analysis IDs.
