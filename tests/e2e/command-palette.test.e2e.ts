// @watch start
// web_src/js/features/command-palette.ts
// web_src/js/components/CommandPalette.svelte
// templates/base/head_navbar.tmpl
// @watch end

import {expect} from '@playwright/test';
import {login_as_user, login_user, test} from './utils_e2e.ts';

test.beforeAll('login', async ({browser}, workerInfo) => {
  await login_user(browser, workerInfo, 'user2');
});

test('command palette opens with Ctrl+K, searches, navigates', async ({browser}, workerInfo) => {
  const page = await login_as_user(browser, workerInfo, 'user2');
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const dialog = page.locator('.command-palette');
  await expect(dialog).toBeVisible();
  const input = page.locator('.command-palette-input');
  await expect(input).toBeFocused();

  await input.fill('repo1');
  const option = page.locator('.command-palette-item', {hasText: 'user2/repo1'}).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/user2\/repo1\/?$/);
  await page.close();
});

test('command palette Esc closes and navbar button opens', async ({browser}, workerInfo) => {
  const page = await login_as_user(browser, workerInfo, 'user2');
  await page.goto('/');
  await page.locator('.navbar-right [data-command-palette-open]').first().click();
  await expect(page.locator('.command-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-palette')).toBeHidden();
  await page.close();
});

test('command palette Ctrl+K ignored in text inputs', async ({browser}, workerInfo) => {
  const page = await login_as_user(browser, workerInfo, 'user2');
  await page.goto('/user2/repo1/issues');
  const input = page.locator('input[type=search], input[name=q]').first();
  await input.click();
  await page.keyboard.press('Control+k');
  await expect(page.locator('.command-palette')).toBeHidden();
  await page.close();
});
