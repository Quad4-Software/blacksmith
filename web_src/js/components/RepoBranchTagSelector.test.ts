import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {render, fireEvent} from '@testing-library/svelte';
import {tick} from 'svelte';
import RepoBranchTagSelector from './RepoBranchTagSelector.svelte';
import {showErrorToast} from '../modules/toast.ts';

vi.mock('../modules/toast.ts', () => ({
  showErrorToast: vi.fn(),
}));

const baseProps = {
  textReleaseCompare: 'Compare',
  textCreateTag: 'Create tag %s',
  textCreateBranch: 'Create branch %s',
  textCreateBranchFrom: 'from %s',
  textBranches: 'Branches',
  textTags: 'Tags',
  textDefaultBranchLabel: 'default',
  mode: 'branches' as const,
  showBranchesInDropdown: true,
  searchFieldPlaceholder: 'Filter...',
  branchForm: '',
  disableCreateBranch: false,
  setAction: false,
  submitForm: false,
  viewType: 'branch' as const,
  commitIdShort: 'abc1234',
  tagName: 'v1.0',
  branchName: 'main',
  noTag: false,
  defaultSelectedRefName: 'main',
  repoDefaultBranch: 'main',
  enableFeed: true,
  rssURLPrefix: '/user/repo/rss/branch/',
  branchURLPrefix: '/user/repo/src/branch/',
  branchURLSuffix: '/dir',
  tagURLPrefix: '/user/repo/src/tag/',
  tagURLSuffix: '/dir',
  repoLink: '/user/repo',
  treePath: 'dir/file.txt',
  branchNameSubURL: 'branch/main',
  noResults: 'No results',
};

function mockLists(lists: {branches?: string[], tags?: string[]} = {}) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/branches/list')) return new Response(JSON.stringify({results: lists.branches ?? ['main', 'dev', 'feat/x y']}));
    if (url.endsWith('/tags/list')) return new Response(JSON.stringify({results: lists.tags ?? ['v1.0', 'v2.0']}));
    throw new Error(`unexpected ${url}`);
  });
}

function menuOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('.menu.transition');
}

function itemTexts(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.scrolling.menu > .item'), (x) => x.textContent.trim().split(/\s+/)[0]);
}

async function openMenu(container: HTMLElement) {
  await fireEvent.click(container.querySelector('.branch-dropdown-button'));
  await vi.waitFor(() => expect(container.querySelector('.loading-indicator')).toBeNull());
}

function stray(el: Element) {
  return Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.nodeValue !== '').map((n) => n.nodeValue);
}

function setupForm() {
  document.body.insertAdjacentHTML('beforeend', `<form id="ref-form" action="/old"><input name="refURL"><input name="ref"><input name="refType"></form>`);
  const form = document.getElementById('ref-form') as HTMLFormElement;
  form.requestSubmit = vi.fn();
  return form;
}

describe('RepoBranchTagSelector', () => {
  beforeEach(() => {
    vi.mocked(showErrorToast).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial render', () => {
    test('branch view', () => {
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      const button = container.querySelector('.branch-dropdown-button');
      expect(button.querySelector('svg.octicon-git-branch')).toBeTruthy();
      expect(button.querySelector('strong').textContent).toEqual('main');
      expect(button.querySelector('svg.octicon-triangle-down')).toBeTruthy();
      expect(menuOf(container).style.display).toEqual('none');
      expect(menuOf(container).classList).not.toContain('visible');
    });

    test('tag view', () => {
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, viewType: 'tag'}});
      const button = container.querySelector('.branch-dropdown-button');
      expect(button.querySelector('svg.octicon-tag')).toBeTruthy();
      expect(button.querySelector('strong').textContent).toEqual('v1.0');
    });

    test('tree view shows the short commit id', () => {
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, viewType: 'tree'}});
      const button = container.querySelector('.branch-dropdown-button');
      expect(button.querySelector('svg.octicon-git-commit')).toBeTruthy();
      expect(button.querySelector('strong').textContent).toEqual('abc1234');
    });

    test('release mode shows the compare text instead of a ref', () => {
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, release: {tagName: 'v1.0'}}});
      const button = container.querySelector('.branch-dropdown-button');
      expect(button.querySelector('strong')).toBeNull();
      expect(button.textContent).toContain('Compare');
    });

    test('tabs depend on the props', () => {
      const {container, unmount} = render(RepoBranchTagSelector, {props: baseProps});
      const tabs = container.querySelectorAll('.branch-tag-tab .branch-tag-item');
      expect(Array.from(tabs, (x) => x.textContent.trim())).toEqual(['Branches', 'Tags']);
      expect(tabs[0].classList).toContain('active');
      expect(tabs[1].classList).not.toContain('active');
      unmount();

      const noTag = render(RepoBranchTagSelector, {props: {...baseProps, noTag: true}});
      expect(noTag.container.querySelectorAll('.branch-tag-tab .branch-tag-item').length).toEqual(1);
      noTag.unmount();

      const noBranches = render(RepoBranchTagSelector, {props: {...baseProps, showBranchesInDropdown: false}});
      expect(noBranches.container.querySelector('.branch-tag-tab')).toBeNull();
    });
  });

  describe('menu', () => {
    test('opens on click, fetches branches once and marks the default selected', async () => {
      const spy = mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);

      expect(menuOf(container).style.display).toEqual('');
      expect(menuOf(container).classList).toContain('visible');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toEqual('/user/repo/branches/list');
      expect(itemTexts(container)).toEqual(['main', 'dev', 'feat/x']);

      const items = container.querySelectorAll('.scrolling.menu > .item');
      expect(items[0].classList).toContain('selected');
      expect(items[0].querySelector('.ui.label').textContent.trim()).toEqual('default');
      expect(items[1].classList).not.toContain('selected');
      expect(items[1].querySelector('.ui.label')).toBeNull();
      expect(items[2].querySelector<HTMLAnchorElement>('.rss-icon').getAttribute('href')).toEqual('/user/repo/rss/branch/feat/x%20y');
      expect(container.querySelector('symbol#svg-symbol-octicon-rss')).toBeTruthy();

      await fireEvent.click(container.querySelector('.branch-dropdown-button'));
      expect(menuOf(container).style.display).toEqual('none');
      await fireEvent.click(container.querySelector('.branch-dropdown-button'));
      await tick();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('focuses the search field when opened', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await vi.waitFor(() => expect(document.activeElement).toBe(container.querySelector('input[name="search"]')));
      expect(container.querySelector('input[name="search"]').getAttribute('placeholder')).toEqual('Filter...');
    });

    test('hides the rss icon when the feed is disabled', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, enableFeed: false}});
      await openMenu(container);
      expect(container.querySelector<HTMLElement>('.rss-icon').style.display).toEqual('none');
    });

    test('closes on click outside and on escape', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.click(container.querySelector('input[name="search"]'));
      expect(menuOf(container).style.display).toEqual('');

      await fireEvent.click(document.body);
      expect(menuOf(container).style.display).toEqual('none');

      await fireEvent.click(container.querySelector('.branch-dropdown-button'));
      expect(menuOf(container).style.display).toEqual('');
      await fireEvent.keyDown(container.querySelector('input[name="search"]'), {key: 'Escape'});
      expect(menuOf(container).style.display).toEqual('none');
    });

    test('does not fetch branches when they are not shown in the dropdown', async () => {
      const spy = mockLists();
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, showBranchesInDropdown: false, mode: 'tags'}});
      await openMenu(container);
      expect(String(spy.mock.calls[0][0])).toEqual('/user/repo/tags/list');
      expect(itemTexts(container)).toEqual(['v1.0', 'v2.0']);
    });

    test('shows an error toast and allows a retry when fetching fails', async () => {
      const spy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      expect(showErrorToast).toHaveBeenCalledTimes(1);
      expect(vi.mocked(showErrorToast).mock.calls[0][0]).toContain('Network error when fetching branches');
      expect(container.querySelector('.message').textContent.trim()).toEqual('No results');

      await fireEvent.click(container.querySelector('.branch-dropdown-button'));
      await fireEvent.click(container.querySelector('.branch-dropdown-button'));
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    });
  });

  describe('tabs', () => {
    test('switching to tags loads the tag list once', async () => {
      const spy = mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const [branchesTab, tagsTab] = container.querySelectorAll('.branch-tag-tab .branch-tag-item');
      await fireEvent.click(tagsTab);
      await vi.waitFor(() => expect(itemTexts(container)).toEqual(['v1.0', 'v2.0']));
      expect(tagsTab.classList).toContain('active');
      expect(branchesTab.classList).not.toContain('active');
      expect(container.querySelector<HTMLElement>('.rss-icon').style.display).toEqual('none');

      await fireEvent.click(branchesTab);
      await vi.waitFor(() => expect(itemTexts(container)).toEqual(['main', 'dev', 'feat/x']));
      await fireEvent.click(tagsTab);
      await tick();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    test('release mode marks the release tag as selected', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, mode: 'tags', release: {tagName: 'v2.0'}}});
      await openMenu(container);
      const items = container.querySelectorAll('.scrolling.menu > .item');
      expect(items[0].classList).not.toContain('selected');
      expect(items[1].classList).toContain('selected');
    });
  });

  describe('search and create', () => {
    test('filters items case-insensitively', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.input(container.querySelector('input[name="search"]'), {target: {value: 'DE'}});
      expect(itemTexts(container)).toEqual(['dev', 'Create']);
    });

    test('offers to create a branch with the search term', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.input(container.querySelector('input[name="search"]'), {target: {value: 'new-one'}});

      expect(container.querySelector('.message')).toBeNull();
      const create = container.querySelector('.scrolling.menu > .item:last-child');
      expect(create.querySelector('form').getAttribute('action')).toEqual('/user/repo/branches/_new/branch/main');
      expect(create.querySelector('form').getAttribute('method')).toEqual('post');
      expect(create.querySelector<HTMLInputElement>('input[name="new_branch_name"]').value).toEqual('new-one');
      expect(create.querySelector<HTMLInputElement>('input[name="create_tag"]').value).toEqual('false');
      expect(create.querySelector<HTMLInputElement>('input[name="current_path"]').value).toEqual('dir/file.txt');
      const [tagText, branchText] = create.querySelectorAll<HTMLElement>('a > div:not(.text)');
      expect(tagText.style.display).toEqual('none');
      expect(branchText.style.display).toEqual('');
      expect(branchText.textContent.trim()).toEqual('Create branch new-one');
      expect(create.querySelector('.text.small').textContent.trim()).toEqual('from main');

      const submit = vi.fn();
      create.querySelector<HTMLFormElement>('form').requestSubmit = submit;
      await fireEvent.click(create.querySelector('a'));
      expect(submit).toHaveBeenCalledTimes(1);
    });

    test('creating from the tags tab creates a tag and describes the source ref', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, viewType: 'tag', treePath: ''}});
      await openMenu(container);
      await fireEvent.click(container.querySelectorAll('.branch-tag-tab .branch-tag-item')[1]);
      await vi.waitFor(() => expect(itemTexts(container)).toEqual(['v1.0', 'v2.0']));
      await fireEvent.input(container.querySelector('input[name="search"]'), {target: {value: 'v3'}});

      const create = container.querySelector('.scrolling.menu > .item:last-child');
      expect(create.querySelector<HTMLInputElement>('input[name="create_tag"]').value).toEqual('true');
      expect(create.querySelector('input[name="current_path"]')).toBeNull();
      const [tagText, branchText] = create.querySelectorAll<HTMLElement>('a > div:not(.text)');
      expect(tagText.style.display).toEqual('');
      expect(tagText.textContent.trim()).toEqual('Create tag v3');
      expect(branchText.style.display).toEqual('none');
      expect(create.querySelector('.text.small').textContent.trim()).toEqual('from v1.0');
    });

    test('create item content has no whitespace between its inline parts', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.input(container.querySelector('input[name="search"]'), {target: {value: 'new-one'}});

      const link = container.querySelector('.scrolling.menu > .item:last-child > a');
      expect(stray(link)).toEqual([]);
      const [tagBlock, branchBlock] = link.querySelectorAll(':scope > div:not(.text)');
      expect(stray(tagBlock)).toEqual([]);
      expect(stray(branchBlock)).toEqual([]);
      expect(tagBlock.querySelector('i').nextElementSibling.textContent).toEqual('Create tag new-one');
      expect(branchBlock.querySelector('span').textContent).toEqual('Create branch new-one');
      expect(branchBlock.textContent).toEqual('Create branch new-one');
    });

    test('default branch label and rss link are adjacent', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const item = container.querySelector('.scrolling.menu > .item');
      expect(item.querySelector('.ui.label').nextElementSibling).toBe(item.querySelector('a.rss-icon'));
      const between = [];
      for (let n = item.querySelector('.ui.label').nextSibling; n && n !== item.querySelector('a.rss-icon'); n = n.nextSibling) between.push(n);
      expect(between.filter((n) => n.nodeType === 3 && n.nodeValue !== '')).toEqual([]);
    });

    test('no create item for an exact match or when creating is disabled', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.input(container.querySelector('input[name="search"]'), {target: {value: 'MAIN'}});
      expect(itemTexts(container)).toEqual(['main']);

      const disabled = render(RepoBranchTagSelector, {props: {...baseProps, disableCreateBranch: true}});
      await openMenu(disabled.container);
      await fireEvent.input(disabled.container.querySelector('input[name="search"]'), {target: {value: 'zzz'}});
      expect(disabled.container.querySelector('.scrolling.menu > .item')).toBeNull();
      expect(disabled.container.querySelector('.message').textContent.trim()).toEqual('No results');
    });
  });

  describe('selecting', () => {
    test('navigates to the branch url when there is no form', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.click(container.querySelectorAll('.scrolling.menu > .item')[2]);
      expect(location.href).toEqual('/user/repo/src/branch/feat/x%20y/dir');
    });

    test('navigates to the tag url for tags', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, mode: 'tags'}});
      await openMenu(container);
      await fireEvent.click(container.querySelectorAll('.scrolling.menu > .item')[1]);
      expect(location.href).toEqual('/user/repo/src/tag/v2.0/dir');
    });

    test('clicking the rss icon does not select the item', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const rss = container.querySelector<HTMLAnchorElement>('.rss-icon');
      rss.addEventListener('click', (e) => e.preventDefault());
      await fireEvent.click(rss);
      expect(location.href).toEqual('');
    });

    test('updates the target form inputs instead of navigating', async () => {
      mockLists();
      const form = setupForm();
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, branchForm: 'ref-form'}});
      await openMenu(container);
      await fireEvent.click(container.querySelectorAll('.scrolling.menu > .item')[1]);

      expect(form.querySelector<HTMLInputElement>('input[name="refURL"]').value).toEqual('/user/repo/src/branch/dev/dir');
      expect(form.querySelector<HTMLInputElement>('input[name="ref"]').value).toEqual('dev');
      expect(form.querySelector<HTMLInputElement>('input[name="refType"]').value).toEqual('branch');
      expect(form.getAttribute('action')).toEqual('/old');
      expect(form.requestSubmit).not.toHaveBeenCalled();
      expect(container.querySelector('.branch-dropdown-button strong').textContent).toEqual('dev');
      expect(container.querySelector('.branch-dropdown-button svg.octicon-git-branch')).toBeTruthy();
      expect(menuOf(container).style.display).toEqual('none');
      const items = container.querySelectorAll('.scrolling.menu > .item');
      expect(items[0].classList).not.toContain('selected');
      expect(items[1].classList).toContain('selected');
      form.remove();
    });

    test('sets the form action and submits when configured', async () => {
      mockLists();
      const form = setupForm();
      const {container} = render(RepoBranchTagSelector, {props: {...baseProps, branchForm: 'ref-form', setAction: true, submitForm: true, mode: 'tags', viewType: 'branch'}});
      await openMenu(container);
      await fireEvent.click(container.querySelectorAll('.scrolling.menu > .item')[0]);

      expect(form.getAttribute('action')).toEqual('/user/repo/src/tag/v1.0/dir');
      expect(form.querySelector<HTMLInputElement>('input[name="refURL"]').value).toEqual('');
      expect(form.querySelector<HTMLInputElement>('input[name="refType"]').value).toEqual('tag');
      expect(form.querySelector<HTMLInputElement>('input[name="ref"]').value).toEqual('v1.0');
      expect(form.requestSubmit).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.branch-dropdown-button svg.octicon-tag')).toBeTruthy();
      form.remove();
    });
  });

  describe('keyboard', () => {
    test('arrow keys move the active item and enter selects it', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const search = container.querySelector('input[name="search"]');
      const activeIndex = () => Array.from(container.querySelectorAll('.scrolling.menu > .item')).findIndex((x) => x.classList.contains('active'));

      expect(activeIndex()).toEqual(-1);
      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      expect(activeIndex()).toEqual(1);
      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      expect(activeIndex()).toEqual(2);
      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      expect(activeIndex()).toEqual(2);
      await fireEvent.keyDown(search, {key: 'ArrowUp'});
      expect(activeIndex()).toEqual(1);
      await fireEvent.keyDown(search, {key: 'Enter'});
      expect(location.href).toEqual('/user/repo/src/branch/dev/dir');
    });

    test('enter after typing a search term opens the first match without highlighting it', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const search = container.querySelector('input[name="search"]');
      const activeIndex = () => Array.from(container.querySelectorAll('.scrolling.menu > .item')).findIndex((x) => x.classList.contains('active'));

      expect(activeIndex()).toEqual(-1);
      await fireEvent.input(search, {target: {value: 'de'}});
      expect(itemTexts(container)).toEqual(['dev', 'Create']);
      expect(activeIndex()).toEqual(-1);
      await fireEvent.keyDown(search, {key: 'Enter'});
      expect(location.href).toEqual('/user/repo/src/branch/dev/dir');
    });

    test('enter right after opening opens the first item', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      await fireEvent.keyDown(container.querySelector('input[name="search"]'), {key: 'Enter'});
      expect(location.href).toEqual('/user/repo/src/branch/main/dir');
    });

    test('typing resets the keyboard position to the first match', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const search = container.querySelector('input[name="search"]');
      const activeIndex = () => Array.from(container.querySelectorAll('.scrolling.menu > .item')).findIndex((x) => x.classList.contains('active'));

      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      expect(activeIndex()).toEqual(2);
      await fireEvent.input(search, {target: {value: 'de'}});
      expect(activeIndex()).toEqual(-1);
      await fireEvent.keyDown(search, {key: 'Enter'});
      expect(location.href).toEqual('/user/repo/src/branch/dev/dir');
    });

    test('reopening the menu clears the highlight and the keyboard position', async () => {
      mockLists();
      const location = {href: ''};
      vi.stubGlobal('location', location);
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const search = container.querySelector('input[name="search"]');
      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      expect(container.querySelector('.scrolling.menu > .item.active')).toBeTruthy();
      await fireEvent.keyDown(search, {key: 'Escape'});
      await fireEvent.click(container.querySelector('.branch-dropdown-button'));
      expect(container.querySelector('.scrolling.menu > .item.active')).toBeNull();
      await fireEvent.keyDown(search, {key: 'Enter'});
      expect(location.href).toEqual('/user/repo/src/branch/main/dir');
    });

    test('enter on the create item submits the new branch form', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await openMenu(container);
      const search = container.querySelector('input[name="search"]');
      await fireEvent.input(search, {target: {value: 'brand-new'}});
      const form = container.querySelector<HTMLFormElement>('.scrolling.menu form');
      const submit = vi.fn();
      form.requestSubmit = submit;

      await fireEvent.keyDown(search, {key: 'ArrowDown'});
      expect(container.querySelector('.scrolling.menu > .item:last-child').classList).toContain('active');
      await fireEvent.keyDown(search, {key: 'Enter'});
      expect(submit).toHaveBeenCalledTimes(1);
    });

    test('enter key on the toggle button also toggles the menu', async () => {
      mockLists();
      const {container} = render(RepoBranchTagSelector, {props: baseProps});
      await fireEvent.keyUp(container.querySelector('.branch-dropdown-button'), {key: 'Enter'});
      expect(menuOf(container).style.display).toEqual('');
      await fireEvent.keyUp(container.querySelector('.branch-dropdown-button'), {key: 'a'});
      expect(menuOf(container).style.display).toEqual('');
    });
  });
});
