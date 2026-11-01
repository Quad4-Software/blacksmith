<!-- This component should be kept the same as templates/repo/actions/status.tmpl
    Please also update the template file above if this component is modified.
    action status accepted: success, skipped, waiting, blocked, running, failure, cancelled, unknown
-->
<script lang="ts">
import SvgIcon from './SvgIcon.svelte';

interface Props {
  status: string;
  size?: number;
  className?: string;
  localeStatus?: string;
  inline?: boolean;
  class?: string;
}

const {
  status,
  size = 16,
  className = '',
  localeStatus = '',
  inline = false,
  class: outerClass = '',
}: Props = $props();

const containerClasses = $derived([inline ? 'tw:inline' : 'tw:flex tw:items-center', outerClass].filter(Boolean).join(' '));
</script>

{#if status}
  <span class={containerClasses} data-tooltip-content={localeStatus || status}>
    {#if status === 'success'}
      <SvgIcon name="octicon-check-circle-fill" class="text green {className}" {size}/>
    {:else if status === 'skipped'}
      <SvgIcon name="octicon-skip" class="text grey {className}" {size}/>
    {:else if status === 'cancelled'}
      <SvgIcon name="octicon-stop" class="text yellow {className}" {size}/>
    {:else if status === 'waiting'}
      <SvgIcon name="octicon-clock" class="text yellow {className}" {size}/>
    {:else if status === 'blocked'}
      <SvgIcon name="octicon-blocked" class="text yellow {className}" {size}/>
    {:else if status === 'running'}
      <SvgIcon name="octicon-meter" class="text yellow job-status-rotate {className}" {size}/>
    {:else}
      <SvgIcon name="octicon-x-circle-fill" class="text red" {size}/>
    {/if}
  </span>
{/if}
