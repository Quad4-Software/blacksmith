<script lang="ts">
import {tick} from 'svelte';
import {useEventListener, watch} from 'runed';
import SvgIcon from './SvgIcon.svelte';
import {pathEscapeSegments} from '../utils/url.ts';
import {showErrorToast} from '../modules/toast.ts';
import {GET} from '../modules/fetch.ts';

interface Item {
  name: string;
  url: string;
  branch: boolean;
  tag: boolean;
  selected: boolean;
}

type Mode = 'branches' | 'tags';

// the props are provided by the init code from window.config.pageData.branchDropdownDataList
interface Props {
  textReleaseCompare?: string;
  textCreateTag?: string;
  textCreateBranch?: string;
  textCreateBranchFrom?: string;
  textBranches?: string;
  textTags?: string;
  textDefaultBranchLabel?: string;
  mode?: Mode;
  showBranchesInDropdown?: boolean;
  searchFieldPlaceholder?: string;
  branchForm?: string;
  disableCreateBranch?: boolean;
  setAction?: boolean;
  submitForm?: boolean;
  viewType?: 'tree' | 'branch' | 'tag';
  commitIdShort?: string;
  tagName?: string;
  branchName?: string;
  noTag?: boolean;
  defaultSelectedRefName?: string;
  repoDefaultBranch?: string;
  enableFeed?: boolean;
  rssURLPrefix?: string;
  branchURLPrefix?: string;
  branchURLSuffix?: string;
  tagURLPrefix?: string;
  tagURLSuffix?: string;
  repoLink?: string;
  treePath?: string;
  branchNameSubURL?: string;
  noResults?: string;
  release?: {tagName: string} | null;
}

const {
  textReleaseCompare,
  textCreateTag,
  textCreateBranch,
  textCreateBranchFrom,
  textBranches,
  textTags,
  textDefaultBranchLabel,
  mode: initialMode = 'branches',
  showBranchesInDropdown,
  searchFieldPlaceholder,
  branchForm,
  disableCreateBranch,
  setAction,
  submitForm,
  viewType,
  commitIdShort,
  tagName,
  branchName,
  noTag,
  defaultSelectedRefName,
  repoDefaultBranch,
  enableFeed,
  rssURLPrefix,
  branchURLPrefix,
  branchURLSuffix,
  tagURLPrefix,
  tagURLSuffix,
  repoLink,
  treePath,
  branchNameSubURL,
  noResults,
  release = null,
}: Props = $props();

let items = $state<Item[]>([]);
let searchTerm = $state('');
let menuVisible = $state(false);
let mode = $derived<Mode>(initialMode);
let viewKind = $derived<'tree' | 'branch' | 'tag'>(viewType === 'tree' || viewType === 'branch' ? viewType : 'tag');
let refNameText = $derived(viewType === 'tree' ? commitIdShort : viewType === 'branch' ? branchName : tagName);
const isViewBranch = $derived(viewKind === 'branch');
const isViewTag = $derived(viewKind === 'tag');
let cursor = $state(0);
let navigated = $state(false);
let isLoading = $state(false);
// This means whether branch list/tag list has initialized
const hasListInitialized = $state({branches: false, tags: false});

let rootEl: HTMLElement;
let searchField: HTMLInputElement;
let scrollContainer: HTMLElement;
let newBranchForm = $state<HTMLFormElement>();

const filteredItems = $derived(items.filter((item) => {
  return ((mode === 'branches' && item.branch) || (mode === 'tags' && item.tag)) &&
    (!searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()));
}));

const showCreateNewBranch = $derived.by(() => {
  if (disableCreateBranch || !searchTerm) {
    return false;
  }
  return !items.some((item) => item.name.toLowerCase() === searchTerm.toLowerCase());
});

const active = $derived(navigated ? cursor : (!filteredItems.length && showCreateNewBranch ? 0 : -1));
const showNoResults = $derived(!filteredItems.length && !showCreateNewBranch);
const formActionUrl = $derived(`${repoLink}/branches/_new/${branchNameSubURL}`);
const shouldCreateTag = $derived(mode === 'tags');

useEventListener(() => document.body, 'click', (event) => {
  if (rootEl.contains(event.target as Node)) return;
  if (menuVisible) {
    menuVisible = false;
  }
});

watch(() => menuVisible, (visible) => {
  if (visible) {
    resetCursor();
    focusSearchField();
    fetchBranchesOrTags();
  }
}, {lazy: true});

function resetCursor() {
  cursor = 0;
  navigated = false;
}

function setFormInputValue(form: string, name: string, value: string) {
  for (const input of document.querySelectorAll<HTMLInputElement>(`#${form} input[name="${name}"]`)) {
    input.value = value;
  }
}

function selectItem(item: Item) {
  const prev = getSelected();
  if (prev !== null) {
    prev.selected = false;
  }
  item.selected = true;
  const url = (item.tag) ? tagURLPrefix + item.url + tagURLSuffix : branchURLPrefix + item.url + branchURLSuffix;
  if (!branchForm) {
    window.location.href = url;
  } else {
    refNameText = item.name;
    if (setAction) {
      document.getElementById(branchForm)?.setAttribute('action', url);
    } else {
      setFormInputValue(branchForm, 'refURL', url);
    }
    setFormInputValue(branchForm, 'ref', item.name);
    if (item.tag) {
      viewKind = 'tag';
      setFormInputValue(branchForm, 'refType', 'tag');
    } else {
      viewKind = 'branch';
      setFormInputValue(branchForm, 'refType', 'branch');
    }
    if (submitForm) {
      (document.getElementById(branchForm) as HTMLFormElement).requestSubmit();
    }
    menuVisible = false;
  }
}

function createNewBranch() {
  if (!showCreateNewBranch) return;
  newBranchForm.requestSubmit();
}

function focusSearchField() {
  tick().then(() => {
    searchField.focus();
  });
}

function getSelected() {
  return items.find((item) => item.selected) ?? null;
}

function scrollToActive() {
  const el = Array.from(scrollContainer.children).filter((child) => child.classList.contains('item'))[cursor] as HTMLElement | undefined;
  if (!el) return;

  if (el.offsetTop < scrollContainer.scrollTop) {
    scrollContainer.scrollTop = el.offsetTop;
  } else if (el.offsetTop + el.clientHeight > scrollContainer.scrollTop + scrollContainer.clientHeight) {
    scrollContainer.scrollTop = el.offsetTop + el.clientHeight - scrollContainer.clientHeight;
  }
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();

    if (cursor + (showCreateNewBranch ? 0 : 1) >= filteredItems.length) {
      return;
    }
    cursor++;
    navigated = true;
    scrollToActive();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();

    if (cursor <= 0) {
      return;
    }
    cursor--;
    navigated = true;
    scrollToActive();
  } else if (event.key === 'Enter') {
    event.preventDefault();

    if (cursor >= filteredItems.length) {
      createNewBranch();
    } else if (cursor >= 0) {
      selectItem(filteredItems[cursor]);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    menuVisible = false;
  }
}

function handleTabSwitch(newMode: Mode) {
  if (isLoading) return;
  mode = newMode;
  focusSearchField();
  fetchBranchesOrTags();
}

async function fetchBranchesOrTags() {
  if (!['branches', 'tags'].includes(mode) || isLoading) return;
  // only fetch when branch/tag list has not been initialized
  if (hasListInitialized[mode] ||
    (mode === 'branches' && !showBranchesInDropdown) ||
    (mode === 'tags' && noTag)
  ) {
    return;
  }
  isLoading = true;
  const fetchedMode = mode;
  try {
    const resp = await GET(`${repoLink}/${fetchedMode}/list`);
    const {results} = await resp.json();
    for (const result of results) {
      let selected = false;
      if (fetchedMode === 'branches') {
        selected = result === defaultSelectedRefName;
      } else {
        selected = result === (release ? release.tagName : defaultSelectedRefName);
      }
      items.push({name: result, url: pathEscapeSegments(result), branch: fetchedMode === 'branches', tag: fetchedMode === 'tags', selected});
    }
    hasListInitialized[fetchedMode] = true;
  } catch (e) {
    showErrorToast(`Network error when fetching ${fetchedMode}, error: ${e}`);
  } finally {
    isLoading = false;
  }
}
</script>

<div class="ui dropdown custom" bind:this={rootEl}>
  <button class="branch-dropdown-button gt-ellipsis ui basic small compact button tw:flex tw:m-0" onclick={() => { menuVisible = !menuVisible }} onkeyup={(e) => { if (e.key === 'Enter') menuVisible = !menuVisible }}>
    <span class="text tw:flex tw:items-center tw:mr-1 gt-ellipsis">
      {#if release}
        {textReleaseCompare}
      {:else}
        {#if isViewTag}
          <SvgIcon name="octicon-tag"/>
        {:else if isViewBranch}
          <SvgIcon name="octicon-git-branch"/>
        {:else}
          <SvgIcon name="octicon-git-commit"/>
        {/if}
        <strong class="tw:ml-2 tw:inline-block gt-ellipsis">{refNameText}</strong>
      {/if}
    </span>
    <SvgIcon name="octicon-triangle-down" size={14} class="dropdown icon"/>
  </button>
  <div class={['menu', 'transition', {visible: menuVisible}]} style:display={menuVisible ? null : 'none'}>
    <div class="ui icon search input">
      <i class="icon"><SvgIcon name="octicon-filter" size={16}/></i>
      <input name="search" autocomplete="off" bind:this={searchField} bind:value={searchTerm} oninput={resetCursor} onkeydown={keydown} placeholder={searchFieldPlaceholder}>
    </div>
    {#if showBranchesInDropdown}
      <div class="branch-tag-tab">
        <!-- the href keeps the link focusable and styled like before, the tab switch itself is done by the click handler -->
        <!-- svelte-ignore a11y_invalid_attribute -->
        <a class={['branch-tag-item', 'muted', {active: mode === 'branches'}]} href="#" onclick={() => handleTabSwitch('branches')}>
          <SvgIcon name="octicon-git-branch" size={16}/>{textBranches}
        </a>{#if !noTag}
          <!-- svelte-ignore a11y_invalid_attribute -->
          <a class={['branch-tag-item', 'muted', {active: mode === 'tags'}]} href="#" onclick={() => handleTabSwitch('tags')}>
            <SvgIcon name="octicon-tag" size={16}/>{textTags}
          </a>{/if}
      </div>
    {/if}
    <div class="branch-tag-divider"></div>
    <div class="scrolling menu" bind:this={scrollContainer}>
      <SvgIcon name="octicon-rss" symbolId="svg-symbol-octicon-rss"/>
      {#if isLoading}
        <div class="loading-indicator is-loading"></div>
      {/if}
      {#each filteredItems as item, index (item.name)}
        <!-- the keyboard interaction is handled by the search field above, the list items are intentionally not focusable -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class={['item', {selected: item.selected, active: active === index}]} onclick={() => selectItem(item)}>
          {item.name}
          {#if item.name === repoDefaultBranch && mode === 'branches'}
            <div class="ui label">
              {textDefaultBranchLabel}
            </div>
          {/if}<a role="button" class="rss-icon tw:float-right" href={rssURLPrefix + item.url} target="_blank" style:display={enableFeed && mode === 'branches' ? null : 'none'} onclick={(e) => e.stopPropagation()}>
            <!-- creating a lot of components is pretty slow, so we use a static SVG here -->
            <svg width="14" height="14" class="svg octicon-rss"><use href="#svg-symbol-octicon-rss"/></svg>
          </a>
        </div>
      {/each}
      {#if showCreateNewBranch}
        <div class={['item', {active: active === filteredItems.length}]}>
          <!-- the href keeps the link focusable and styled like before, the form submit is done by the click handler -->
          <!-- svelte-ignore a11y_invalid_attribute -->
          <a href="#" onclick={createNewBranch}>
            <div style:display={shouldCreateTag ? null : 'none'}>
              <i class="reference tags icon"></i><span>{textCreateTag.replace('%s', searchTerm)}</span>
            </div><div style:display={!shouldCreateTag ? null : 'none'}>
              <SvgIcon name="octicon-git-branch"/><span>{textCreateBranch.replace('%s', searchTerm)}</span>
            </div><div class="text small">
              {#if isViewBranch || release}
                <span>{textCreateBranchFrom.replace('%s', branchName)}</span>
              {:else if isViewTag}
                <span>{textCreateBranchFrom.replace('%s', tagName)}</span>
              {:else}
                <span>{textCreateBranchFrom.replace('%s', commitIdShort)}</span>
              {/if}
            </div>
          </a>
          <form bind:this={newBranchForm} action={formActionUrl} method="post">
            <input type="hidden" name="new_branch_name" value={searchTerm}>
            <input type="hidden" name="create_tag" value={shouldCreateTag}>
            {#if treePath}
              <input type="hidden" name="current_path" value={treePath}>
            {/if}
          </form>
        </div>
      {/if}
    </div>
    {#if showNoResults && !isLoading}
      <div class="message">
        {noResults}
      </div>
    {/if}
  </div>
</div>

<style>
.branch-tag-item.active {
  border-color: var(--color-secondary);
  background: var(--color-menu);
  border-start-start-radius: var(--border-radius);
  border-start-end-radius: var(--border-radius);
}

.branch-tag-divider {
  margin-top: -1px !important;
  border-top: 1px solid var(--color-secondary);
}

.scrolling.menu {
  border-top: none !important;
}

.menu .item .rss-icon {
  display: none; /* only show RSS icon on hover */
}

.menu .item:hover .rss-icon {
  display: inline-block;
}

.scrolling.menu .loading-indicator {
  height: 4em;
}
</style>
