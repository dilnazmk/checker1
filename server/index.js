import { openDatabase } from './db.js';
import { createApp } from './app.js';

const db = await openDatabase();
const app = await createApp({ db });
const port = Number(process.env.PORT || 8000);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Assignment Checker running on http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(async () => { await db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
