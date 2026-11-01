<script lang="ts">
import {onMount} from 'svelte';
import {useEventListener} from 'runed';
import DiffFileTreeItem, {type DiffFile, type TreeEntry} from './DiffFileTreeItem.svelte';
import {toggleElem} from '../utils/dom.ts';
import {diffTreeStore} from '../modules/stores.svelte.ts';
import {setFileFolding} from '../features/file-fold.js';

const LOCAL_STORAGE_KEY = 'diff_file_tree_visible';

const store = diffTreeStore();

const fileTree = $derived.by(() => {
  const result: TreeEntry[] = [];
  for (const file of store.files as DiffFile[]) {
    // Split file into directories
    const splits = file.Name.split('/');
    let index = 0;
    let parent: TreeEntry | null = null;
    let isFile = false;
    for (const split of splits) {
      index += 1;
      // reached the end
      if (index === splits.length) {
        isFile = true;
      }
      let newParent: TreeEntry = {
        name: split,
        children: [],
        isFile,
      };

      if (isFile === true) {
        newParent.file = file;
      }

      if (parent) {
        // check if the folder already exists
        const existingFolder = parent.children.find(
          (x) => x.name === split,
        );
        if (existingFolder) {
          newParent = existingFolder;
        } else {
          parent.children.push(newParent);
        }
      } else {
        const existingFolder = result.find((x) => x.name === split);
        if (existingFolder) {
          newParent = existingFolder;
        } else {
          result.push(newParent);
        }
      }
      parent = newParent;
    }
  }
  const mergeChildIfOnlyOneDir = (entries: TreeEntry[]) => {
    for (const entry of entries) {
      if (entry.children) {
        mergeChildIfOnlyOneDir(entry.children);
      }
      if (entry.children.length === 1 && entry.children[0].isFile === false) {
        // Merge it to the parent
        entry.name = `${entry.name}/${entry.children[0].name}`;
        entry.children = entry.children[0].children;
      }
    }
  };
  // Merge folders with just a folder as children in order to
  // reduce the depth of our tree.
  mergeChildIfOnlyOneDir(result);
  return result;
});

useEventListener(() => document.querySelector('.diff-toggle-file-tree-button'), 'click', toggleVisibility);
useEventListener(() => window, 'hashchange', hashChangeListener);

onMount(() => {
  // Default to true if unset
  store.fileTreeIsVisible = localStorage.getItem(LOCAL_STORAGE_KEY) !== 'false';
  hashChangeListener();
});

function hashChangeListener() {
  store.selectedItem = window.location.hash;
  expandSelectedFile();
}

function expandSelectedFile() {
  // expand file if the selected file is folded
  if (store.selectedItem) {
    const box = document.querySelector(store.selectedItem as string);
    const folded = box?.getAttribute('data-folded') === 'true';
    if (folded) setFileFolding(box, box.querySelector('.fold-file'), false);
  }
}

function toggleVisibility() {
  updateVisibility(!store.fileTreeIsVisible);
}

function updateVisibility(visible: boolean) {
  store.fileTreeIsVisible = visible;
  localStorage.setItem(LOCAL_STORAGE_KEY, String(store.fileTreeIsVisible));
  updateState(visible);
}

function updateState(visible: boolean) {
  const btn = document.querySelector('.diff-toggle-file-tree-button');
  const [toShow, toHide] = btn.querySelectorAll('.icon');
  const tree = document.getElementById('diff-file-tree');
  const newTooltip = btn.getAttribute(visible ? 'data-hide-text' : 'data-show-text');
  btn.setAttribute('data-tooltip-content', newTooltip);
  toggleElem(tree, visible);
  toggleElem(toShow, !visible);
  toggleElem(toHide, visible);
}
</script>

{#if store.fileTreeIsVisible}
  <div class="diff-file-tree-items">
    <!-- only render the tree if we're visible. in many cases this is something that doesn't change very often -->
    {#each fileTree as item (item.name)}
      <DiffFileTreeItem {item}/>
    {/each}
  </div>
{/if}

<style>
.diff-file-tree-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-inline-end: .5rem;
}
</style>
