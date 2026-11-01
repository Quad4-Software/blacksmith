import {mount} from 'svelte';

export async function initRepoBranchTagSelector() {
  for (const [elIndex, elRoot] of document
    .querySelectorAll('.js-branch-tag-selector')
    .entries()) {
    const {default: RepoBranchTagSelector} = await import('../components/RepoBranchTagSelector.svelte');

    elRoot.textContent = '';
    mount(RepoBranchTagSelector, {
      target: elRoot,
      props: window.config.pageData.branchDropdownDataList[elIndex],
    });
  }
}
