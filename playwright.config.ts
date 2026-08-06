import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 物理の沈静化を測るテストなので直列で安定させる
  use: {
    viewport: { width: 1240, height: 880 },
    // ローカル（サンドボックス）ではプリインストールの Chromium を使う
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
    },
  },
})
