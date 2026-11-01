import {expect, test, vi} from 'vitest';

test('diffTreeStore returns pageData state as a lazy singleton', async () => {
  vi.resetModules();
  window.config.pageData.diffFileInfo = {a: 1};
  const {diffTreeStore} = await import('./stores.svelte.ts');
  const store = diffTreeStore();
  expect(store.a).toEqual(1);
  expect(diffTreeStore()).toBe(store);
  expect(window.config.pageData.diffFileInfo).toBe(store);
});

test('diffTreeStore writes the state object back to pageData', async () => {
  vi.resetModules();
  window.config.pageData.diffFileInfo = {b: 2};
  const {diffTreeStore} = await import('./stores.svelte.ts');
  const store = diffTreeStore();
  store.b = 3;
  expect((window.config.pageData.diffFileInfo as {b: number}).b).toEqual(3);
});
