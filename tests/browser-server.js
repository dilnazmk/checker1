import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

const directory = await mkdtemp(path.join(tmpdir(), 'checker-e2e-'));
const db = await openDatabase({ url: null, filename: path.join(directory, 'test.db') });
const app = await createApp({ db, env: { APP_ORIGIN: 'http://127.0.0.1:8765' }, limit: false, mail: async () => {},
  analyze: async () => ({ score: 62, chunks: [{ text: 'An example of assignment text for testing.', score: 62 }], text: 'Example assignment', word_count: 25, languages: ['eng'] }),
});
const server = app.listen(8765, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(async () => {
  await db.close(); await rm(directory, { recursive: true, force: true }); process.exit(0);
}));
