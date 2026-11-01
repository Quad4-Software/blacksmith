import {mount} from 'svelte';

export async function initRepoContributors() {
  const el = document.getElementById('repo-contributors-chart');
  if (!el) return;

  const {default: RepoContributors} = await import('../components/RepoContributors.svelte');
  try {
    mount(RepoContributors, {
      target: el,
      props: {
        repoLink: el.getAttribute('data-repo-link'),
        repoDefaultBranchName: el.getAttribute('data-repo-default-branch-name'),
        locale: {
          filterLabel: el.getAttribute('data-locale-filter-label'),
          contributionType: {
            commits: el.getAttribute('data-locale-contribution-type-commits'),
            additions: el.getAttribute('data-locale-contribution-type-additions'),
            deletions: el.getAttribute('data-locale-contribution-type-deletions'),
          },
          contributorsTitle: el.getAttribute('data-locale-contributors-title'),
          contributorsBetweenTitle: el.getAttribute('data-locale-contributors-between-title'),
          contributorsSinceTitle: el.getAttribute('data-locale-contributors-since-title'),
          loadingTitle: el.getAttribute('data-locale-loading-title'),
          loadingTitleFailed: el.getAttribute('data-locale-loading-title-failed'),
          loadingInfo: el.getAttribute('data-locale-loading-info'),
        },
      },
    });
  } catch (err) {
    console.error('RepoContributors failed to load', err);
    el.textContent = el.getAttribute('data-locale-component-failed-to-load');
  }
}
