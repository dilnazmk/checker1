import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8765', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/browser-server.js', url: 'http://127.0.0.1:8765/api/health', reuseExistingServer: false },
});
