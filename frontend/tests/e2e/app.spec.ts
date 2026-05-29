/**
 * E2E Tests - MUST BE CUSTOMIZED FOR YOUR APP
 *
 * These tests capture screenshots for visual validation.
 * You MUST edit them to match your app's actual pages and flows.
 *
 * See: .claude/CLAUDE.md -> "Final Validation Steps" for details.
 *
 * Required screenshots:
 * - MainPage.png: Your app's main/home page (after auth if applicable)
 * - LandingPage.png: Landing or auth page (or duplicate of main if no auth)
 */

import { test, expect } from '@playwright/test'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// DO NOT CHANGE THESE NAMES
const MAIN_PAGE_SCREENSHOT_NAME = 'MainPage'
const LANDING_PAGE_SCREENSHOT_NAME = 'LandingPage'

// Ensure screenshots directory exists (ESM-compatible)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const screenshotsDir = join(__dirname, '..', 'screenshots')
if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true })
}

test.describe('App E2E Tests', () => {
  /**
   * EDIT THIS TEST: Capture your landing/auth page
   *
   * If your app has authentication:
   * - Navigate to the login or register page
   * - Verify auth UI elements are present
   *
   * If your app has no auth:
   * - Duplicate the MainPage test logic here
   */
  test('captures LandingPage screenshot', async ({ page }) => {
    // TODO: Update this route to your app's landing/auth page
    await page.goto('/')

    await page.waitForLoadState('networkidle')
    // start with screenshot
    await page.screenshot({
      path: join(screenshotsDir, LANDING_PAGE_SCREENSHOT_NAME + '.png'),
      fullPage: true,
    })

    await page.waitForTimeout(500)
    // TODO: Add assertions for your landing page elements
    // Example: await expect(page.getByTestId('auth.login.form')).toBeVisible()

    await expect(page).toHaveTitle(/.+/)
  })

  /**
   * EDIT THIS TEST: Capture your main app page
   *
   * Update this test to:
   * 1. Navigate to your app's actual main page route (e.g., /dashboard, /home)
   * 2. Handle authentication if required
   * 3. Wait for key elements using data-testid selectors
   * 4. Verify the main functionality is visible
   */
  test('captures MainPage screenshot', async ({ page }) => {
    // TODO: Update this route to your app's main page
    await page.goto('/')

    await page.waitForLoadState('networkidle')
    // start with screenshot
    await page.screenshot({
      path: join(screenshotsDir, MAIN_PAGE_SCREENSHOT_NAME + '.png'),
      fullPage: true,
    })

    // TODO: Replace this generic auth handling with your app's actual flow
    // Example for apps with auth:
    const loginButton = page.getByTestId('auth.login.submit')
    if (await loginButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      const emailInput = page.getByTestId('auth.login.email')
      const passwordInput = page.getByTestId('auth.login.password')

      if (await emailInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await emailInput.fill('user@example.com')
      }
      if (await passwordInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await passwordInput.fill('testpassword123')
      }
      await loginButton.click()
      await page.waitForLoadState('networkidle')
    }

    await page.waitForTimeout(500)

    // TODO: Add assertions for your main page elements
    // Example: await expect(page.getByTestId('projects.list')).toBeVisible()

    await expect(page).toHaveTitle(/.+/)
  })
})
