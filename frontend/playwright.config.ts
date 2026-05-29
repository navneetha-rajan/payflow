import { defineConfig } from '@playwright/test'

// Viewport presets - change VIEWPORT below to switch
const VIEWPORTS = {
  MOBILE: { width: 375, height: 667 },      // iPhone SE
  TABLET: { width: 768, height: 1024 },     // iPad
  LAPTOP: { width: 1366, height: 768 },     // Common laptop
  DESKTOP: { width: 1920, height: 1080 },   // 1080p
  DESKTOP_HD: { width: 2560, height: 1440 }, // 1440p
}

// Change this to switch viewport based on app type
const VIEWPORT = VIEWPORTS.DESKTOP

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/results',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: VIEWPORT,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
