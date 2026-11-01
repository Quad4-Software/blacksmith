import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {render, fireEvent} from '@testing-library/svelte';
import {tick} from 'svelte';
import DiffFileTree from './DiffFileTree.svelte';
import {diffTreeStore} from '../modules/stores.svelte.ts';
import {loadMoreFiles} from '../features/repo-diff.js';

vi.mock('../features/repo-diff.js', () => ({
  loadMoreFiles: vi.fn(),
}));

type TestFile = {Name: string, NameHash: string, Type: number, OnPage: number, IsViewed: boolean};

window.config.pageData.diffFileInfo = {
  files: [],
  fileTreeIsVisible: false,
  fileListIsVisible: false,
  isLoadingNewData: false,
  selectedItem: '',
  currentPage: 1,
};
// the same shared reactive object that other non component code mutates through pageData
const store = diffTreeStore();

function file(name: string, extra: Partial<TestFile> = {}): TestFile {
  return {Name: name, NameHash: `hash-${name.replaceAll(/\W/g, '-')}`, Type: 2, OnPage: 1, IsViewed: false, ...extra};
}

function resetStore(files: TestFile[]) {
  store.files = files;
  store.fileTreeIsVisible = false;
  store.selectedItem = '';
  store.currentPage = 1;
  store.isLoadingNewData = false;
}

function addToggleButton() {
  document.body.insertAdjacentHTML('beforeend', `
    <button class="diff-toggle-file-tree-button" data-show-text="Show tree" data-hide-text="Hide tree" data-tooltip-content="Hide tree">
      <span class="icon" id="to-show">show</span><span class="icon" id="to-hide">hide</span>
    </button>
    <div id="diff-file-tree"></div>`);
  return document.querySelector<HTMLElement>('.diff-toggle-file-tree-button');
}

describe('DiffFileTree', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('rendering', () => {
    test('renders nothing when the tree is hidden in local storage', async () => {
      localStorage.setItem('diff_file_tree_visible', 'false');
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      expect(container.querySelector('.diff-file-tree-items')).toBeNull();
      expect(store.fileTreeIsVisible).toBe(false);
    });

    test('is visible by default and marks the store as visible', async () => {
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      expect(store.fileTreeIsVisible).toBe(true);
      expect(container.querySelectorAll('.diff-file-tree-items > a.item-file').length).toEqual(1);
    });

    test('builds a directory tree and merges directories with a single directory child', async () => {
      resetStore([
        file('a/b/c.txt'),
        file('a/b/d.txt'),
        file('a/e.txt'),
        file('README.md'),
        file('src/x/y/z.go'),
      ]);
      const {container} = render(DiffFileTree);
      await tick();

      const root = container.querySelector('.diff-file-tree-items');
      const top = Array.from(root.children);
      expect(top.map((x) => x.className.split(' ')[0])).toEqual(['item-directory', 'sub-items', 'item-file', 'item-directory', 'sub-items']);
      expect(top[0].getAttribute('title')).toEqual('a');
      expect(top[2].getAttribute('title')).toEqual('README.md');
      expect(top[3].getAttribute('title')).toEqual('src/x/y');

      const aChildren = Array.from(top[1].children);
      expect(aChildren.map((x) => x.className.split(' ')[0])).toEqual(['item-directory', 'sub-items', 'item-file']);
      expect(aChildren.map((x) => x.getAttribute('title'))).toEqual(['b', null, 'e.txt']);
      const bChildren = Array.from(aChildren[1].children);
      expect(bChildren.map((x) => x.getAttribute('title'))).toEqual(['c.txt', 'd.txt']);
      expect(top[4].children[0].getAttribute('title')).toEqual('z.go');
    });

    test('file entries show icons for the diff type', async () => {
      resetStore([file('added', {Type: 1}), file('modified', {Type: 2}), file('removed', {Type: 3}), file('renamed', {Type: 4}), file('copied', {Type: 5})]);
      const {container} = render(DiffFileTree);
      await tick();
      const expected = [
        ['octicon-diff-added', 'green'],
        ['octicon-diff-modified', 'yellow'],
        ['octicon-diff-removed', 'red'],
        ['octicon-diff-renamed', 'teal'],
        ['octicon-diff-renamed', 'green'],
      ];
      const items = container.querySelectorAll('a.item-file');
      expect(items.length).toEqual(5);
      for (const [i, [icon, color]] of expected.entries()) {
        const svgs = items[i].querySelectorAll('svg');
        expect(svgs[0].classList).toContain('octicon-file');
        expect(svgs[1].classList).toContain(icon);
        expect(svgs[1].classList).toContain('text');
        expect(svgs[1].classList).toContain(color);
      }
    });

    test('directories show chevron and folder icons', async () => {
      resetStore([file('dir/a.txt'), file('dir/b.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      const svgs = container.querySelectorAll('.item-directory svg');
      expect(svgs[0].classList).toContain('octicon-chevron-down');
      expect(svgs[1].classList).toContain('octicon-file-directory-fill');
      expect(svgs[1].classList).toContain('primary');
    });

    test('marks the selected and viewed files', async () => {
      resetStore([file('a.txt', {IsViewed: true}), file('b.txt')]);
      window.location.hash = '#diff-hash-b-txt';
      const {container} = render(DiffFileTree);
      await tick();
      const [a, b] = container.querySelectorAll('a.item-file');
      expect(a.classList).toContain('viewed');
      expect(a.classList).not.toContain('selected');
      expect(b.classList).toContain('selected');
      expect(b.classList).not.toContain('viewed');
      expect(store.selectedItem).toEqual('#diff-hash-b-txt');
    });
  });

  describe('reactivity with the shared store', () => {
    test('files added by other code through pageData appear', async () => {
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      expect(container.querySelectorAll('a.item-file').length).toEqual(1);

      const info = window.config.pageData.diffFileInfo as {files: TestFile[]};
      expect(info).toBe(store);
      // this is what the diff-data-script in templates/repo/diff/box.tmpl does when more files are loaded
      Object.assign(info, {currentPage: 2});
      info.files.push(file('dir/b.txt'), file('dir/c.txt'));
      await tick();
      expect(container.querySelectorAll('a.item-file').length).toEqual(3);
      expect(container.querySelector('.item-directory').getAttribute('title')).toEqual('dir');
    });

    test('viewed state changes made by other code are reflected', async () => {
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      expect(container.querySelector('a.item-file').classList).not.toContain('viewed');
      (store.files as TestFile[]).find((x) => x.Name === 'a.txt').IsViewed = true;
      await tick();
      expect(container.querySelector('a.item-file').classList).toContain('viewed');
    });

    test('visibility changes of the store show and hide the tree', async () => {
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      store.fileTreeIsVisible = false;
      await tick();
      expect(container.querySelector('.diff-file-tree-items')).toBeNull();
      store.fileTreeIsVisible = true;
      await tick();
      expect(container.querySelector('.diff-file-tree-items')).toBeTruthy();
    });
  });

  describe('interaction', () => {
    test('clicking a directory collapses and expands its children', async () => {
      resetStore([file('top/inner/a.txt'), file('top/inner/b.txt'), file('top/c.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      const topDir = container.querySelector<HTMLElement>('.item-directory');
      const subItems = container.querySelector<HTMLElement>('.sub-items');
      expect(subItems.style.display).toEqual('');

      await fireEvent.click(topDir);
      expect(subItems.style.display).toEqual('none');
      expect(topDir.querySelector('svg').classList).toContain('octicon-chevron-right');

      await fireEvent.click(topDir);
      expect(subItems.style.display).toEqual('');
      expect(topDir.querySelector('svg').classList).toContain('octicon-chevron-down');
    });

    test('collapsing a nested directory does not collapse its parent', async () => {
      resetStore([file('top/inner/a.txt'), file('top/inner/b.txt'), file('top/c.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      const [topDir, innerDir] = container.querySelectorAll<HTMLElement>('.item-directory');
      const [topSub, innerSub] = container.querySelectorAll<HTMLElement>('.sub-items');
      await fireEvent.click(innerDir);
      expect(innerSub.style.display).toEqual('none');
      expect(topSub.style.display).toEqual('');
      expect(topDir.querySelector('svg').classList).toContain('octicon-chevron-down');
    });

    test('directories can be toggled with the keyboard', async () => {
      resetStore([file('top/a.txt'), file('top/b.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      const dir = container.querySelector<HTMLElement>('.item-directory');
      await fireEvent.keyDown(dir, {key: 'Enter'});
      expect(container.querySelector<HTMLElement>('.sub-items').style.display).toEqual('none');
      await fireEvent.keyDown(dir, {key: 'x'});
      expect(container.querySelector<HTMLElement>('.sub-items').style.display).toEqual('none');
    });

    test('clicking a file loads all pages up to the page of the file then jumps to it', async () => {
      resetStore([file('a.txt'), file('b.txt', {OnPage: 3})]);
      store.currentPage = 1;
      const {container} = render(DiffFileTree);
      await tick();
      window.history.replaceState({}, '', '/?style=split');
      await fireEvent.click(container.querySelectorAll('a.item-file')[1]);
      await vi.waitFor(() => expect(window.location.hash).toEqual('#diff-hash-b-txt'));
      expect(loadMoreFiles).toHaveBeenCalledTimes(2);
      expect(vi.mocked(loadMoreFiles).mock.calls[0][0]).toEqual('?style=split&file-only=true&diff-page=2');
      expect(vi.mocked(loadMoreFiles).mock.calls[1][0]).toEqual('?style=split&file-only=true&diff-page=3');
      window.history.replaceState({}, '', '/');
    });

    test('clicking a file already on the current page only jumps to it', async () => {
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      await fireEvent.keyDown(container.querySelector('a.item-file'), {key: 'Enter'});
      await vi.waitFor(() => expect(window.location.hash).toEqual('#diff-hash-a-txt'));
      expect(loadMoreFiles).not.toHaveBeenCalled();
    });

    test('hash changes update the selected file', async () => {
      resetStore([file('a.txt'), file('b.txt')]);
      const {container} = render(DiffFileTree);
      await tick();
      expect(container.querySelector('a.item-file.selected')).toBeNull();
      window.location.hash = '#diff-hash-a-txt';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await tick();
      expect(container.querySelector('a.item-file.selected').getAttribute('title')).toEqual('a.txt');
      window.location.hash = '#diff-hash-b-txt';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await tick();
      expect(container.querySelector('a.item-file.selected').getAttribute('title')).toEqual('b.txt');
    });

    test('a folded file box is expanded when it becomes selected', async () => {
      resetStore([file('a.txt')]);
      document.body.insertAdjacentHTML('beforeend', '<div id="diff-hash-a-txt" data-folded="true"><span class="fold-file"></span></div>');
      const box = document.getElementById('diff-hash-a-txt');
      window.location.hash = '#diff-hash-a-txt';
      render(DiffFileTree);
      await tick();
      expect(box.getAttribute('data-folded')).toEqual('false');
      expect(box.querySelector('.fold-file svg.octicon-chevron-down')).toBeTruthy();
    });
  });

  describe('toggle button', () => {
    test('toggles visibility, local storage and the button state', async () => {
      const button = addToggleButton();
      resetStore([file('a.txt')]);
      const {container} = render(DiffFileTree, {target: document.getElementById('diff-file-tree')});
      await tick();
      expect(container.querySelector('.diff-file-tree-items')).toBeTruthy();

      await fireEvent.click(button);
      expect(store.fileTreeIsVisible).toBe(false);
      expect(localStorage.getItem('diff_file_tree_visible')).toEqual('false');
      expect(button.getAttribute('data-tooltip-content')).toEqual('Show tree');
      expect(document.getElementById('diff-file-tree').classList).toContain('tw:hidden');
      expect(document.getElementById('to-show').classList).not.toContain('tw:hidden');
      expect(document.getElementById('to-hide').classList).toContain('tw:hidden');
      expect(document.querySelector('.diff-file-tree-items')).toBeNull();

      await fireEvent.click(button);
      expect(store.fileTreeIsVisible).toBe(true);
      expect(localStorage.getItem('diff_file_tree_visible')).toEqual('true');
      expect(button.getAttribute('data-tooltip-content')).toEqual('Hide tree');
      expect(document.getElementById('diff-file-tree').classList).not.toContain('tw:hidden');
      expect(document.getElementById('to-show').classList).toContain('tw:hidden');
      expect(document.getElementById('to-hide').classList).not.toContain('tw:hidden');
      expect(document.querySelector('.diff-file-tree-items')).toBeTruthy();
    });

    test('listeners are removed when the component is destroyed', async () => {
      const button = addToggleButton();
      resetStore([file('a.txt')]);
      const {unmount} = render(DiffFileTree, {target: document.getElementById('diff-file-tree')});
      await tick();
      unmount();
      await fireEvent.click(button);
      expect(store.fileTreeIsVisible).toBe(true);
      expect(localStorage.getItem('diff_file_tree_visible')).toBeNull();
      window.location.hash = '#diff-other';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      expect(store.selectedItem).toEqual('');
    });
  });
});
