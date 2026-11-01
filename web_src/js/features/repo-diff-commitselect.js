import {mount} from 'svelte';

export async function initDiffCommitSelect() {
  const el = document.getElementById('diff-commit-select');
  if (!el) return;

  const {default: DiffCommitSelector} = await import('../components/DiffCommitSelector.svelte');
  el.textContent = '';
  mount(DiffCommitSelector, {
    target: el,
    props: {
      issueLink: el.getAttribute('data-issuelink'),
      queryParams: el.getAttribute('data-queryparams'),
      filterChangesByCommit: el.getAttribute('data-filter_changes_by_commit'),
    },
  });
}
