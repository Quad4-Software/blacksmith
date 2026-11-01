import {mount} from 'svelte';

export async function initRepoCodeFrequency() {
  const el = document.getElementById('repo-code-frequency-chart');
  if (!el) return;

  const {default: RepoCodeFrequency} = await import('../components/RepoCodeFrequency.svelte');
  try {
    mount(RepoCodeFrequency, {
      target: el,
      props: {
        locale: {
          loadingTitle: el.getAttribute('data-locale-loading-title'),
          loadingTitleFailed: el.getAttribute('data-locale-loading-title-failed'),
          loadingInfo: el.getAttribute('data-locale-loading-info'),
          codeFrequencyTitle: el.getAttribute('data-locale-code-frequency-title'),
        },
      },
    });
  } catch (err) {
    console.error('RepoCodeFrequency failed to load', err);
    el.textContent = el.getAttribute('data-locale-component-failed-to-load');
  }
}
