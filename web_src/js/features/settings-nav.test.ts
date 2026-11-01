import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {initSettingsNav} from './settings-nav.ts';

function makeNav(count = 8) {
  const nav = document.createElement('div');
  nav.className = 'flex-container-nav';
  const links = Array.from({length: count}, (_, i) => `<a class="item" href="/s/${i}">Setting ${i}</a>`).join('');
  nav.innerHTML = `<div class="ui vertical menu"><div class="header item">Header</div>${links}
    <details class="item toggleable-item"><summary>Group</summary><div class="menu"><a class="item" href="/g/1">Keys</a></div></details></div>`;
  document.body.append(nav);
  return nav;
}

function stubMatchMedia(matches = false) {
  const listeners = new Set<(e: {matches: boolean}) => void>();
  const mq = {
    matches,
    addEventListener: (_: string, cb: (e: {matches: boolean}) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: unknown) => listeners.delete(cb as never),
    fire: (m: boolean) => { mq.matches = m; for (const cb of listeners) cb({matches: m}); },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mq));
  return mq;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.config = Object.assign(window.config ?? {}, {i18n: {}}) as typeof window.config;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settings nav filter', () => {
  test('injects input only when >= 6 links', () => {
    const nav = makeNav(8);
    initSettingsNav();
    expect(nav.querySelector('.settings-nav-filter')).toBeTruthy();
  });

  test('no filter for small menus', () => {
    const nav = makeNav(3);
    initSettingsNav();
    expect(nav.querySelector('.settings-nav-filter')).toBeNull();
  });

  test('filters links, opens matching details, restores state on clear', () => {
    const nav = makeNav(8);
    initSettingsNav();
    const input = nav.querySelector<HTMLInputElement>('.settings-nav-filter');
    const details = nav.querySelector('details');
    expect(details.open).toBe(false);
    input.value = 'Keys';
    input.dispatchEvent(new Event('input'));
    expect(details.open).toBe(true);
    expect(nav.querySelectorAll('a.item:not([hidden])').length).toBeGreaterThan(0);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(details.open).toBe(false);
  });

  test('shows no-match message', () => {
    const nav = makeNav(8);
    initSettingsNav();
    const input = nav.querySelector<HTMLInputElement>('.settings-nav-filter');
    input.value = 'zzzzzz';
    input.dispatchEvent(new Event('input'));
    expect(nav.querySelector<HTMLElement>('.settings-nav-no-match').hidden).toBe(false);
  });

  test('Esc clears', () => {
    const nav = makeNav(8);
    initSettingsNav();
    const input = nav.querySelector<HTMLInputElement>('.settings-nav-filter');
    input.value = 'zzz';
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(input.value).toEqual('');
  });

  test('Enter navigates to first visible link', () => {
    const nav = makeNav(8);
    initSettingsNav();
    const input = nav.querySelector<HTMLInputElement>('.settings-nav-filter');
    input.value = 'Setting 3';
    input.dispatchEvent(new Event('input'));
    const spy = vi.spyOn(window, 'location', 'get').mockReturnValue({href: ''} as never);
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(spy).toHaveBeenCalled();
  });
});

describe('mobile toggle', () => {
  test('toggle appears on mobile with aria-expanded and active label', () => {
    stubMatchMedia(true);
    const nav = makeNav(8);
    nav.querySelector('a.item').classList.add('active');
    initSettingsNav();
    const btn = nav.querySelector<HTMLButtonElement>('.settings-nav-toggle');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toEqual('Setting 0');
    expect(btn.getAttribute('aria-expanded')).toEqual('false');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toEqual('true');
  });

  test('removed when resizing to desktop', () => {
    const mq = stubMatchMedia(true);
    const nav = makeNav(8);
    initSettingsNav();
    mq.fire(false);
    expect(nav.querySelector('.settings-nav-toggle')).toBeNull();
  });
});
