// @watch start
// templates/status/403.tmpl
// templates/status/404.tmpl
// web_src/css/base.css
// @watch end

import {expect} from '@playwright/test';
import {login_as_user, login_user, test} from './utils_e2e.ts';

test.beforeAll('login', async ({browser}, workerInfo) => {
  await login_user(browser, workerInfo, 'user2');
});

test('anonymous 404 page renders styled page with links', async ({browser}, workerInfo) => {
  const page = await (await browser.newContext(await workerInfo.project.use.contextOptions)).newPage();
  const resp = await page.goto('/this-page-does-not-exist-at-all');
  expect(resp.status()).toBe(404);
  await expect(page.locator('h1.error-code')).toHaveText('404');
  await expect(page.locator('.status-page-title')).toHaveText('Page not found');
  await expect(page.locator('.status-page-actions a[href*="/user/login"]')).toBeVisible();
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.close();
});

test('signed-in non-admin sees 403 page on /admin', async ({browser}, workerInfo) => {
  const page = await login_as_user(browser, workerInfo, 'user2');
  const resp = await page.goto('/admin');
  expect(resp.status()).toBe(403);
  await expect(page.locator('h1.error-code')).toHaveText('403');
  await expect(page.locator('.status-page-title')).toHaveText('Forbidden');
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.close();
});
