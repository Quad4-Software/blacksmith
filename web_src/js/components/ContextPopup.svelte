<script lang="ts">
import type {ComponentProps} from 'svelte';
import SvgIcon from './SvgIcon.svelte';
import {contrastColor} from '../utils/color.ts';
import {GET} from '../modules/fetch.ts';
import {emojiHTML} from '../features/emoji.ts';
import {htmlEscape} from 'escape-goat';
import {useEventListener} from 'runed';

const {appSubUrl, i18n} = window.config;

interface IssueInfo {
  created_at: string;
  title: string;
  number: number;
  body: string;
  state: string;
  repository: {full_name: string};
  pull_request: {merged?: boolean, draft?: boolean} | null;
  labels: Array<{name: string, color: string}>;
}

interface LoadData {
  owner: string;
  repo: string;
  index: number | string;
}

let root: HTMLDivElement | undefined = $state();
let loading = $state(false);
let issue: IssueInfo | null = $state(null);
let i18nErrorMessage: string | null = $state(null);

const createdAt = $derived(issue ? new Date(issue.created_at).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}) : '');

const body = $derived.by(() => {
  if (!issue) return '';
  const text = issue.body.replace(/\n+/g, ' ');
  if (text.length > 85) {
    return `${text.substring(0, 85)}…`;
  }
  return text;
});

const icon: ComponentProps<typeof SvgIcon>['name'] = $derived.by(() => {
  if (!issue) return 'octicon-issue-opened';
  if (issue.pull_request !== null) {
    if (issue.pull_request.merged === true) {
      return 'octicon-git-merge'; // Merged PR
    }

    if (issue.state === 'closed') {
      return 'octicon-git-pull-request-closed'; // Closed PR
    }

    if (issue.pull_request.draft === true) {
      return 'octicon-git-pull-request-draft'; // WIP PR
    }

    return 'octicon-git-pull-request'; // Open PR
  }

  if (issue.state === 'closed') {
    return 'octicon-issue-closed'; // Closed issue
  }

  return 'octicon-issue-opened'; // Open issue
});

const color = $derived.by(() => {
  if (!issue) return '';
  if (issue.pull_request !== null) {
    if (issue.pull_request.merged === true) {
      return 'purple'; // Merged PR
    }

    if (issue.pull_request.draft === true && issue.state === 'open') {
      return 'grey'; // WIP PR
    }
  }

  if (issue.state === 'closed') {
    return 'red'; // Closed issue
  }

  return 'green'; // Open issue
});

const labels = $derived.by(() => {
  if (!issue) return [];
  return issue.labels.map((label) => ({
    name: htmlEscape(label.name).replaceAll(/:[-+\w]+:/g, (emoji) => {
      return emojiHTML(emoji.substring(1, emoji.length - 1));
    }),
    color: `#${label.color}`,
    textColor: contrastColor(`#${label.color}`),
  }));
});

async function load(data: LoadData) {
  loading = true;
  i18nErrorMessage = null;

  try {
    const response = await GET(`${appSubUrl}/${data.owner}/${data.repo}/issues/${data.index}/info`);
    const respJson = await response.json();
    if (!response.ok) {
      i18nErrorMessage = respJson.message ?? i18n.network_error;
      return;
    }
    issue = respJson;
  } catch {
    i18nErrorMessage = i18n.network_error;
  } finally {
    loading = false;
  }
}

useEventListener(() => root, 'ce-load-context-popup', (e) => {
  const data = (e as CustomEvent<LoadData>).detail;
  if (!loading && issue === null) {
    load(data);
  }
});
</script>

<div bind:this={root}>
  {#if loading}
    <div class="tw:h-12 tw:w-12 is-loading"></div>
  {/if}
  {#if !loading && issue !== null}
    <div id="issue-info-popup">
      <p><small>{issue.repository.full_name} on {createdAt}</small></p>
      <p><SvgIcon name={icon} class="text {color}"/> <strong>{issue.title}</strong> #{issue.number}</p>
      <p>{body}</p>
      <div class="labels-list">
        {#each labels as label (label.name)}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- label name is html-escaped, only emoji markup generated locally is added -->
          <div class="ui label" style:color={label.textColor} style:background-color={label.color}>{@html label.name}</div>
        {/each}
      </div>
    </div>
  {/if}
  {#if !loading && issue === null}
    <div>
      <p><small>{i18n.error_occurred}</small></p>
      <p>{i18nErrorMessage}</p>
    </div>
  {/if}
</div>
