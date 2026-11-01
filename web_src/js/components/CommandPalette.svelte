<script lang="ts" module>
  export interface PaletteItem {
    id: string;
    label: string;
    href: string;
    hint?: string;
  }
</script>

<script lang="ts">
  import {GET} from '../modules/fetch.ts';
  import {svgParseOuterInner} from '../svg.ts';
  import {navigate} from '../modules/command-palette-navigate.ts';
  import {rankItems, type MatchResult} from '../modules/command-palette-match.ts';
  import SvgIcon from './SvgIcon.svelte';
  import {tick} from 'svelte';

  interface Command {
    label: string;
    href: string;
    icon?: Parameters<typeof svgParseOuterInner>[0];
  }

  interface Group {
    id: string;
    name: string;
    items: Array<{item: Command; match: MatchResult}>;
  }

  const i18n = window.config?.i18n as unknown as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => i18n?.[key] ?? fallback;
  const appSubUrl: string = window.config?.appSubUrl ?? '';
  const RECENT_KEY = 'blacksmith-command-palette-recent';

  let isOpen = $state(false);
  let query = $state('');
  let activeIndex = $state(0);
  let searching = $state(false);
  let searchDone = $state(false);
  let remoteGroups = $state<Group[]>([]);
  let inputEl = $state<HTMLInputElement>();
  let listEl = $state<HTMLElement>();
  let previousFocus: Element | null = null;
  let abort: AbortController | undefined;

  function sanitizeUrl(url: string): string | null {
    if (typeof url !== 'string') return null;
    if (!url.startsWith('/') || url.startsWith('//')) return null;
    return url;
  }

  function toRelative(htmlUrl: unknown, fallbackFullName?: unknown): string | null {
    if (typeof htmlUrl === 'string') {
      try {
        const u = new URL(htmlUrl, window.location.origin);
        if (u.origin === window.location.origin) {
          return sanitizeUrl(`${u.pathname}${u.search}`) ?? sanitizeUrl(`${u.pathname}`);
        }
      } catch {
        // fall through to fallback
      }
    }
    if (typeof fallbackFullName === 'string') {
      return sanitizeUrl(`${appSubUrl}/${fallbackFullName}`);
    }
    return null;
  }

  function readRecent(): Command[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x): x is Command => (
        x && typeof x.label === 'string' && typeof x.href === 'string' && sanitizeUrl(x.href) !== null
      )).slice(0, 5);
    } catch {
      return [];
    }
  }

  function pushRecent(cmd: Command) {
    try {
      const rest = readRecent().filter((x) => x.href !== cmd.href);
      localStorage.setItem(RECENT_KEY, JSON.stringify([{label: cmd.label, href: cmd.href}, ...rest].slice(0, 5)));
    } catch {
      // storage unavailable, ignore
    }
  }

  function staticCommands(): Command[] {
    const signedIn = !!document.querySelector('#logout-user-action');
    const admin = !!document.querySelector('.navbar-right a[href$="/admin"], #navbar a[href$="/admin"]');
    const cmds: Command[] = [
      {label: t('command_palette.dashboard', 'Dashboard'), href: `${appSubUrl}/`, icon: 'octicon-home'},
      {label: t('command_palette.issues', 'Issues'), href: `${appSubUrl}/issues`, icon: 'octicon-issue-opened'},
      {label: t('command_palette.pull_requests', 'Pull requests'), href: `${appSubUrl}/pulls`, icon: 'octicon-git-pull-request'},
      {label: t('command_palette.milestones', 'Milestones'), href: `${appSubUrl}/milestones`, icon: 'octicon-milestone'},
    ];
    if (signedIn) {
      cmds.push({label: t('command_palette.notifications', 'Notifications'), href: `${appSubUrl}/notifications`, icon: 'octicon-bell'});
    }
    cmds.push(
      {label: t('command_palette.explore_repos', 'Explore repositories'), href: `${appSubUrl}/explore/repos`, icon: 'octicon-search'},
      {label: t('command_palette.explore_users', 'Explore users'), href: `${appSubUrl}/explore/users`, icon: 'octicon-search'},
      {label: t('command_palette.explore_orgs', 'Explore organizations'), href: `${appSubUrl}/explore/organizations`, icon: 'octicon-search'},
    );
    if (signedIn) {
      cmds.push(
        {label: t('command_palette.create_repo', 'Create repository'), href: `${appSubUrl}/repo/create`, icon: 'octicon-plus'},
        {label: t('command_palette.new_migration', 'New migration'), href: `${appSubUrl}/repo/migrate`, icon: 'octicon-plus'},
        {label: t('command_palette.new_org', 'New organization'), href: `${appSubUrl}/org/create`, icon: 'octicon-plus'},
        {label: t('command_palette.user_settings', 'User settings'), href: `${appSubUrl}/user/settings`, icon: 'octicon-gear'},
      );
    } else {
      cmds.push({label: t('command_palette.sign_in', 'Sign in / Register'), href: `${appSubUrl}/user/login`, icon: 'octicon-sign-in'});
    }
    if (admin) {
      cmds.push({label: t('command_palette.site_admin', 'Site administration'), href: `${appSubUrl}/admin`, icon: 'octicon-shield-lock'});
    }
    return cmds;
  }

  function repoCommands(): Command[] {
    const out: Command[] = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>('.repo-header overflow-menu .overflow-menu-items > a.item')) {
      const clone = a.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.ui.small.label, svg').forEach((el) => el.remove());
      const label = clone.textContent?.replace(/\s+/g, ' ').trim();
      const href = sanitizeUrl(a.getAttribute('href') ?? '');
      const icon = (a.querySelector('svg')?.getAttribute('class')?.split(/\s+/).find((c) => c.startsWith('octicon-')) ?? 'octicon-code') as Parameters<typeof svgParseOuterInner>[0];
      if (label && href) out.push({label, href, icon});
    }
    return out;
  }

  function repoSlug(): string | null {
    const first = document.querySelector<HTMLAnchorElement>('.repo-header overflow-menu .overflow-menu-items > a.item');
    const href = first?.getAttribute('href') ?? '';
    const rel = href.startsWith(appSubUrl) ? href.slice(appSubUrl.length) : href;
    const m = /^\/([^/]+\/[^/]+)/.exec(rel);
    return m ? m[1] : null;
  }

  const groups = $derived.by((): Group[] => {
    const q = query.trim();
    if (!q) {
      const out: Group[] = [];
      const recent = readRecent();
      if (recent.length) {
        out.push({id: 'recent', name: t('command_palette.recent', 'Recent'), items: recent.map((item) => ({item, match: {score: 0, indexes: []}}))});
      }
      out.push({id: 'suggested', name: t('command_palette.suggested', 'Suggested'), items: [...repoCommands(), ...staticCommands()].map((item) => ({item, match: {score: 0, indexes: []}}))});
      return out;
    }
    const local = rankItems([...readRecent(), ...repoCommands(), ...staticCommands()], q);
    const out: Group[] = [];
    if (local.length) {
      out.push({id: 'commands', name: t('command_palette.commands', 'Commands'), items: local});
    }
    out.push(...remoteGroups);
    return out;
  });

  const flatItems = $derived(groups.flatMap((g) => g.items));
  const trimmedQuery = $derived(query.trim());
  const showNoResults = $derived(trimmedQuery.length >= 2 && !searching && searchDone && flatItems.length === 0);

  $effect(() => {
    const q = trimmedQuery;
    if (!isOpen || q.length < 2) {
      remoteGroups = [];
      searching = false;
      searchDone = q.length >= 2;
      abort?.abort();
      return;
    }
    searching = true;
    searchDone = false;
    const timer = setTimeout(async () => {
      abort?.abort();
      abort = new AbortController();
      const signal = abort.signal;
      try {
        const results: Group[] = [];
        const fetchGroup = async (url: string, name: string, map: (x: Record<string, unknown>) => Command | null) => {
          try {
            const resp = await GET(url, {signal});
            if (!resp.ok) return;
            const data = await resp.json();
            const list = (Array.isArray(data) ? data : data?.data ?? []) as Array<Record<string, unknown>>;
            const items = list.map(map).filter((x): x is Command => x !== null);
            if (items.length) results.push({id: name, name, items: items.map((item) => ({item, match: {score: 0, indexes: []}}))});
          } catch {
            // aborted or failed: show nothing for that group
          }
        };
        const enc = encodeURIComponent(q);
        const slug = repoSlug();
        const tasks = [
          fetchGroup(`${appSubUrl}/api/v1/repos/search?q=${enc}&limit=6`, t('command_palette.repositories', 'Repositories'),
            (x) => {
              const href = toRelative(x.html_url, x.full_name);
              return href ? {label: String(x.full_name ?? x.name ?? href), href, icon: 'octicon-repo'} : null;
            }),
          fetchGroup(`${appSubUrl}/api/v1/users/search?q=${enc}&limit=4`, t('command_palette.users', 'Users'),
            (x) => {
              const href = toRelative(x.html_url, x.login);
              return href ? {label: String(x.login ?? x.username ?? href), href, icon: 'octicon-person'} : null;
            }),
        ];
        if (slug) {
          tasks.push(fetchGroup(`${appSubUrl}/api/v1/repos/${slug}/issues?q=${enc}&type=all&state=all&limit=6`, t('command_palette.repo_issues', 'Issues and pull requests'),
            (x) => {
              const href = toRelative(x.html_url);
              return href ? {label: `#${x.number} ${x.title ?? ''}`.trim(), href, icon: x.pull_request ? 'octicon-git-pull-request' : 'octicon-issue-opened'} : null;
            }));
        }
        await Promise.all(tasks);
        if (!signal.aborted) {
          remoteGroups = results;
          searching = false;
          searchDone = true;
        }
      } catch {
        if (!signal.aborted) {
          searching = false;
          searchDone = true;
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  });

  function segments(label: string, indexes: number[]): Array<{text: string; match: boolean}> {
    const out: Array<{text: string; match: boolean}> = [];
    let matchRun = false;
    for (let i = 0; i < label.length; i++) {
      const m = indexes.includes(i);
      if (!out.length || m !== matchRun) {
        out.push({text: label[i], match: m});
        matchRun = m;
      } else {
        out[out.length - 1].text += label[i];
      }
    }
    return out;
  }

  function selectIndex(i: number) {
    activeIndex = i;
    const el = listEl?.querySelector(`#cp-opt-${i}`);
    el?.scrollIntoView({block: 'nearest'});
  }

  function openItem(cmd: Command, newTab = false) {
    const href = sanitizeUrl(cmd.href);
    if (!href) return;
    pushRecent({label: cmd.label, href});
    navigate(href, newTab);
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    const n = flatItems.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      selectIndex((activeIndex + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      selectIndex((activeIndex - 1 + n) % n);
    } else if (e.key === 'Home' && n) {
      e.preventDefault();
      selectIndex(0);
    } else if (e.key === 'End' && n) {
      e.preventDefault();
      selectIndex(n - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flatItems[activeIndex];
      if (entry) openItem(entry.item, e.ctrlKey || e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      inputEl?.focus();
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  export async function open() {
    previousFocus = document.activeElement;
    query = '';
    activeIndex = 0;
    remoteGroups = [];
    searching = false;
    searchDone = false;
    isOpen = true;
    document.body.style.overflow = 'hidden';
    await tick();
    inputEl?.focus();
  }

  export function close() {
    isOpen = false;
    abort?.abort();
    document.body.style.overflow = '';
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
    previousFocus = null;
  }
</script>

{#if isOpen}
  <div class="command-palette-backdrop" role="presentation" onmousedown={onBackdropClick}>
    <div class="command-palette" role="dialog" aria-modal="true" aria-label={t('command_palette.title', 'Command palette')}>
      <input
        bind:this={inputEl}
        class="command-palette-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="command-palette-list"
        aria-activedescendant={flatItems.length ? `cp-opt-${activeIndex}` : undefined}
        placeholder={t('command_palette.placeholder', 'Type a command or search...')}
        bind:value={query}
        onkeydown={onKeydown}
        autocomplete="off"
        spellcheck="false"
      >
      <div class="command-palette-list" bind:this={listEl} role="listbox" id="command-palette-list" aria-live="polite">
        {#if searching}
          <div class="command-palette-state">{t('command_palette.searching', 'Searching...')}</div>
        {/if}
        {#if showNoResults}
          <div class="command-palette-state">{t('command_palette.no_results', 'No results')}</div>
        {/if}
        {#each groups as group (group.id)}
          <div class="command-palette-group-name" role="presentation">{group.name}</div>
          {#each group.items as entry, i (entry.item.href + entry.item.label)}
            {@const idx = groups.slice(0, groups.indexOf(group)).reduce((n, g) => n + g.items.length, 0) + i}
            <div
              id="cp-opt-{idx}"
              class={['command-palette-item', {active: idx === activeIndex}]}
              role="option"
              tabindex="-1"
              aria-selected={idx === activeIndex}
              onmousemove={() => { activeIndex = idx; }}
              onmousedown={() => openItem(entry.item)}
            >
              <SvgIcon name={entry.item.icon ?? 'octicon-search'} size={16} class="command-palette-item-icon"/>
              <span class="command-palette-item-label">
                {#each segments(entry.item.label, entry.match.indexes) as seg, si (si)}
                  {#if seg.match}<mark>{seg.text}</mark>{:else}{seg.text}{/if}
                {/each}
              </span>
            </div>
          {/each}
        {/each}
      </div>
      <div class="command-palette-footer">
        <span><kbd>Up</kbd><kbd>Down</kbd> {t('command_palette.hint_navigate', 'to navigate')}</span>
        <span><kbd>Enter</kbd> {t('command_palette.hint_open', 'to open')}</span>
        <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> {t('command_palette.hint_new_tab', 'new tab')}</span>
        <span><kbd>Esc</kbd> {t('command_palette.hint_close', 'to close')}</span>
      </div>
    </div>
  </div>
{/if}

<style>
.command-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: var(--color-backdrop, rgba(0, 0, 0, 0.4));
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.command-palette {
  margin-top: 12vh;
  width: 40rem;
  max-width: calc(100vw - 1rem);
  background: var(--color-box-body);
  color: var(--color-text);
  border: 1px solid var(--color-secondary);
  border-radius: var(--border-radius);
  box-shadow: var(--color-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}

.command-palette-input {
  width: 100%;
  padding: 0.75em 1em;
  font: inherit;
  color: var(--color-text);
  background: var(--color-box-header);
  border: none;
  border-bottom: 1px solid var(--color-secondary);
  outline: none;
}

.command-palette-list {
  overflow-block: auto;
  flex: 1;
}

.command-palette-group-name {
  padding: 0.4em 1em 0.2em;
  font-size: 0.85em;
  color: var(--color-text-light-2);
  user-select: none;
}

.command-palette-item {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.45em 1em;
  cursor: pointer;
  color: var(--color-text);
}

.command-palette-item.active {
  background: var(--color-hover);
}

.command-palette-item :global(.command-palette-item-icon) {
  color: var(--color-text-light-2);
  flex-shrink: 0;
}

.command-palette-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-item-label mark {
  background: none;
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.command-palette-state {
  padding: 0.5em 1em;
  color: var(--color-text-light-2);
  font-size: 0.9em;
}

.command-palette-footer kbd {
  padding: 0 0.3em;
  border: 1px solid var(--color-secondary);
  border-radius: var(--border-radius);
  background: var(--color-box-body);
  font: inherit;
}

.command-palette-footer {
  display: flex;
  gap: 1em;
  padding: 0.4em 1em;
  font-size: 0.8em;
  color: var(--color-text-light-2);
  border-top: 1px solid var(--color-secondary);
  background: var(--color-box-header);
  user-select: none;
}

@media (max-width: 640px) {
  .command-palette {
    margin: 8vh 0.5rem 0;
    width: calc(100vw - 1rem);
  }
  .command-palette-footer {
    flex-wrap: wrap;
    gap: 0.5em 1em;
  }
}
</style>
