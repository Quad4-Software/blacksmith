// Copyright 2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import {tick} from 'svelte';

vi.mock('chart.js', async (importOriginal) => {
  const {fakeChartModule} = await import('./chart-test-mock.ts');
  return fakeChartModule(await importOriginal());
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- an expect-error would fail in svelte-check where the exports are visible
// @ts-ignore component instance exports are not visible to the *.svelte wildcard
const {default: RepoActivityTopAuthors, calcImageSizeAndShift} = await import('./RepoActivityTopAuthors.svelte');
const {chartInstances, resetChartInstances} = await import('./chart-test-mock.ts');

describe('calcImageSizeAndShift', () => {
  test('calc image size and shift', () => {
    expect(calcImageSizeAndShift({naturalWidth: 50, naturalHeight: 50})).toEqual([20, 20, 0, 0]);
    expect(calcImageSizeAndShift({naturalWidth: 5, naturalHeight: 50})).toEqual([2, 20, 9, 0]);
    expect(calcImageSizeAndShift({naturalWidth: 500, naturalHeight: 5})).toEqual([20, 0.2, 0, 9.9]);
  });
});

describe('RepoActivityTopAuthors', () => {
  beforeEach(() => {
    resetChartInstances();
    window.config.pageData.repoActivityTopAuthors = [
      {avatar_link: '/a1.png', commits: 7, home_link: '/user1', login: 'user1', name: 'User One'},
      {avatar_link: '/a2.png', commits: 3, home_link: '', login: 'user2', name: 'User Two'},
    ];
  });

  afterEach(() => {
    delete window.config.pageData.repoActivityTopAuthors;
  });

  test('renders the style probe and a bar chart canvas', async () => {
    const {container} = render(RepoActivityTopAuthors, {props: {locale: {commitActivity: 'Commits'}}});
    await tick();
    expect(container.querySelector('.activity-bar-graph')).toBeTruthy();
    const canvas = container.querySelector('canvas');
    expect(canvas.getAttribute('role')).toEqual('img');
    expect(canvas.getAttribute('height')).toEqual('150px');
    expect(chartInstances).toHaveLength(1);
    expect(chartInstances[0].config.type).toEqual('bar');
  });

  test('passes authors to the chart data', async () => {
    render(RepoActivityTopAuthors, {props: {locale: {commitActivity: 'Commit activity'}}});
    await tick();
    const {data} = chartInstances[0].config;
    expect(data.labels).toEqual(['User One', 'User Two']);
    expect(data.datasets[0].data).toEqual([7, 3]);
    expect(data.datasets[0].label).toEqual('Commit activity');
  });

  test('takes the bar color from the style probe', async () => {
    const style = document.createElement('style');
    style.textContent = '.activity-bar-graph {background-color: rgb(1, 2, 3);}';
    document.head.append(style);
    try {
      render(RepoActivityTopAuthors, {props: {locale: {commitActivity: ''}}});
      await vi.waitFor(() => expect(chartInstances[0].config.data.datasets[0].backgroundColor).toEqual('rgb(1, 2, 3)'));
      expect(chartInstances[0].updateCount).toBeGreaterThan(0);
    } finally {
      style.remove();
    }
  });

  test('registers the image label plugin', async () => {
    render(RepoActivityTopAuthors, {props: {locale: {commitActivity: ''}}});
    await tick();
    expect(chartInstances[0].config.plugins.map((p: {id: string}) => p.id)).toContain('image_label');
  });

  test('renders with no authors', async () => {
    delete window.config.pageData.repoActivityTopAuthors;
    render(RepoActivityTopAuthors, {props: {locale: {commitActivity: ''}}});
    await tick();
    expect(chartInstances[0].config.data.labels).toEqual([]);
  });

  test('destroys the chart on unmount', async () => {
    const {unmount} = render(RepoActivityTopAuthors, {props: {locale: {commitActivity: ''}}});
    await tick();
    unmount();
    expect(chartInstances[0].destroyed).toBe(true);
  });
});
