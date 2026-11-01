<script lang="ts" module>
export interface DiffFile {
  Name: string;
  NameHash: string;
  Type: number;
  OnPage: number;
  IsViewed: boolean;
}

export interface TreeEntry {
  name: string;
  isFile: boolean;
  children: TreeEntry[];
  file?: DiffFile;
}
</script>

<script lang="ts">
import SvgIcon from './SvgIcon.svelte';
// eslint-disable-next-line import-x/no-self-import -- the tree item renders itself recursively for its children
import DiffFileTreeItem from './DiffFileTreeItem.svelte';
import {diffTreeStore} from '../modules/stores.svelte.ts';
import {loadMoreFiles} from '../features/repo-diff.js';
import type {ComponentProps} from 'svelte';

type IconName = ComponentProps<typeof SvgIcon>['name'];

interface Props {
  item: TreeEntry;
}

const {item}: Props = $props();

const store = diffTreeStore();

let collapsed = $state(false);

const diffTypes: Record<number, {name: IconName; classes: string[]}> = {
  1: {name: 'octicon-diff-added', classes: ['text', 'green']},
  2: {name: 'octicon-diff-modified', classes: ['text', 'yellow']},
  3: {name: 'octicon-diff-removed', classes: ['text', 'red']},
  4: {name: 'octicon-diff-renamed', classes: ['text', 'teal']},
  5: {name: 'octicon-diff-renamed', classes: ['text', 'green']}, // there is no octicon for copied, so renamed should be ok
};

async function loadMoreData(event: Event) {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  params.set('file-only', 'true');

  for (let page = (store.currentPage as number) + 1; page <= item.file.OnPage; page++) {
    params.set('diff-page', String(page));
    await loadMoreFiles(`?${params.toString()}`);
  }
  window.location.hash = `#diff-${item.file.NameHash}`;
}

function onKeyActivate(event: KeyboardEvent, action: (e: Event) => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  action(event);
}

function toggleCollapsed(event: Event) {
  event.stopPropagation();
  collapsed = !collapsed;
}
</script>

<!--title instead of tooltip above as the tooltip needs too much work with the current methods, i.e. not being loaded or staying open for "too long"-->
{#if item.isFile}
  <!-- the anchor is required by the Fomantic and tree styles and acts as a button through its role and key handler -->
  <!-- svelte-ignore a11y_missing_attribute -->
  <a
    class={['item-file', {selected: store.selectedItem === `#diff-${item.file.NameHash}`, viewed: item.file.IsViewed}]}
    role="button" tabindex="0"
    title={item.name} onclick={loadMoreData} onkeydown={(e) => onKeyActivate(e, loadMoreData)}
  >
    <!-- file -->
    <SvgIcon name="octicon-file"/>
    <span class="gt-ellipsis tw:flex-1">{item.name}</span>
    <SvgIcon name={diffTypes[item.file.Type].name} class={diffTypes[item.file.Type].classes.join(' ')}/>
  </a>
{:else}
  <div class="item-directory" role="button" tabindex="0" title={item.name} onclick={toggleCollapsed} onkeydown={(e) => onKeyActivate(e, toggleCollapsed)}>
    <!-- directory -->
    <SvgIcon name={collapsed ? 'octicon-chevron-right' : 'octicon-chevron-down'}/>
    <SvgIcon class="text primary" name="octicon-file-directory-fill"/>
    <span class="gt-ellipsis">{item.name}</span>
  </div>
{/if}

{#if item.children?.length}
  <div class="sub-items" style:display={collapsed ? 'none' : null}>
    {#each item.children as childItem (childItem.name)}
      <DiffFileTreeItem item={childItem}/>
    {/each}
  </div>
{/if}

<style>
a, a:hover {
  text-decoration: none;
  color: var(--color-text);
}

.sub-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-inline-start: 13px;
  border-inline-start: 1px solid var(--color-secondary);
}

.sub-items :global(.item-file) {
  padding-inline-start: 18px;
}

.item-file.selected {
  color: var(--color-text);
  background: var(--color-active);
  border-radius: 4px;
}

.item-file.viewed {
  color: var(--color-text-light-3);
}

.item-file,
.item-directory {
  display: flex;
  align-items: center;
  gap: 0.25em;
  padding: 3px 6px;
}

.item-file:hover,
.item-directory:hover {
  color: var(--color-text);
  background: var(--color-hover);
  border-radius: 4px;
  cursor: pointer;
}
</style>
