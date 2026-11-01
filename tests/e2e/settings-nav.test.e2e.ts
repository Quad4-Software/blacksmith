// @watch start
// web_src/js/features/settings-nav.ts
// web_src/css/modules/flexcontainer.css
// @watch end

import {expect} from '@playwright/test';
import {login_as_user, login_user, test} from './utils_e2e.ts';

test.beforeAll('login', async ({browser}, workerInfo) => {
  await login_user(browser, workerInfo, 'user2');
});

test('settings nav filter narrows and restores links', async ({browser}, workerInfo) => {
  const page = await login_as_user(browser, workerInfo, 'user2');
  await page.goto('/user/settings');
  const filter = page.locator('.settings-nav-filter');
  await expect(filter).toBeVisible();
  const keysLink = page.locator('.ui.vertical.menu a.item', {hasText: 'SSH / GPG'});
  const profileLink = page.locator('.ui.vertical.menu a.item', {hasText: 'Profile'});
  await filter.fill('key');
  await expect(keysLink).toBeVisible();
  await expect(profileLink).toBeHidden();
  await filter.fill('');
  await expect(keysLink).toBeVisible();
  await expect(profileLink).toBeVisible();
  await page.close();
});
