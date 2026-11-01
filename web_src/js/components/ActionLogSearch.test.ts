// Copyright 2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render} from '@testing-library/svelte';
import ActionLogSearch from './ActionLogSearch.svelte';
import {applyHighlights, clearHighlights, supportsHighlightApi} from '../modules/action-log-search.ts';

vi.mock('../modules/action-log-search.ts', async (importOriginal) => ({
  ...(await importOriginal() as object),
  applyHighlights: vi.fn(),
  clearHighlights: vi.fn(),
  supportsHighlightApi: vi.fn(() => true),
}));

let rootEl: HTMLElement;

function line(id: string, text: string, collapsed = false) {
  const msg = collapsed ?
    `<details class="log-msg"><summary>group</summary><span class="log-msg">${text}</span></details>` :
    `<span class="log-msg">${text}</span>`;
  return `<div class="job-log-line" id="${id}"><a class="line-num">${id.split('-').pop()}</a><span class="log-time-stamp">00:01</span>${msg}</div>`;
}

function setup(html: string, props: Record<string, unknown> = {}) {
  rootEl = document.createElement('div');
  rootEl.innerHTML = html;
  document.body.append(rootEl);
  const defaults = {root: rootEl, unloadedSteps: 0, refreshKey: 0, onclose: vi.fn(), onloadall: vi.fn()};
  return render(ActionLogSearch, {props: {...defaults, ...props}});
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  rootEl?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function typeSearch(container: Element, q: string) {
  const input = container.querySelector<HTMLInputElement>('.action-log-search-input');
  await fireEvent.input(input, {target: {value: q}});
  vi.advanceTimersByTime(160);
  await vi.waitFor(() => {});
}

describe('ActionLogSearch', () => {
  test('debounce then counter "1 of N"', async () => {
    const {container} = setup(line('jobstep-1-1', 'foo bar') + line('jobstep-1-2', 'foo again'));
    await typeSearch(container, 'foo');
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('1 of 2');
    expect(applyHighlights).toHaveBeenCalledWith(expect.any(Array), 0);
  });

  test('shows "No matches"', async () => {
    const {container} = setup(line('jobstep-1-1', 'foo'));
    await typeSearch(container, 'zzz');
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('No matches');
  });

  test('next/prev wrap and update active index', async () => {
    const {container} = setup(line('jobstep-1-1', 'foo') + line('jobstep-1-2', 'foo'));
    await typeSearch(container, 'foo');
    const nextBtn = container.querySelector('button[aria-label="Next match"]');
    const prevBtn = container.querySelector('button[aria-label="Previous match"]');
    await fireEvent.click(nextBtn);
    expect(applyHighlights).toHaveBeenLastCalledWith(expect.any(Array), 1);
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('2 of 2');
    await fireEvent.click(nextBtn);
    expect(applyHighlights).toHaveBeenLastCalledWith(expect.any(Array), 0);
    await fireEvent.click(prevBtn);
    expect(applyHighlights).toHaveBeenLastCalledWith(expect.any(Array), 1);
  });

  test('case toggle changes count and aria-pressed', async () => {
    const {container} = setup(line('jobstep-1-1', 'Foo foo'));
    await typeSearch(container, 'foo');
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('1 of 2');
    const toggle = container.querySelector('button[aria-label="Match case"]');
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toEqual('true');
    await vi.waitFor(() => {});
    vi.advanceTimersByTime(160);
    await vi.waitFor(() => {});
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('1 of 1');
  });

  test('Enter and Shift+Enter navigate, Esc calls onclose', async () => {
    const onclose = vi.fn();
    const {container} = setup(line('jobstep-1-1', 'foo') + line('jobstep-1-2', 'foo'), {onclose});
    await typeSearch(container, 'foo');
    const input = container.querySelector('.action-log-search-input');
    await fireEvent.keyDown(input, {key: 'Enter'});
    expect(applyHighlights).toHaveBeenLastCalledWith(expect.any(Array), 1);
    await fireEvent.keyDown(input, {key: 'Enter', shiftKey: true});
    expect(applyHighlights).toHaveBeenLastCalledWith(expect.any(Array), 0);
    await fireEvent.keyDown(input, {key: 'Escape'});
    expect(onclose).toHaveBeenCalledOnce();
  });

  test('opens collapsed details ancestors and scrolls the line', async () => {
    const {container} = setup(line('jobstep-1-1', 'foo', true));
    await typeSearch(container, 'foo');
    expect(rootEl.querySelector('details.log-msg').hasAttribute('open')).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test('unloadedSteps note only with query, Load all calls onloadall', async () => {
    const onloadall = vi.fn();
    const {container} = setup(line('jobstep-1-1', 'foo'), {unloadedSteps: 2, onloadall});
    expect(container.querySelector('.action-log-search-unloaded')).toBeNull();
    await typeSearch(container, 'foo');
    const note = container.querySelector('.action-log-search-unloaded');
    expect(note.textContent).toContain('2 steps not loaded');
    await fireEvent.click(note.querySelector('.action-log-search-loadall'));
    expect(onloadall).toHaveBeenCalledOnce();
  });

  test('refreshKey re-runs the search and clamps the active index', async () => {
    const {container, rerender} = setup(line('jobstep-1-1', 'foo') + line('jobstep-1-2', 'foo'));
    await typeSearch(container, 'foo');
    await fireEvent.click(container.querySelector('button[aria-label="Next match"]'));
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('2 of 2');
    rootEl.querySelector('#jobstep-1-2 .log-msg').textContent = 'gone';
    await rerender({root: rootEl, unloadedSteps: 0, refreshKey: 1, onclose: vi.fn(), onloadall: vi.fn()});
    await vi.waitFor(() => {});
    vi.advanceTimersByTime(160);
    await vi.waitFor(() => {});
    expect(container.querySelector('.action-log-search-count').textContent).toEqual('1 of 1');
    expect(applyHighlights).toHaveBeenLastCalledWith(expect.any(Array), 0);
  });

  test('fallback class path when Highlight API is unsupported', async () => {
    (supportsHighlightApi as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const {container} = setup(line('jobstep-1-1', 'foo') + line('jobstep-1-2', 'foo'));
    await typeSearch(container, 'foo');
    expect(applyHighlights).not.toHaveBeenCalled();
    expect(rootEl.querySelector('#jobstep-1-1.action-log-search-active-line')).toBeTruthy();
    await fireEvent.click(container.querySelector('button[aria-label="Next match"]'));
    expect(rootEl.querySelector('#jobstep-1-1.action-log-search-active-line')).toBeNull();
    expect(rootEl.querySelector('#jobstep-1-2.action-log-search-active-line')).toBeTruthy();
  });

  test('unmount clears highlights', async () => {
    const {container, unmount} = setup(line('jobstep-1-1', 'foo'));
    await typeSearch(container, 'foo');
    unmount();
    expect(clearHighlights).toHaveBeenCalled();
  });
});
