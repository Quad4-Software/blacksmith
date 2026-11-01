import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {render, fireEvent} from '@testing-library/svelte';
import DashboardRepoList from './DashboardRepoList.svelte';

const baseProps = {
  uid: 7,
  teamId: 3,
  searchLimit: 2,
  isMirrorsEnabled: true,
  textMyRepos: 'My Repositories',
  textSearchRepos: 'Search repos',
  textFilter: 'Filter',
  textShowArchived: 'Show archived',
  textShowPrivate: 'Show private',
  textShowBothArchivedUnarchived: 'both archived',
  textShowOnlyUnarchived: 'only unarchived',
  textShowOnlyArchived: 'only archived',
  textShowBothPrivatePublic: 'both private',
  textShowOnlyPublic: 'only public',
  textShowOnlyPrivate: 'only private',
  textAll: 'All',
  textSources: 'Sources',
  textForks: 'Forks',
  textMirrors: 'Mirrors',
  textCollaborative: 'Collaborative',
  textFirstPage: 'First',
  textPreviousPage: 'Previous',
  textNextPage: 'Next',
  textLastPage: 'Last',
  textMyOrgs: 'My Orgs',
  textOrgVisibilityLimited: 'Limited',
  textOrgVisibilityPrivate: 'Private',
};

const repo1 = {id: 1, full_name: 'user2/repo1', link: '/user2/repo1', private: true};
const repo2 = {id: 2, full_name: 'user2/repo2', link: '/user2/repo2', fork: true, archived: true};
const repo3 = {id: 3, full_name: 'user2/repo3', link: '/user2/repo3', mirror: true};

type SearchEntry = {repository: Record<string, unknown>, latest_commit_status?: Record<string, unknown>, locale_latest_commit_status?: string};

function mockSearch(handler: (url: URL) => {data: SearchEntry[], total: number} | Error) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.searchParams.get('count_only')) {
      return new Response('{}', {headers: {'X-Total-Count': '42'}});
    }
    const result = handler(url);
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify({data: result.data}), {headers: {'X-Total-Count': String(result.total)}});
  });
}

function searchUrls(spy: ReturnType<typeof mockSearch>) {
  return spy.mock.calls.map(([input]) => String(input)).filter((u) => !u.includes('count_only'));
}

describe('DashboardRepoList', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  test('loads and renders repositories with counts and icons', async () => {
    const spy = mockSearch(() => ({
      data: [
        {repository: repo1},
        {repository: repo2, latest_commit_status: {State: 'success', TargetURL: '/user2/repo2/actions'}, locale_latest_commit_status: 'Success'},
      ],
      total: 5,
    }));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(2));

    expect(container.querySelector('h4').textContent).toContain('My Repositories');
    expect(container.querySelector('h4 .ui.label').textContent).toEqual('42');
    const links = container.querySelectorAll<HTMLAnchorElement>('.repo-list-link');
    expect(links[0].getAttribute('href')).toEqual('/user2/repo1');
    expect(links[0].querySelector('.text.truncate').textContent).toEqual('user2/repo1');
    expect(links[0].querySelector('svg').classList).toContain('octicon-lock');
    expect(links[1].querySelector('svg').classList).toContain('octicon-repo-forked');
    expect(links[1].querySelectorAll('svg').length).toEqual(2); // archived marker

    const lis = container.querySelectorAll('.repo-owner-name-list > li');
    expect(lis[0].querySelectorAll('a').length).toEqual(1);
    const status = lis[1].querySelector<HTMLAnchorElement>('a:nth-child(2)');
    expect(status.getAttribute('href')).toEqual('/user2/repo2/actions');
    expect(status.getAttribute('data-tooltip-content')).toEqual('Success');
    const statusIcon = status.querySelector('svg');
    expect(statusIcon.classList).toContain('octicon-check');
    expect(statusIcon.classList).toContain('green');

    const url = searchUrls(spy)[0];
    expect(url).toContain('/repo/search?sort=updated&order=desc&uid=7&team_id=3&q=&page=1&limit=2&mode=&archived=false');
    expect(container.querySelector('.repos-filter .item.active .ui.label').textContent).toEqual('5');
    expect(container.querySelector('.repos-filter .item.active').textContent).toContain('All');
  });

  test('hides the repo list segment when the search returns nothing', async () => {
    const spy = mockSearch(() => ({data: [], total: 0}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(searchUrls(spy).length).toEqual(1));
    expect(container.querySelector('.repo-owner-name-list')).toBeNull();
  });

  test('stops loading and shows nothing when the search fails', async () => {
    const spy = mockSearch(() => new Error('network down'));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(searchUrls(spy).length).toEqual(1));
    await vi.waitFor(() => expect(container.querySelector('.loading-icon-3px').classList).not.toContain('is-loading'));
    expect(container.querySelector('.repo-owner-name-list')).toBeNull();
  });

  test('shows the loading indicator while a search is pending', async () => {
    let resolve: (r: Response) => void;
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).includes('count_only')) return Promise.resolve(new Response('{}', {headers: {'X-Total-Count': '1'}}));
      return new Promise<Response>((r) => { resolve = r });
    });
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(resolve).toBeDefined());
    expect(container.querySelector('.loading-icon-3px').classList).toContain('is-loading');
    resolve(new Response(JSON.stringify({data: []}), {headers: {'X-Total-Count': '0'}}));
    await vi.waitFor(() => expect(container.querySelector('.loading-icon-3px').classList).not.toContain('is-loading'));
  });

  test('typing in the search box triggers a new search and updates the URL', async () => {
    const spy = mockSearch((url) => ({data: url.searchParams.get('q') === 'abc' ? [{repository: repo3}] : [{repository: repo1}], total: 1}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(1));

    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input.getAttribute('placeholder')).toEqual('Search repos');
    await fireEvent.input(input, {target: {value: 'abc'}});
    await vi.waitFor(() => expect(container.querySelector('.repo-list-link .text').textContent).toEqual('user2/repo3'));
    expect(searchUrls(spy).at(-1)).toContain('&q=abc&');
    expect(window.location.search).toContain('repo-search-query=abc');
    expect(container.querySelector('.repo-list-link svg').classList).toContain('octicon-mirror');
  });

  test('initial state is read from the URL query parameters', async () => {
    window.history.replaceState({}, '', '/?repo-search-filter=forks&repo-search-query=zz&repo-search-archived=both&repo-search-private=private');
    const spy = mockSearch(() => ({data: [], total: 0}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(searchUrls(spy).length).toEqual(1));
    const url = searchUrls(spy)[0];
    expect(url).toContain('&q=zz&');
    expect(url).toContain('&mode=fork');
    expect(url).toContain('&is_private=true');
    expect(url).not.toContain('archived=');
    expect(container.querySelector<HTMLInputElement>('input[type="search"]').value).toEqual('zz');
    expect(container.querySelector('.repos-filter .item.active').textContent).toContain('Forks');
  });

  test('clicking a type filter searches with the new mode', async () => {
    const spy = mockSearch(() => ({data: [{repository: repo1}], total: 1}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(searchUrls(spy).length).toEqual(1));
    const items = container.querySelectorAll<HTMLElement>('.repos-filter .item');
    expect(Array.from(items, (x) => x.textContent.trim().replace(/\d+$/, '').trim())).toEqual(['All', 'Sources', 'Forks', 'Mirrors', 'Collaborative']);
    await fireEvent.click(items[3]);
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&mode=mirror'));
    expect(items[3].classList).toContain('active');
    expect(window.location.search).toContain('repo-search-filter=mirrors');
  });

  test('mirrors filter is hidden when mirrors are disabled', async () => {
    mockSearch(() => ({data: [], total: 0}));
    const {container} = render(DashboardRepoList, {props: {...baseProps, isMirrorsEnabled: false}});
    const items = container.querySelectorAll('.repos-filter .item');
    expect(items.length).toEqual(4);
    expect(container.textContent).not.toContain('Mirrors');
  });

  test('filter checkbox label directly follows its input', async () => {
    mockSearch(() => ({data: [], total: 0}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    for (const box of container.querySelectorAll('.dropdown .menu .item .ui.checkbox')) {
      const between = [];
      for (let n = box.querySelector('input').nextSibling; n && n !== box.querySelector('label'); n = n.nextSibling) between.push(n);
      expect(between.filter((n) => n.nodeType === 3 && n.nodeValue !== '')).toEqual([]);
    }
  });

  test('archived and private toggles cycle through their states', async () => {
    const spy = mockSearch(() => ({data: [], total: 0}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(searchUrls(spy).length).toEqual(1));

    const [archivedItem, privateItem] = container.querySelectorAll<HTMLElement>('.dropdown .menu .item');
    const archivedBox = archivedItem.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const privateBox = privateItem.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(archivedItem.querySelector('.ui.checkbox').getAttribute('data-tooltip-content')).toEqual('only unarchived');
    expect(archivedBox.checked).toBe(false);
    expect(archivedBox.indeterminate).toBe(false);
    expect(privateBox.indeterminate).toBe(true);
    expect(privateItem.querySelector('.ui.checkbox').getAttribute('data-tooltip-content')).toEqual('both private');

    await fireEvent.click(archivedItem);
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&archived=true'));
    expect(archivedBox.checked).toBe(true);
    expect(archivedItem.querySelector('.ui.checkbox').getAttribute('data-tooltip-content')).toEqual('only archived');

    await fireEvent.click(archivedItem);
    await vi.waitFor(() => expect(searchUrls(spy).length).toEqual(3));
    expect(searchUrls(spy).at(-1)).not.toContain('archived=');
    expect(archivedBox.indeterminate).toBe(true);
    expect(window.location.search).toContain('repo-search-archived=both');

    await fireEvent.click(archivedItem);
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&archived=false'));

    await fireEvent.click(privateItem);
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&is_private=false'));
    expect(privateBox.checked).toBe(false);
    expect(privateBox.indeterminate).toBe(false);
    await fireEvent.click(privateItem);
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&is_private=true'));
    expect(privateBox.checked).toBe(true);
    expect(window.location.search).toContain('repo-search-private=private');
  });

  test('pagination appears only when more repositories exist and navigates pages', async () => {
    const spy = mockSearch((url) => ({
      data: url.searchParams.get('page') === '1' ? [{repository: repo1}, {repository: repo2}] : [{repository: repo3}],
      total: 3,
    }));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(2));

    const nav = () => container.querySelectorAll<HTMLElement>('.pagination.menu .item');
    expect(nav().length).toEqual(5);
    expect(nav()[0].getAttribute('title')).toEqual('First');
    expect(nav()[0].classList).toContain('disabled');
    expect(nav()[2].textContent).toEqual('1');
    expect(nav()[3].getAttribute('title')).toEqual('Next');
    expect(nav()[3].classList).not.toContain('disabled');

    await fireEvent.click(nav()[3]);
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(1));
    expect(searchUrls(spy).at(-1)).toContain('&page=2&');
    expect(window.location.search).toContain('repo-search-page=2');
    expect(nav()[2].textContent).toEqual('2');
    expect(nav()[4].classList).toContain('disabled');
    expect(nav()[3].classList).toContain('disabled');
  });

  test('keyboard navigation moves the active repo and pages', async () => {
    const spy = mockSearch((url) => ({
      data: url.searchParams.get('page') === '1' ? [{repository: repo1}, {repository: repo2}] : [{repository: repo3}],
      total: 3,
    }));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(2));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    const activeText = () => container.querySelector('.repo-owner-name-list li.active .text')?.textContent;

    await fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(activeText()).toEqual('user2/repo1');
    await fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(activeText()).toEqual('user2/repo2');
    await fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(activeText()).toEqual('user2/repo1');

    await fireEvent.keyDown(input, {key: 'ArrowRight'});
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&page=2&'));
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(1));
    await fireEvent.keyDown(input, {key: 'ArrowLeft'});
    await vi.waitFor(() => expect(searchUrls(spy).at(-1)).toContain('&page=1&'));
  });

  test('enter key follows the active repo link', async () => {
    mockSearch(() => ({data: [{repository: repo1}], total: 1}));
    const {container} = render(DashboardRepoList, {props: baseProps});
    await vi.waitFor(() => expect(container.querySelectorAll('.repo-owner-name-list > li').length).toEqual(1));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    const clicked = vi.fn((e: Event) => e.preventDefault());
    container.querySelector('.repo-list-link').addEventListener('click', clicked);
    await fireEvent.keyDown(input, {key: 'ArrowDown'});
    await fireEvent.keyDown(input, {key: 'Enter'});
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  describe('organization dashboard variants', () => {
    const orgProps = {
      ...baseProps,
      isOrganization: false,
      organizationsTotalCount: 3,
      organizations: [
        {name: 'org one', num_repos: 4, org_visibility: 'public', avatar_url: '/avatars/1'},
        {name: 'org2', num_repos: 0, org_visibility: 'limited', avatar_url: ''},
        {name: 'org3', num_repos: 1, org_visibility: 'private', avatar_url: '/avatars/3'},
      ],
    };

    test('renders tabs and the organization list', async () => {
      mockSearch(() => ({data: [], total: 0}));
      const {container} = render(DashboardRepoList, {props: orgProps});
      expect(container.querySelector('h4')).toBeNull();
      const tabs = container.querySelectorAll<HTMLElement>('.tabs-with-labels .item');
      expect(tabs.length).toEqual(2);
      expect(tabs[0].classList).toContain('active');
      expect(tabs[1].querySelector('.label').textContent).toEqual('3');

      const reposTab = container.querySelector<HTMLElement>('.dashboard-repos');
      const orgsTab = container.querySelector<HTMLElement>('.dashboard-orgs');
      expect(reposTab.style.display).toEqual('');
      expect(orgsTab.style.display).toEqual('none');

      const items = orgsTab.querySelectorAll('li');
      expect(items.length).toEqual(3);
      expect(items[0].querySelector('a').getAttribute('href')).toEqual('/org%20one');
      expect(items[0].querySelector('img').getAttribute('src')).toEqual('/avatars/1');
      expect(items[0].querySelector('.ui.label')).toBeNull();
      expect(items[1].querySelector('img')).toBeNull();
      expect(items[1].querySelector('svg').classList).toContain('octicon-organization');
      expect(items[1].querySelector('.ui.label').textContent.trim()).toEqual('Limited');
      expect(items[2].querySelector('.ui.label').textContent.trim()).toEqual('Private');
      expect(items[0].textContent).toContain('4');
    });

    test('switching tabs toggles visibility and updates the URL', async () => {
      mockSearch(() => ({data: [], total: 0}));
      const {container} = render(DashboardRepoList, {props: orgProps});
      const tabs = container.querySelectorAll<HTMLElement>('.tabs-with-labels .item');
      await fireEvent.click(tabs[1]);
      expect(tabs[1].classList).toContain('active');
      expect(tabs[0].classList).not.toContain('active');
      expect(container.querySelector<HTMLElement>('.dashboard-repos').style.display).toEqual('none');
      expect(container.querySelector<HTMLElement>('.dashboard-orgs').style.display).toEqual('');
      expect(window.location.search).toContain('repo-search-tab=organizations');

      await fireEvent.keyDown(tabs[0], {key: 'Enter'});
      expect(tabs[0].classList).toContain('active');
      expect(window.location.search).not.toContain('repo-search-tab');
    });

    test('falls back to the default icon when an avatar fails to load', async () => {
      mockSearch(() => ({data: [], total: 0}));
      const {container} = render(DashboardRepoList, {props: orgProps});
      const img = container.querySelector('.dashboard-orgs img');
      await fireEvent.error(img);
      await vi.waitFor(() => expect(container.querySelector('.dashboard-orgs li img[src="/avatars/1"]')).toBeNull());
      expect(container.querySelector('.dashboard-orgs li svg').classList).toContain('octicon-organization');
    });
  });
});
