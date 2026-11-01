import {mount} from 'svelte';

interface PaletteInstance {
  open: () => Promise<void>;
}

let instance: PaletteInstance | undefined;
let loading: Promise<PaletteInstance> | undefined;

export {navigate} from '../modules/command-palette-navigate.ts';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('textarea, input, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .CodeMirror, markdown-toolbar'));
}

async function openPalette() {
  instance ??= await (loading ??= (async () => {
    const {default: CommandPalette} = await import('../components/CommandPalette.svelte');
    const host = document.createElement('div');
    document.body.append(host);
    return mount(CommandPalette, {target: host}) as unknown as PaletteInstance;
  })());
  instance.open();
}

export function initCommandPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      openPalette();
    }
  });
  for (const el of document.querySelectorAll('[data-command-palette-open]')) {
    el.addEventListener('click', () => {
      openPalette();
    });
  }
}
