/**
 * Runs the deployed smoke against the live app (no local server):
 *   DEPLOYED_URL=https://aidm.app.space npx playwright test -c tests/playwright.deployed.config.ts
 */
import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

export default defineConfig({
  testDir: '.',
  testMatch: '**/deployed.spec.ts',
  timeout: 300_000,
  retries: 0,
  use: {
    baseURL: process.env.DEPLOYED_URL ?? 'https://aidm.app.space',
    headless: true,
    launchOptions: chromiumLaunchOptions(),
  },
})
