import {afterEach, describe, expect, test, vi} from 'vitest';
import {render, fireEvent} from '@testing-library/svelte';
import {tick} from 'svelte';
import DiffCommitSelector from './DiffCommitSelector.svelte';

const props = {
  issueLink: '/user/repo/pulls/1',
  queryParams: '?style=unified&whitespace=show-all',
  filterChangesByCommit: 'Filter changes by commit',
};

function makeCommit(n: number) {
  return {id: `sha${n}`, summary: `Commit ${n}`, committer_or_author_name: `Author ${n}`, time: `2025-01-0${n}T00:00:00Z`, short_sha: `s${n}`};
}

// the server sends the newest commit first, the component reverses the list
function mockCommits(lastReview = '') {
  return vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
    commits: [makeCommit(3), makeCommit(2), makeCommit(1)],
    last_review_commit_sha: lastReview,
    locale: {
      show_all_commits: 'Show all changes',
      stats_num_commits: '3 commits',
      show_changes_since_your_last_review: 'Since your last review',
      select_commit_hold_shift_for_range: 'Hold shift for ranges',
    },
  })));
}

function stubNavigation() {
  const location = {assign: vi.fn()};
  const open = vi.fn();
  vi.stubGlobal('location', location);
  vi.stubGlobal('open', open);
  return {assign: location.assign, open};
}

async function openMenu(container: HTMLElement) {
  await fireEvent.click(container.querySelector('#diff-commit-list-expand'));
  await vi.waitFor(() => expect(container.querySelector('.loading-indicator')).toBeNull());
  await tick();
}

const url = (id: string) => `/user/repo/pulls/1/commits/${id}?style=unified&whitespace=show-all`;
const menu = (container: HTMLElement) => container.querySelector<HTMLElement>('#diff-commit-selector-menu');
const commitItems = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('#diff-commit-selector-menu .item:not(#diff-commit-list-show-all)')).filter((x) => x.querySelector('.commit-list-summary'));

describe('DiffCommitSelector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('renders the closed dropdown with accessible button', () => {
    const {container} = render(DiffCommitSelector, {props});
    const button = container.querySelector('#diff-commit-list-expand');
    expect(container.firstElementChild.className).toEqual('ui scrolling dropdown custom');
    expect(button.getAttribute('data-tooltip-content')).toEqual('Filter changes by commit');
    expect(button.getAttribute('aria-label')).toEqual('Filter changes by commit');
    expect(button.getAttribute('aria-haspopup')).toEqual('true');
    expect(button.getAttribute('aria-controls')).toEqual('diff-commit-selector-menu');
    expect(button.querySelector('svg.octicon-git-commit')).toBeTruthy();
    expect(menu(container).style.display).toEqual('none');
    expect(menu(container).getAttribute('aria-expanded')).toEqual('false');
    expect(menu(container).classList).not.toContain('visible');
  });

  test('opening loads the commits once and lists them oldest first', async () => {
    const spy = mockCommits();
    const {container} = render(DiffCommitSelector, {props});
    await fireEvent.click(container.querySelector('#diff-commit-list-expand'));
    expect(container.querySelector('.loading-indicator')).toBeTruthy();
    expect(container.querySelector('#diff-commit-list-show-all')).toBeNull();
    await vi.waitFor(() => expect(container.querySelector('.loading-indicator')).toBeNull());

    expect(String(spy.mock.calls[0][0])).toEqual('/user/repo/pulls/1/commits/list');
    expect(menu(container).style.display).toEqual('');
    expect(menu(container).getAttribute('aria-expanded')).toEqual('true');
    expect(menu(container).classList).toContain('visible');
    const showAll = container.querySelector('#diff-commit-list-show-all');
    expect(showAll.getAttribute('role')).toEqual('menuitem');
    expect(showAll.textContent).toContain('Show all changes');
    expect(showAll.textContent).toContain('3 commits');
    expect(container.querySelector('.info').textContent).toEqual('Hold shift for ranges');
    expect(container.querySelector('.disabled')).toBeNull();

    const items = commitItems(container);
    expect(items.length).toEqual(3);
    expect(items.map((x) => x.querySelector('.commit-list-summary').textContent.trim())).toEqual(['Commit 1', 'Commit 2', 'Commit 3']);
    expect(items[0].querySelector('.tw\\:font-mono').textContent.trim()).toEqual('s1');
    expect(items[0].textContent).toContain('Author 1');
    expect(items[0].querySelector('relative-time').getAttribute('datetime')).toEqual('2025-01-01T00:00:00Z');

    await fireEvent.click(container.querySelector('#diff-commit-list-expand'));
    expect(menu(container).style.display).toEqual('none');
    await fireEvent.click(container.querySelector('#diff-commit-list-expand'));
    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(commitItems(container).length).toEqual(3);
  });

  test('focuses the show all item when opened and the button when closed', async () => {
    mockCommits();
    const {container} = render(DiffCommitSelector, {props});
    await openMenu(container);
    expect(document.activeElement).toBe(container.querySelector('#diff-commit-list-show-all'));
    expect(container.querySelector('#diff-commit-list-expand').getAttribute('tabindex')).toEqual('-1');
    await fireEvent.click(container.querySelector('#diff-commit-list-expand'));
    await tick();
    await tick();
    expect(document.activeElement).toBe(container.querySelector('#diff-commit-list-expand'));
  });

  test('closes when clicking outside but not inside', async () => {
    mockCommits();
    const {container} = render(DiffCommitSelector, {props});
    await openMenu(container);
    await fireEvent.click(container.querySelector('.commit-list-summary'));
    expect(menu(container).style.display).toEqual('');
    await fireEvent.click(document.body);
    expect(menu(container).style.display).toEqual('none');
  });

  test('keyboard navigation with arrows and escape', async () => {
    mockCommits();
    const {container} = render(DiffCommitSelector, {props});
    await openMenu(container);
    const showAll = container.querySelector<HTMLElement>('#diff-commit-list-show-all');
    const [first, second] = commitItems(container);

    await fireEvent.keyDown(showAll, {key: 'ArrowDown'});
    expect(document.activeElement).toBe(container.querySelector('.info'));
    first.tabIndex = 0;
    first.focus();
    await fireEvent.keyDown(first, {key: 'ArrowDown'});
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toEqual(0);
    expect(first.tabIndex).toEqual(-1);
    await fireEvent.keyDown(second, {key: 'ArrowUp'});
    expect(document.activeElement).toBe(first);

    await fireEvent.keyDown(first, {key: 'Escape'});
    expect(menu(container).style.display).toEqual('none');
    await vi.waitFor(() => expect(document.activeElement).toBe(container.querySelector('#diff-commit-list-expand')));
  });

  test('keyboard events are ignored while the menu is closed', async () => {
    const {container} = render(DiffCommitSelector, {props});
    const button = container.querySelector<HTMLElement>('#diff-commit-list-expand');
    button.focus();
    await fireEvent.keyDown(button, {key: 'Escape'});
    expect(menu(container).style.display).toEqual('none');
  });

  describe('navigation', () => {
    test('show all changes', async () => {
      mockCommits();
      const nav = stubNavigation();
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      await fireEvent.click(container.querySelector('#diff-commit-list-show-all'));
      expect(nav.assign).toHaveBeenLastCalledWith('/user/repo/pulls/1/files?style=unified&whitespace=show-all');
      await fireEvent.keyDown(container.querySelector('#diff-commit-list-show-all'), {key: 'Enter'});
      expect(nav.assign).toHaveBeenCalledTimes(2);
      await fireEvent.keyDown(container.querySelector('#diff-commit-list-show-all'), {key: 'a'});
      expect(nav.assign).toHaveBeenCalledTimes(2);
    });

    test('clicking a commit opens it, ctrl and meta open a new window', async () => {
      mockCommits();
      const nav = stubNavigation();
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      const [first, second] = commitItems(container);

      await fireEvent.click(first);
      expect(nav.assign).toHaveBeenLastCalledWith(url('sha1'));
      await fireEvent.keyDown(second, {key: 'Enter'});
      expect(nav.assign).toHaveBeenLastCalledWith(url('sha2'));
      expect(nav.assign).toHaveBeenCalledTimes(2);

      await fireEvent.click(first, {ctrlKey: true});
      expect(nav.open).toHaveBeenLastCalledWith(url('sha1'));
      await fireEvent.click(second, {metaKey: true});
      expect(nav.open).toHaveBeenLastCalledWith(url('sha2'));
      expect(nav.open).toHaveBeenCalledTimes(2);

      await fireEvent.click(first, {altKey: true});
      await fireEvent.click(first, {ctrlKey: true, metaKey: true});
      await fireEvent.keyDown(first, {key: 'Enter', ctrlKey: true});
      expect(nav.assign).toHaveBeenCalledTimes(2);
      expect(nav.open).toHaveBeenCalledTimes(2);
    });

    test('shift range selection between two commits', async () => {
      mockCommits();
      const nav = stubNavigation();
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      const [, second, third] = commitItems(container);

      await fireEvent.click(second, {shiftKey: true});
      expect(second.classList).toContain('selection');
      expect(nav.assign).not.toHaveBeenCalled();

      await fireEvent.mouseOver(third, {shiftKey: true});
      expect(third.classList).toContain('hovered');
      expect(second.classList).toContain('hovered');
      expect(commitItems(container)[0].classList).not.toContain('hovered');

      await fireEvent.click(third, {shiftKey: true});
      expect(nav.assign).toHaveBeenCalledWith('/user/repo/pulls/1/files/sha1..sha3?style=unified&whitespace=show-all');
    });

    test('range starting at the first commit uses the short url', async () => {
      mockCommits();
      const nav = stubNavigation();
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      const [first, second, third] = commitItems(container);

      await fireEvent.keyDown(first, {key: 'Enter', shiftKey: true});
      await fireEvent.keyDown(second, {key: 'Enter', shiftKey: true});
      expect(nav.assign).toHaveBeenLastCalledWith('/user/repo/pulls/1/files/sha2?style=unified&whitespace=show-all');

      await fireEvent.click(first, {shiftKey: true});
      await fireEvent.click(third, {shiftKey: true});
      expect(nav.assign).toHaveBeenLastCalledWith('/user/repo/pulls/1/files?style=unified&whitespace=show-all');
    });

    test('hovering without shift does nothing and releasing shift resets the selection', async () => {
      mockCommits();
      stubNavigation();
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      const [first, second, third] = commitItems(container);

      await fireEvent.mouseOver(second, {shiftKey: true});
      expect(second.classList).not.toContain('hovered');

      await fireEvent.click(first, {shiftKey: true});
      await fireEvent.mouseOver(third, {shiftKey: true});
      expect(second.classList).toContain('hovered');
      await fireEvent.mouseOver(second);
      expect(third.classList).toContain('hovered');

      container.querySelector<HTMLElement>('#diff-commit-list-show-all').focus();
      await fireEvent.keyUp(container.querySelector('#diff-commit-list-show-all'), {key: 'Shift'});
      for (const item of [first, second, third]) {
        expect(item.classList).not.toContain('hovered');
        expect(item.classList).not.toContain('selection');
      }
    });
  });

  describe('since last review', () => {
    test('shows the entry and links to the range after the last review', async () => {
      mockCommits('sha2');
      const nav = stubNavigation();
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      const entry = Array.from(container.querySelectorAll<HTMLElement>('#diff-commit-selector-menu > .item')).find((x) => x.textContent.includes('Since your last review'));
      expect(entry).toBeTruthy();
      expect(entry.classList).not.toContain('disabled');
      expect(entry.textContent).toContain('1 commits');

      await fireEvent.click(entry);
      expect(nav.assign).toHaveBeenLastCalledWith('/user/repo/pulls/1/files/sha2..sha3?style=unified&whitespace=show-all');
      await fireEvent.keyDown(entry, {key: 'Enter'});
      expect(nav.assign).toHaveBeenCalledTimes(2);
    });

    test('disabled when the last review is the newest commit', async () => {
      mockCommits('sha3');
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      const entry = container.querySelector('#diff-commit-selector-menu > .item.disabled');
      expect(entry.textContent).toContain('0 commits');
    });

    test('hidden when the last reviewed commit no longer exists', async () => {
      mockCommits('gone');
      const {container} = render(DiffCommitSelector, {props});
      await openMenu(container);
      expect(container.textContent).not.toContain('Since your last review');
    });
  });
});
