import {mount} from 'svelte';

export async function initRepoPullRequestMergeForm() {
  const el = document.getElementById('pull-request-merge-form');
  if (!el) return;

  const {default: PullRequestMergeForm} = await import('../components/PullRequestMergeForm.svelte');
  el.textContent = '';
  mount(PullRequestMergeForm, {
    target: el,
    props: {mergeForm: window.config.pageData.pullRequestMergeForm},
  });
}
