<script lang="ts">
import {onMount, type ComponentProps} from 'svelte';
import jquery from 'jquery';
import SvgIcon from './SvgIcon.svelte';
import {GET} from '../modules/fetch.ts';

interface Repo {
  id: number;
  link: string;
  full_name: string;
  fork?: boolean;
  mirror?: boolean;
  template?: boolean;
  private?: boolean;
  internal?: boolean;
  archived?: boolean;
  latest_commit_status?: {State: string; TargetURL?: string};
  locale_latest_commit_status?: string;
}

interface Organization {
  name: string;
  num_repos: number;
  org_visibility: string;
  avatar_url?: string;
}

interface Props {
  uid?: number;
  teamId?: number;
  searchLimit?: number;
  isMirrorsEnabled?: boolean;
  isOrganization?: boolean;
  organizations?: Organization[];
  organizationsTotalCount?: number;
  subUrl?: string;
  textMyRepos?: string;
  textSearchRepos?: string;
  textFilter?: string;
  textShowArchived?: string;
  textShowPrivate?: string;
  textShowBothArchivedUnarchived?: string;
  textShowOnlyUnarchived?: string;
  textShowOnlyArchived?: string;
  textShowBothPrivatePublic?: string;
  textShowOnlyPublic?: string;
  textShowOnlyPrivate?: string;
  textAll?: string;
  textSources?: string;
  textForks?: string;
  textMirrors?: string;
  textCollaborative?: string;
  textFirstPage?: string;
  textPreviousPage?: string;
  textNextPage?: string;
  textLastPage?: string;
  textMyOrgs?: string;
  textOrgVisibilityLimited?: string;
  textOrgVisibilityPrivate?: string;
}

const {
  uid,
  teamId,
  searchLimit,
  isMirrorsEnabled = false,
  isOrganization = true,
  organizations = [],
  organizationsTotalCount = 0,
  subUrl = window.config.appSubUrl,
  textMyRepos,
  textSearchRepos,
  textFilter,
  textShowArchived,
  textShowPrivate,
  textShowBothArchivedUnarchived,
  textShowOnlyUnarchived,
  textShowOnlyArchived,
  textShowBothPrivatePublic,
  textShowOnlyPublic,
  textShowOnlyPrivate,
  textAll,
  textSources,
  textForks,
  textMirrors,
  textCollaborative,
  textFirstPage,
  textPreviousPage,
  textNextPage,
  textLastPage,
  textMyOrgs,
  textOrgVisibilityLimited,
  textOrgVisibilityPrivate,
}: Props = $props();

// make sure this matches templates/repo/commit_status.tmpl
type IconName = ComponentProps<typeof SvgIcon>['name'];

const commitStatus: Record<string, {name: IconName; color: string}> = {
  pending: {name: 'octicon-dot-fill', color: 'yellow'},
  success: {name: 'octicon-check', color: 'green'},
  skipped: {name: 'octicon-skip', color: 'grey'},
  error: {name: 'gitea-exclamation', color: 'red'},
  failure: {name: 'octicon-x', color: 'red'},
  warning: {name: 'gitea-exclamation', color: 'yellow'},
};

const repoTypes: Record<string, {searchMode: string}> = {
  all: {searchMode: ''},
  forks: {searchMode: 'fork'},
  mirrors: {searchMode: 'mirror'},
  sources: {searchMode: 'source'},
  collaborative: {searchMode: 'collaborative'},
};

const params = new URLSearchParams(window.location.search);

let tab = $state(params.get('repo-search-tab') || 'repos');
let reposFilter = $state(params.get('repo-search-filter') || 'all');
let privateFilter = $state(params.get('repo-search-private') || 'both');
let archivedFilter = $state(params.get('repo-search-archived') || 'unarchived');
let searchQuery = $state(params.get('repo-search-query') || '');
let page = $state(Number(params.get('repo-search-page')) || 1);
let repos = $state<Repo[]>([]);
let reposTotalCount = $state<number | string>(0);
let finalPage = $state(1);
let isLoading = $state(false);
let counts = $state<Record<string, number | string>>({});
let activeIndex = $state(-1); // don't select anything at load, first cursor down will select
let failedAvatars = $state<Record<string, boolean>>({});

let rootEl: HTMLElement;

const countKey = $derived(`${reposFilter}:${archivedFilter}:${privateFilter}`);

const repoTypeCount = $derived(counts[countKey]);

const showMoreReposLink = $derived(repos.length > 0 && repos.length < Number(repoTypeCount));

const searchURL = $derived(`${subUrl}/repo/search?sort=updated&order=desc&uid=${uid}&team_id=${teamId}&q=${searchQuery
}&page=${page}&limit=${searchLimit}&mode=${repoTypes[reposFilter].searchMode
}${archivedFilter === 'archived' ? '&archived=true' : ''}${archivedFilter === 'unarchived' ? '&archived=false' : ''
}${privateFilter === 'private' ? '&is_private=true' : ''}${privateFilter === 'public' ? '&is_private=false' : ''
}`);

const textArchivedFilterTitles = $derived<Record<string, string>>({
  archived: textShowOnlyArchived,
  unarchived: textShowOnlyUnarchived,
  both: textShowBothArchivedUnarchived,
});

const textPrivateFilterTitles = $derived<Record<string, string>>({
  private: textShowOnlyPrivate,
  public: textShowOnlyPublic,
  both: textShowBothPrivatePublic,
});

const checkboxArchivedFilterTitle = $derived(textArchivedFilterTitles[archivedFilter]);
const checkboxPrivateFilterTitle = $derived(textPrivateFilterTitles[privateFilter]);

onMount(() => {
  changeReposFilter(reposFilter);
  jquery(rootEl).find('.dropdown').dropdown();
});

function changeTab(t: string) {
  tab = t;
  updateHistory();
}

function changeReposFilter(filter: string) {
  reposFilter = filter;
  repos = [];
  page = 1;
  counts[`${filter}:${archivedFilter}:${privateFilter}`] = 0;
  searchRepos();
}

function updateHistory() {
  const params = new URLSearchParams(window.location.search);

  if (tab === 'repos') {
    params.delete('repo-search-tab');
  } else {
    params.set('repo-search-tab', tab);
  }

  if (reposFilter === 'all') {
    params.delete('repo-search-filter');
  } else {
    params.set('repo-search-filter', reposFilter);
  }

  if (privateFilter === 'both') {
    params.delete('repo-search-private');
  } else {
    params.set('repo-search-private', privateFilter);
  }

  if (archivedFilter === 'unarchived') {
    params.delete('repo-search-archived');
  } else {
    params.set('repo-search-archived', archivedFilter);
  }

  if (searchQuery === '') {
    params.delete('repo-search-query');
  } else {
    params.set('repo-search-query', searchQuery);
  }

  if (page === 1) {
    params.delete('repo-search-page');
  } else {
    params.set('repo-search-page', `${page}`);
  }

  const queryString = params.toString();
  if (queryString) {
    window.history.replaceState({}, '', `?${queryString}`);
  } else {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function toggleArchivedFilter() {
  if (archivedFilter === 'unarchived') {
    archivedFilter = 'archived';
  } else if (archivedFilter === 'archived') {
    archivedFilter = 'both';
  } else { // including both
    archivedFilter = 'unarchived';
  }
  page = 1;
  repos = [];
  counts[countKey] = 0;
  searchRepos();
}

function togglePrivateFilter() {
  if (privateFilter === 'both') {
    privateFilter = 'public';
  } else if (privateFilter === 'public') {
    privateFilter = 'private';
  } else { // including private
    privateFilter = 'both';
  }
  page = 1;
  repos = [];
  counts[countKey] = 0;
  searchRepos();
}

function changePage(newPage: number) {
  page = newPage;
  if (page > finalPage) {
    page = finalPage;
  }
  if (page < 1) {
    page = 1;
  }
  repos = [];
  counts[countKey] = 0;
  searchRepos();
}

async function searchRepos() {
  isLoading = true;

  const searchedMode = repoTypes[reposFilter].searchMode;
  const searchedURL = searchURL;
  const searchedQuery = searchQuery;

  let response: Response, json: {data: Array<{repository: Repo; latest_commit_status?: Repo['latest_commit_status']; locale_latest_commit_status?: string}>};
  try {
    if (!reposTotalCount) {
      const totalCountSearchURL = `${subUrl}/repo/search?count_only=1&uid=${uid}&team_id=${teamId}&q=&page=1&mode=`;
      response = await GET(totalCountSearchURL);
      reposTotalCount = response.headers.get('X-Total-Count') ?? '?';
    }

    response = await GET(searchedURL);
    json = await response.json();
  } catch {
    if (searchedURL === searchURL) {
      isLoading = false;
    }
    return;
  }

  if (searchedURL === searchURL) {
    repos = json.data.map((webSearchRepo) => {
      return {
        ...webSearchRepo.repository,
        latest_commit_status: webSearchRepo.latest_commit_status,
        locale_latest_commit_status: webSearchRepo.locale_latest_commit_status,
      };
    });
    const count = response.headers.get('X-Total-Count');
    if (searchedQuery === '' && searchedMode === '' && archivedFilter === 'both') {
      reposTotalCount = count;
    }
    counts[countKey] = count;
    finalPage = Math.ceil(Number(count) / searchLimit);
    updateHistory();
    isLoading = false;
  }
}

function repoIcon(repo: Repo): IconName {
  if (repo.fork) {
    return 'octicon-repo-forked';
  } else if (repo.mirror) {
    return 'octicon-mirror';
  } else if (repo.template) {
    return `octicon-repo-template`;
  } else if (repo.private) {
    return 'octicon-lock';
  } else if (repo.internal) {
    return 'octicon-repo';
  }
  return 'octicon-repo';
}

function reposFilterKeyControl(e: KeyboardEvent) {
  switch (e.key) {
    case 'Enter':
      document.querySelector<HTMLAnchorElement>('.repo-owner-name-list li.active a')?.click();
      break;
    case 'ArrowUp':
      if (activeIndex > 0) {
        activeIndex--;
      } else if (page > 1) {
        changePage(page - 1);
        activeIndex = searchLimit - 1;
      }
      break;
    case 'ArrowDown':
      if (activeIndex < repos.length - 1) {
        activeIndex++;
      } else if (page < finalPage) {
        activeIndex = 0;
        changePage(page + 1);
      }
      break;
    case 'ArrowRight':
      if (page < finalPage) {
        changePage(page + 1);
      }
      break;
    case 'ArrowLeft':
      if (page > 1) {
        changePage(page - 1);
      }
      break;
  }
  if (activeIndex === -1 || activeIndex > repos.length - 1) {
    activeIndex = 0;
  }
}

// the anchors below only act on click like before, this gives them button semantics for keyboard users
function onActivateKey(e: KeyboardEvent, action: () => void) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  action();
}
</script>

{#snippet tabLink(name: string, label: string, count: number | string)}
  <!-- the anchor is required by the Fomantic menu styles and acts as a button through its role and key handler -->
  <!-- svelte-ignore a11y_missing_attribute -->
  <a class={['item', {active: tab === name}]} role="button" tabindex="0" onclick={() => changeTab(name)} onkeydown={(e) => onActivateKey(e, () => changeTab(name))}>{label} <span class="ui grey label tw:ml-2">{count}</span></a>
{/snippet}

{#snippet filterMenuItem(title: string, checked: boolean, indeterminate: boolean, icon: IconName, label: string, action: () => void)}
  <!-- the anchor is required by the Fomantic menu styles and acts as a button through its role and key handler -->
  <!-- svelte-ignore a11y_missing_attribute -->
  <a class="item" role="button" tabindex="0" onclick={action} onkeydown={(e) => onActivateKey(e, action)}>
    <div class="ui checkbox" data-tooltip-content={title}>
      <!--the "tw:pointer-events-none" is necessary to prevent the checkbox from handling user's input,
          otherwise if the "input" handles click event for intermediate status, it breaks the internal state-->
      <input type="checkbox" class="tw:pointer-events-none" {checked} {indeterminate}><label>
        <SvgIcon name={icon} size={16} class="tw:mr-1"/>
        {label}
      </label>
    </div>
  </a>
{/snippet}

{#snippet repoFilterItem(name: string, label: string)}
  <!-- the anchor is required by the Fomantic menu styles and acts as a button through its role and key handler -->
  <!-- svelte-ignore a11y_missing_attribute -->
  <a class={['item', {active: reposFilter === name}]} role="button" tabindex="0" onclick={() => changeReposFilter(name)} onkeydown={(e) => onActivateKey(e, () => changeReposFilter(name))}>
    {label}
    <div class="ui circular mini grey label" style:display={reposFilter === name ? null : 'none'}>{repoTypeCount}</div>
  </a>
{/snippet}

{#snippet pageButton(disabled: boolean, extraClass: string, title: string, icon: IconName, iconClass: string, action: () => void)}
  <!-- the anchor is required by the Fomantic pagination styles and acts as a button through its role and key handler -->
  <!-- svelte-ignore a11y_missing_attribute -->
  <a class={['item', 'navigation', extraClass, {disabled}]} role="button" tabindex="0" onclick={action} onkeydown={(e) => onActivateKey(e, action)} {title}>
    <SvgIcon name={icon} size={16} class={iconClass}/>
  </a>
{/snippet}

<div bind:this={rootEl}>
  {#if !isOrganization}
    <div class="ui secondary stackable menu tabs-with-labels">
      {@render tabLink('repos', textMyRepos, reposTotalCount)}
      {@render tabLink('organizations', textMyOrgs, organizationsTotalCount)}
    </div>
  {/if}
  <div class="ui tab active list dashboard-repos" style:display={tab === 'repos' ? null : 'none'}>
    {#if isOrganization}
      <h4 class="tw:mt-4 tw:flex tw:items-center">
        <div class="tw:flex-1 tw:flex tw:gap-2 tw:items-center">
          {textMyRepos}
          <span class="ui grey label">{reposTotalCount}</span>
        </div>
      </h4>
    {/if}
    <div class="ui top attached segment repos-search">
      <div class="ui small fluid action left icon input">
        <input type="search" spellcheck="false" maxlength="255" oninput={() => changeReposFilter(reposFilter)} bind:value={searchQuery} onkeydown={reposFilterKeyControl} placeholder={textSearchRepos}>
        <i class={['icon', 'loading-icon-3px', {'is-loading': isLoading}]}><SvgIcon name="octicon-search" size={16}/></i>
        <div class="ui dropdown icon button" title={textFilter}>
          <SvgIcon name="octicon-filter" size={16}/>
          <div class="menu">
            {@render filterMenuItem(checkboxArchivedFilterTitle, archivedFilter === 'archived', archivedFilter === 'both', 'octicon-archive', textShowArchived, toggleArchivedFilter)}
            {@render filterMenuItem(checkboxPrivateFilterTitle, privateFilter === 'private', privateFilter === 'both', 'octicon-lock', textShowPrivate, togglePrivateFilter)}
          </div>
        </div>
      </div>
      <overflow-menu class="ui secondary pointing tabular borderless menu repos-filter">
        <div class="overflow-menu-items tw:justify-center">
          {@render repoFilterItem('all', textAll)}
          {@render repoFilterItem('sources', textSources)}
          {@render repoFilterItem('forks', textForks)}
          {#if isMirrorsEnabled}
            {@render repoFilterItem('mirrors', textMirrors)}
          {/if}
          {@render repoFilterItem('collaborative', textCollaborative)}
        </div>
      </overflow-menu>
    </div>
    {#if repos.length}
      <div class="ui attached table segment">
        <ul class="repo-owner-name-list">
          {#each repos as repo, index (repo.id)}
            <li class={['tw:flex', 'tw:items-center', 'tw:py-2', {active: index === activeIndex}]}>
              <a class="repo-list-link muted" href={repo.link}>
                <SvgIcon name={repoIcon(repo)} size={16} class="repo-list-icon"/>
                <div class="text truncate">{repo.full_name}</div>
                {#if repo.archived}
                  <div>
                    <SvgIcon name="octicon-archive" size={16}/>
                  </div>
                {/if}
              </a>
              {#if repo.latest_commit_status}
                <a class="tw:flex tw:items-center" href={repo.latest_commit_status.TargetURL || null} data-tooltip-content={repo.locale_latest_commit_status}>
                  <!-- the commit status icon logic is taken from templates/repo/commit_status.tmpl -->
                  <SvgIcon name={commitStatus[repo.latest_commit_status.State].name} class={`tw:ml-2 commit-status icon text ${commitStatus[repo.latest_commit_status.State].color}`} size={16}/>
                </a>
              {/if}
            </li>
          {/each}
        </ul>
        {#if showMoreReposLink}
          <div class="tw:text-center">
            <div class="divider tw:my-0"></div>
            <div class="ui borderless pagination menu narrow tw:my-2">
              {@render pageButton(page === 1, 'tw:py-1', textFirstPage, 'gitea-double-chevron-left', 'tw:mr-1', () => changePage(1))}
              {@render pageButton(page === 1, 'tw:py-1', textPreviousPage, 'octicon-chevron-left', 'tw:mr-1', () => changePage(page - 1))}
              <!-- the anchor is required by the Fomantic pagination styles, it only shows the current page -->
              <!-- svelte-ignore a11y_missing_attribute -->
              <a class="active item tw:py-1">{page}</a>
              {@render pageButton(page === finalPage, '', textNextPage, 'octicon-chevron-right', 'tw:ml-1', () => changePage(page + 1))}
              {@render pageButton(page === finalPage, 'tw:py-1', textLastPage, 'gitea-double-chevron-right', 'tw:ml-1', () => changePage(finalPage))}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if !isOrganization}
    <div class="ui tab active list dashboard-orgs" style:display={tab === 'organizations' ? null : 'none'}>
      {#if organizations.length}
        <div class="ui attached table segment tw:rounded">
          <ul class="repo-owner-name-list">
            {#each organizations as org (org.name)}
              <li class="tw:flex tw:items-center tw:py-2">
                <a class="repo-list-link muted" href={`${subUrl}/${encodeURIComponent(org.name)}`}>
                  {#if org.avatar_url && !failedAvatars[org.name]}
                    <img
                      class="ui avatar repo-list-icon"
                      src={org.avatar_url}
                      alt=""
                      width="16"
                      height="16"
                      loading="lazy"
                      onerror={() => { failedAvatars[org.name] = true }}
                    >
                  {:else}
                    <SvgIcon name="octicon-organization" size={16} class="repo-list-icon"/>
                  {/if}
                  <div class="text truncate">{org.name}</div>
                  <div><!-- div to prevent underline of label on hover -->
                    {#if org.org_visibility !== 'public'}
                      <span class="ui label">
                        {org.org_visibility === 'limited' ? textOrgVisibilityLimited : textOrgVisibilityPrivate}
                      </span>
                    {/if}
                  </div>
                </a>
                <div class="text light grey tw:flex tw:items-center tw:ml-2">
                  {org.num_repos}
                  <SvgIcon name="octicon-repo" size={16} class="tw:ml-1 tw:mt-0.5"/>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
ul {
  list-style: none;
  margin: 0;
  padding-inline-start: 0;
}

ul li {
  padding: 0 10px;
}

ul li:not(:last-child) {
  border-bottom: 1px solid var(--color-secondary);
}

.repos-search {
  padding-bottom: 0 !important;
}

.repos-filter {
  margin-top: 0 !important;
  border-bottom-width: 0 !important;
}

.repos-filter .item {
  padding-inline: 6px !important;
}

.repo-list-link {
  min-width: 0; /* for text truncation */
  display: flex;
  align-items: center;
  flex: 1;
  gap: 0.5rem;
}

.repo-list-link :global(.svg) {
  color: var(--color-text-light-2);
}

.repo-list-link :global(.repo-list-icon) {
  min-width: 16px;
  margin-inline-end: 2px;
}

/* octicon-mirror has no padding inside the SVG */
.repo-list-link :global(.repo-list-icon.octicon-mirror) {
  width: 14px;
  min-width: 14px;
  margin-inline: 1px 3px;
}

.repo-owner-name-list li.active {
  background: var(--color-hover);
}
</style>
