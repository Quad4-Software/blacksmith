import {mount} from 'svelte';

export async function initRepoRecentCommits() {
  const el = document.getElementById('repo-recent-commits-chart');
  if (!el) return;

  const {default: RepoRecentCommits} = await import('../components/RepoRecentCommits.svelte');
  try {
    mount(RepoRecentCommits, {
      target: el,
      props: {
        locale: {
          loadingTitle: el.getAttribute('data-locale-loading-title'),
          loadingTitleFailed: el.getAttribute('data-locale-loading-title-failed'),
          recentCommitsTitle: el.getAttribute('data-locale-recent-commits-title'),
          loadingInfo: el.getAttribute('data-locale-loading-info'),
        },
      },
    });
  } catch (err) {
    console.error('RepoRecentCommits failed to load', err);
    el.textContent = el.getAttribute('data-locale-component-failed-to-load');
  }
}
