import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {fireEvent} from '@testing-library/dom';

vi.mock('svelte', async () => {
  const actual = await vi.importActual<typeof import('svelte')>('svelte');
  return {...actual, mount: vi.fn(() => ({open: vi.fn()}))};
});
vi.mock('../components/CommandPalette.svelte', () => ({default: {}}));

const {initCommandPalette} = await import('./command-palette.ts');

describe('initCommandPalette', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button data-command-palette-open></button>';
    initCommandPalette();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('Ctrl+K opens the palette', async () => {
    const spy = vi.fn();
    vi.doMock('svelte', () => ({mount: spy}));
    await fireEvent.keyDown(document.body, {key: 'k', ctrlKey: true});
    expect(document.querySelector('[data-command-palette-open]')).toBeTruthy();
  });

  test('Ctrl+K is ignored inside textarea', async () => {
    document.body.innerHTML = '<textarea></textarea>';
    const ta = document.querySelector('textarea')!;
    const ev = new KeyboardEvent('keydown', {key: 'k', ctrlKey: true, bubbles: true, cancelable: true});
    ta.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  test('Ctrl+K is ignored inside .cm-editor', async () => {
    document.body.innerHTML = '<div class="cm-editor"><div contenteditable="true"></div></div>';
    const inner = document.querySelector('[contenteditable]')!;
    const ev = new KeyboardEvent('keydown', {key: 'k', ctrlKey: true, bubbles: true, cancelable: true});
    inner.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
