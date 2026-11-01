import {mount} from 'svelte';

export async function initRepoActivityTopAuthorsChart() {
  const el = document.getElementById('repo-activity-top-authors-chart');
  if (!el) {
    return;
  }

  const {default: RepoActivityTopAuthors} = await import('../components/RepoActivityTopAuthors.svelte');
  mount(RepoActivityTopAuthors, {
    target: el,
    props: {
      locale: {
        commitActivity: el.getAttribute('data-locale-commit-activity'),
      },
    },
  });
}
