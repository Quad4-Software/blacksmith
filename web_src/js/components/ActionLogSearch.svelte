<script lang="ts">
  import {onMount} from 'svelte';
  import {applyHighlights, clearHighlights, findMatches, supportsHighlightApi, type LogMatch} from '../modules/action-log-search.ts';
  import SvgIcon from './SvgIcon.svelte';

  interface Props {
    root: HTMLElement | null;
    unloadedSteps: number;
    refreshKey: number;
    onclose: () => void;
    onloadall: () => void;
    locale?: {
      placeholder?: string;
      noMatches?: string;
      previous?: string;
      next?: string;
      caseSensitive?: string;
      close?: string;
      stepsNotLoaded?: string;
      loadAll?: string;
      count?: string;
    };
  }

  const {root, unloadedSteps, refreshKey, onclose, onloadall, locale = {}}: Props = $props();

  const t = $derived({
    placeholder: locale.placeholder ?? 'Search logs',
    noMatches: locale.noMatches ?? 'No matches',
    previous: locale.previous ?? 'Previous match',
    next: locale.next ?? 'Next match',
    caseSensitive: locale.caseSensitive ?? 'Match case',
    close: locale.close ?? 'Close',
    stepsNotLoaded: locale.stepsNotLoaded ?? 'steps not loaded',
    loadAll: locale.loadAll ?? 'Load all',
    count: locale.count ?? '%[1]d of %[2]d',
  });

  const LIMIT = 5000;

  let query = $state('');
  let caseSensitive = $state(false);
  let matches = $state<LogMatch[]>([]);
  let capped = $state(false);
  let active = $state(0);
  let inputEl = $state<HTMLInputElement>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const highlightApi = supportsHighlightApi();

  function lineElementOf(match: LogMatch): HTMLElement | null {
    return match.node.parentElement?.closest<HTMLElement>('.job-log-line') ?? null;
  }

  function gotoMatch(index: number) {
    const match = matches[index];
    if (!match) return;
    const lineEl = lineElementOf(match);
    for (let el = match.node.parentElement; el; el = el.parentElement) {
      if (el instanceof HTMLDetailsElement) el.open = true;
    }
    lineEl?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function renderMatches() {
    if (!query || !root) {
      matches = [];
      capped = false;
      clearHighlights();
      clearFallbackClasses();
      return;
    }
    const found = findMatches(root, query, caseSensitive, LIMIT + 1);
    capped = found.length > LIMIT;
    matches = found.slice(0, LIMIT);
    applyActive();
  }

  function applyActive() {
    clearFallbackClasses();
    if (!matches.length) {
      clearHighlights();
      return;
    }
    active = Math.min(active, matches.length - 1);
    if (highlightApi) {
      applyHighlights(matches, active);
    } else {
      lineElementOf(matches[active])?.classList.add('action-log-search-active-line');
    }
    gotoMatch(active);
  }

  function clearFallbackClasses() {
    root?.querySelectorAll('.action-log-search-active-line').forEach((el) => el.classList.remove('action-log-search-active-line'));
  }

  function scheduleRun() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderMatches, 150);
  }

  $effect(() => {
    void query;
    void caseSensitive;
    active = 0;
    scheduleRun();
  });

  $effect(() => {
    void refreshKey;
    scheduleRun();
  });

  function onInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!matches.length) return;
      active = e.shiftKey ? (active - 1 + matches.length) % matches.length : (active + 1) % matches.length;
      applyActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  function prev() {
    if (!matches.length) return;
    active = (active - 1 + matches.length) % matches.length;
    applyActive();
  }

  function next() {
    if (!matches.length) return;
    active = (active + 1) % matches.length;
    applyActive();
  }

  const countText = $derived.by(() => {
    if (!query) return '';
    if (!matches.length) return capped ? '' : t.noMatches;
    const n = capped ? `${LIMIT}+` : String(matches.length);
    return t.count.replace('%[1]d', String(active + 1)).replace('%[2]d', n);
  });

  onMount(() => {
    inputEl?.focus();
    return () => {
      clearTimeout(debounceTimer);
      clearHighlights();
      clearFallbackClasses();
    };
  });
</script>

<div class="action-log-search" role="search">
  <div class="action-log-search-row">
    <input
      bind:this={inputEl}
      class="action-log-search-input"
      type="search"
      placeholder={t.placeholder}
      bind:value={query}
      onkeydown={onInputKeydown}
    >
    <span class="action-log-search-count" aria-live="polite">{countText}</span>
    <button type="button" class="action-log-search-btn" aria-label={t.previous} data-tooltip-content={t.previous} onclick={prev}>
      <SvgIcon name="octicon-chevron-up" size={16}/>
    </button>
    <button type="button" class="action-log-search-btn" aria-label={t.next} data-tooltip-content={t.next} onclick={next}>
      <SvgIcon name="octicon-chevron-down" size={16}/>
    </button>
    <button type="button" class={['action-log-search-btn', 'action-log-search-case', {active: caseSensitive}]} aria-label={t.caseSensitive} data-tooltip-content={t.caseSensitive} aria-pressed={caseSensitive} onclick={() => { caseSensitive = !caseSensitive; }}>
      Aa
    </button>
    <button type="button" class="action-log-search-btn" aria-label={t.close} data-tooltip-content={t.close} onclick={onclose}>
      <SvgIcon name="octicon-x" size={16}/>
    </button>
  </div>
  {#if unloadedSteps > 0 && query}
    <div class="action-log-search-unloaded">
      {unloadedSteps} {t.stepsNotLoaded}
      <button type="button" class="action-log-search-loadall link-action" onclick={onloadall}>{t.loadAll}</button>
    </div>
  {/if}
</div>

<style>
.action-log-search {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--color-box-body);
  border-bottom: 1px solid var(--color-secondary);
  padding: 4px 8px;
}

.action-log-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-log-search-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: var(--color-text);
  background: var(--color-input-background, var(--color-box-body));
  border: 1px solid var(--color-secondary);
  border-radius: var(--border-radius);
  padding: 4px 8px;
}

.action-log-search-count {
  color: var(--color-text-light-2);
  font-size: 0.9em;
  white-space: nowrap;
  min-width: 5em;
  text-align: end;
}

.action-log-search-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 5px;
  border: none;
  border-radius: var(--border-radius);
  background: none;
  color: var(--color-text);
  cursor: pointer;
}

.action-log-search-btn:hover,
.action-log-search-btn.active {
  background: var(--color-hover);
}

.action-log-search-case {
  font-size: 0.85em;
  font-weight: var(--font-weight-semibold);
  user-select: none;
}

.action-log-search-unloaded {
  margin-top: 4px;
  font-size: 0.85em;
  color: var(--color-text-light-2);
}
</style>
