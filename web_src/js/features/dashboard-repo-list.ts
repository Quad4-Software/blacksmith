import {mount} from 'svelte';

export async function initDashboardRepoList() {
  const el = document.getElementById('dashboard-repo-list');
  if (!el) {
    return;
  }

  const {default: DashboardRepoList} = await import('../components/DashboardRepoList.svelte');
  el.textContent = '';
  mount(DashboardRepoList, {
    target: el,
    props: window.config.pageData.dashboardRepoList as Record<string, unknown>,
  });
}
