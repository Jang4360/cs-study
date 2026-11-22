// Acceptance config owned by Claude. NEON must not edit this file.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.cjs$/,
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8791', locale: 'ko-KR' },
  webServer: {
    command: 'HOST=127.0.0.1 PORT=8791 node server/server.mjs',
    cwd: '../..',
    url: 'http://127.0.0.1:8791/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
