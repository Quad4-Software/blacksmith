import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {fireEvent, render} from '@testing-library/svelte';
import CommandPalette from './CommandPalette.svelte';

import {navigate} from '../modules/command-palette-navigate.ts';

vi.mock('../modules/command-palette-navigate.ts', () => ({
  navigate: vi.fn(),
}));

const i18nBackup = window.config?.i18n;

function setupDom({signedIn = true, admin = false, repo = false} = {}) {
  document.body.innerHTML = `
    <nav id="navbar"><div class="navbar-right">
      ${signedIn ? '<form id="logout-user-action"></form>' : ''}
      ${admin ? '<a href="/-/admin">Admin</a>' : ''}
    </div></nav>
    ${repo ? `<div class="repo-header">
      <overflow-menu class="ui secondary menu">
        <div class="overflow-menu-items">
          <a class="item" href="/user2/repo1">Code</a>
          <a class="item" href="/user2/repo1/issues">Issues <span class="ui small label">3</span></a>
          <a class="item" href="/user2/repo1/pulls">Pulls</a>
        </div>
      </overflow-menu>
    </div>` : ''}`;
  window.config = Object.assign(window.config ?? {}, {
    appSubUrl: '',
    i18n: {},
    pageData: {},
  }) as typeof window.config;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  window.config = Object.assign(window.config ?? {}, {i18n: i18nBackup}) as typeof window.config;
});

async function openPalette(props = {}) {
  const view = render(CommandPalette, {props});
  await view.component.open();
  await vi.waitFor(() => expect(document.querySelector('.command-palette')).toBeTruthy());
  return view;
}

describe('CommandPalette', () => {
  test('renders suggested items for signed-in user', async () => {
    setupDom({signedIn: true});
    const {component, unmount} = await openPalette();
    const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
    expect(labels).toContain('Notifications');
    expect(labels).toContain('Dashboard');
    expect(labels).not.toContain('Site administration');
    expect(labels).not.toContain('Sign in / Register');
    await component.close();
    unmount();
  });

  test('anonymous user sees sign in, not notifications', async () => {
    setupDom({signedIn: false});
    const {component, unmount} = await openPalette();
    const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
    expect(labels).toContain('Sign in / Register');
    expect(labels).not.toContain('Notifications');
    await component.close();
    unmount();
  });

  test('admin user sees site administration', async () => {
    setupDom({signedIn: true, admin: true});
    const {component, unmount} = await openPalette();
    const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
    expect(labels).toContain('Site administration');
    await component.close();
    unmount();
  });

  test('repo commands read from DOM and strip counts', async () => {
    setupDom({repo: true});
    const {component, unmount} = await openPalette();
    const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
    expect(labels).toContain('Code');
    expect(labels).toContain('Issues');
    expect(labels).not.toContain('Issues 3');
    await component.close();
    unmount();
  });

  test('typing filters commands', async () => {
    setupDom({});
    const {component, unmount} = await openPalette();
    const input = document.querySelector<HTMLInputElement>('.command-palette-input')!;
    await fireEvent.input(input, {target: {value: 'dash'}});
    await vi.waitFor(() => {
      const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
      expect(labels).toContain('Dashboard');
      expect(labels).not.toContain('Milestones');
    });
    await component.close();
    unmount();
  });

  test('arrow keys move activedescendant and Enter navigates', async () => {
    setupDom({});
    const {component, unmount} = await openPalette();
    const input = document.querySelector<HTMLInputElement>('.command-palette-input')!;
    await fireEvent.input(input, {target: {value: 'dash'}});
    await fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input.getAttribute('aria-activedescendant')).toEqual('cp-opt-0');
    await fireEvent.keyDown(input, {key: 'Enter'});
    expect(navigate).toHaveBeenCalledWith('/', false);
    await component.close();
    unmount();
  });

  test('Ctrl+Enter opens in new tab', async () => {
    setupDom({});
    const {component, unmount} = await openPalette();
    const input = document.querySelector<HTMLInputElement>('.command-palette-input')!;
    await fireEvent.input(input, {target: {value: 'dash'}});
    await fireEvent.keyDown(input, {key: 'Enter', ctrlKey: true});
    expect(navigate).toHaveBeenCalledWith('/', true);
    await component.close();
    unmount();
  });

  test('Esc closes and restores focus', async () => {
    setupDom({});
    const btn = document.createElement('button');
    document.body.append(btn);
    btn.focus();
    const {unmount} = await openPalette();
    const input = document.querySelector<HTMLInputElement>('.command-palette-input')!;
    await fireEvent.keyDown(input, {key: 'Escape'});
    expect(document.querySelector('.command-palette')).toBeNull();
    expect(document.activeElement).toBe(btn);
    unmount();
  });

  test('debounced remote search returns repos and aborts stale', async () => {
    setupDom({});
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      calls.push(String(url));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({data: [{full_name: 'user2/repo1', html_url: 'http://localhost/user2/repo1'}]}),
      });
    }));
    const {component, unmount} = await openPalette();
    const input = document.querySelector<HTMLInputElement>('.command-palette-input')!;
    await fireEvent.input(input, {target: {value: 'repo1'}});
    await vi.waitFor(() => {
      const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
      expect(labels).toContain('user2/repo1');
    });
    expect(calls.some((u) => u.includes('/api/v1/repos/search?q=repo1'))).toBeTruthy();
    await component.close();
    unmount();
  });

  test('failed request does not break palette', async () => {
    setupDom({});
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('boom'))));
    const {component, unmount} = await openPalette();
    const input = document.querySelector<HTMLInputElement>('.command-palette-input')!;
    await fireEvent.input(input, {target: {value: 'repo1'}});
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('.command-palette')).toBeTruthy();
    await component.close();
    unmount();
  });

  test('rejects protocol-relative and off-origin urls in recent', async () => {
    setupDom({});
    localStorage.setItem('blacksmith-command-palette-recent', JSON.stringify([
      {label: 'bad', href: '//evil.example/x'},
      {label: 'scheme', href: 'https://evil.example/x'},
      {label: 'good', href: '/user2/repo1'},
    ]));
    const {component, unmount} = await openPalette();
    const labels = Array.from(document.querySelectorAll('.command-palette-item-label'), (x) => x.textContent);
    expect(labels).toContain('good');
    expect(labels).not.toContain('bad');
    expect(labels).not.toContain('scheme');
    await component.close();
    unmount();
  });
});
