import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-upgrade\.spec\.ts/,
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:4174', serviceWorkers: 'allow' },
  webServer: {
    command: 'node scripts/prepare-pwa-fixture.mjs && npm run preview -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
