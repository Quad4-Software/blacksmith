import {mount} from 'svelte';

export async function initDiffFileTree() {
  const el = document.getElementById('diff-file-tree');
  if (!el) return;

  const {default: DiffFileTree} = await import('../components/DiffFileTree.svelte');
  el.textContent = '';
  mount(DiffFileTree, {target: el});
}
