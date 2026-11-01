<script lang="ts">
import {tick} from 'svelte';
import {useEventListener} from 'runed';
import SvgIcon from './SvgIcon.svelte';
import {GET} from '../modules/fetch.ts';

interface Commit {
  id: string;
  summary: string;
  committer_or_author_name: string;
  time: string;
  short_sha: string;
  hovered?: boolean;
  selected?: boolean;
}

interface Props {
  issueLink: string;
  queryParams: string;
  filterChangesByCommit: string;
}

const {issueLink, queryParams, filterChangesByCommit}: Props = $props();

let rootEl = $state<HTMLElement>();
let menuVisible = $state(false);
let isLoading = $state(false);
let locale = $state<Record<string, string>>({});
let commits = $state<Commit[]>([]);
let hoverActivated = $state(false);
let lastReviewCommitSha = $state<string | null>(null);

const commitsSinceLastReview = $derived.by(() => {
  if (lastReviewCommitSha) {
    return commits.length - commits.findIndex((x) => x.id === lastReviewCommitSha) - 1;
  }
  return 0;
});

useEventListener(() => document.body, 'click', onBodyClick);
useEventListener(() => rootEl, 'keydown', onKeyDown);
useEventListener(() => rootEl, 'keyup', onKeyUp);

function onBodyClick(event: MouseEvent) {
  // close this menu on click outside of this element when the dropdown is currently visible opened
  if (rootEl.contains(event.target as Node)) return;
  if (menuVisible) {
    toggleMenu();
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (!menuVisible) return;
  const item = document.activeElement as HTMLElement;
  if (!rootEl.contains(item)) return;
  switch (event.key) {
    case 'ArrowDown': // select next element
      event.preventDefault();
      focusElem(item.nextElementSibling as HTMLElement, item);
      break;
    case 'ArrowUp': // select previous element
      event.preventDefault();
      focusElem(item.previousElementSibling as HTMLElement, item);
      break;
    case 'Escape': // close menu
      event.preventDefault();
      item.tabIndex = -1;
      toggleMenu();
      break;
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (!menuVisible) return;
  const item = document.activeElement;
  if (!rootEl.contains(item)) return;
  if (event.key === 'Shift' && hoverActivated) {
    // shift is not pressed anymore -> deactivate hovering and reset hovered and selected
    hoverActivated = false;
    for (const commit of commits) {
      commit.hovered = false;
      commit.selected = false;
    }
  }
}

function highlight(commit: Commit) {
  if (!hoverActivated) return;
  const indexSelected = commits.findIndex((x) => x.selected);
  const indexCurrentElem = commits.findIndex((x) => x.id === commit.id);
  for (const [idx, c] of commits.entries()) {
    c.hovered = Math.min(indexSelected, indexCurrentElem) <= idx && idx <= Math.max(indexSelected, indexCurrentElem);
  }
}

/** Focus given element */
function focusElem(elem: HTMLElement | null, prevElem?: HTMLElement | null) {
  if (elem) {
    elem.tabIndex = 0;
    if (prevElem) prevElem.tabIndex = -1;
    elem.focus();
  }
}

/** Opens our menu, loads commits before opening */
async function toggleMenu() {
  menuVisible = !menuVisible;
  // load our commits when the menu is not yet visible (it'll be toggled after loading)
  // and we got no commits
  if (!commits.length && menuVisible && !isLoading) {
    isLoading = true;
    try {
      await fetchCommits();
    } finally {
      isLoading = false;
    }
  }
  // set correct tabindex to allow easier navigation
  await tick();
  const expandBtn = rootEl.querySelector<HTMLElement>('#diff-commit-list-expand');
  const showAllChangesBtn = rootEl.querySelector<HTMLElement>('#diff-commit-list-show-all');
  if (menuVisible) {
    focusElem(showAllChangesBtn, expandBtn);
  } else {
    focusElem(expandBtn, showAllChangesBtn);
  }
}

/** Load the commits to show in this dropdown */
async function fetchCommits() {
  const resp = await GET(`${issueLink}/commits/list`);
  const results = await resp.json();
  commits.push(...results.commits.map((x: Commit) => {
    x.hovered = false;
    return x;
  }));
  commits.reverse();
  lastReviewCommitSha = results.last_review_commit_sha || null;
  if (lastReviewCommitSha && !commits.some((x) => x.id === lastReviewCommitSha)) {
    // the lastReviewCommit is not available (probably due to a force push)
    // reset the last review commit sha
    lastReviewCommitSha = null;
  }
  Object.assign(locale, results.locale);
}

function showAllChanges() {
  window.location.assign(`${issueLink}/files${queryParams}`);
}

/** Called when user clicks on since last review */
function changesSinceLastReviewClick() {
  window.location.assign(`${issueLink}/files/${lastReviewCommitSha}..${commits.at(-1).id}${queryParams}`);
}

/** Clicking on a single commit opens this specific commit */
function commitClicked(commitId: string, newWindow = false) {
  const url = `${issueLink}/commits/${commitId}${queryParams}`;
  if (newWindow) {
    window.open(url);
  } else {
    window.location.assign(url);
  }
}

/**
 * When a commit is clicked with shift this enables the range
 * selection. Second click (with shift) defines the end of the
 * range. This opens the diff of this range
 * Exception: first commit is the first commit of this PR. Then
 * the diff from beginning of PR up to the second clicked commit is
 * opened
 */
function commitClickedShift(commit: Commit) {
  hoverActivated = !hoverActivated;
  commit.selected = true;
  // Second click -> determine our range and open links accordingly
  if (!hoverActivated) {
    // find all selected commits and generate a link
    if (commits[0].selected) {
      // first commit is selected - generate a short url with only target sha
      const lastCommitIdx = commits.findLastIndex((x) => x.selected);
      if (lastCommitIdx === commits.length - 1) {
        // user selected all commits - just show the normal diff page
        window.location.assign(`${issueLink}/files${queryParams}`);
      } else {
        window.location.assign(`${issueLink}/files/${commits[lastCommitIdx].id}${queryParams}`);
      }
    } else {
      const start = commits[commits.findIndex((x) => x.selected) - 1].id;
      const end = commits.findLast((x) => x.selected).id;
      window.location.assign(`${issueLink}/files/${start}..${end}${queryParams}`);
    }
  }
}

function onCommitKeyDown(event: KeyboardEvent, commit: Commit) {
  if (event.key !== 'Enter' || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.shiftKey) {
    commitClickedShift(commit);
  } else {
    commitClicked(commit.id);
  }
}

function onCommitClick(event: MouseEvent, commit: Commit) {
  const {ctrlKey, shiftKey, altKey, metaKey} = event;
  if (altKey) return;
  if (!ctrlKey && !shiftKey && !metaKey) {
    commitClicked(commit.id);
  } else if (ctrlKey && !shiftKey && !metaKey) {
    commitClicked(commit.id, true);
  } else if (metaKey && !ctrlKey && !shiftKey) {
    commitClicked(commit.id, true);
  } else if (shiftKey && !ctrlKey && !metaKey) {
    event.stopPropagation();
    event.preventDefault();
    commitClickedShift(commit);
  }
}
</script>

<div class="ui scrolling dropdown custom" bind:this={rootEl}>
  <!-- aria-activedescendant is kept from the original markup to keep the DOM contract unchanged -->
  <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
  <button
    class="ui basic button"
    id="diff-commit-list-expand"
    onclick={(e) => { e.stopPropagation(); toggleMenu() }}
    data-tooltip-content={filterChangesByCommit}
    aria-haspopup="true"
    aria-controls="diff-commit-selector-menu"
    aria-label={filterChangesByCommit}
    aria-activedescendant="diff-commit-list-show-all"
  >
    <SvgIcon name="octicon-git-commit"/>
  </button>
  <div class={['menu', 'left', 'transition', {visible: menuVisible}]} id="diff-commit-selector-menu" style:display={menuVisible ? null : 'none'} aria-expanded={menuVisible ? 'true' : 'false'}>
    {#if isLoading}
      <div class="loading-indicator is-loading"></div>
    {/if}
    {#if !isLoading}
      <!-- the tabindex of the menu items is managed by the roving focus code of this component -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div class="vertical item" id="diff-commit-list-show-all" role="menuitem" onkeydown={(e) => { if (e.key === 'Enter') showAllChanges() }} onclick={showAllChanges}>
        <div class="gt-ellipsis">
          {locale.show_all_commits}
        </div>
        <div class="gt-ellipsis text light-2 tw:mb-0">
          {locale.stats_num_commits}
        </div>
      </div>
    {/if}
    <!-- only show the show changes since last review if there is a review AND we are commits ahead of the last review -->
    {#if lastReviewCommitSha != null}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="menuitem"
        class={['vertical', 'item', {disabled: !commitsSinceLastReview}]}
        onkeydown={(e) => { if (e.key === 'Enter') changesSinceLastReviewClick() }}
        onclick={changesSinceLastReviewClick}
      >
        <div class="gt-ellipsis">
          {locale.show_changes_since_your_last_review}
        </div>
        <div class="gt-ellipsis text light-2">
          {commitsSinceLastReview} commits
        </div>
      </div>
    {/if}
    {#if !isLoading}
      <span class="info text light-2">{locale.select_commit_hold_shift_for_range}</span>
    {/if}
    {#each commits as commit (commit.id)}
      <!-- shift hovering is a pointer only range preview, keyboard users select ranges with shift and enter -->
      <!-- svelte-ignore a11y_interactive_supports_focus, a11y_mouse_events_have_key_events -->
      <div
        class={['vertical', 'item', {selection: commit.selected, hovered: commit.hovered}]}
        role="menuitem"
        onkeydown={(e) => onCommitKeyDown(e, commit)}
        onmouseover={(e) => { if (e.shiftKey) highlight(commit) }}
        onclick={(e) => onCommitClick(e, commit)}
      >
        <div class="tw:flex-1 tw:flex tw:flex-col tw:gap-1">
          <div class="gt-ellipsis commit-list-summary">
            {commit.summary}
          </div>
          <div class="gt-ellipsis text light-2">
            {commit.committer_or_author_name}
            <span class="text right">
              <relative-time prefix="" datetime={commit.time} data-tooltip-content data-tooltip-interactive="true">{commit.time}</relative-time>
            </span>
          </div>
        </div>
        <div class="tw:font-mono">
          {commit.short_sha}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .hovered:not(.selection) {
    background-color: var(--color-small-accent) !important;
  }
  .selection {
    background-color: var(--color-accent) !important;
  }

  .info {
    display: inline-block;
    padding: 7px 14px !important;
    line-height: 1.4;
    width: 100%;
  }

  #diff-commit-selector-menu {
    overflow-inline: hidden;
    max-height: 450px;
  }

  #diff-commit-selector-menu .loading-indicator {
    height: 200px;
    width: 350px;
  }

  #diff-commit-selector-menu .item,
  #diff-commit-selector-menu .info {
    display: flex !important;
    flex-direction: row;
    line-height: 1.4;
    padding: 7px 14px !important;
    border-top: 1px solid var(--color-secondary) !important;
    gap: 0.25em;
  }

  #diff-commit-selector-menu .item:focus {
    color: var(--color-text);
    background: var(--color-hover);
  }

  #diff-commit-selector-menu .commit-list-summary {
    max-width: min(380px, 96vw);
  }
</style>
