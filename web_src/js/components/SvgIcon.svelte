<script lang="ts">
import {svgParseOuterInner} from '../svg.ts';

interface Props {
  name: Parameters<typeof svgParseOuterInner>[0];
  size?: number;
  symbolId?: string;
  class?: string;
  [key: string]: unknown;
}

const {name, size = 16, symbolId, class: className, ...restProps}: Props = $props();

const parsed = $derived(svgParseOuterInner(name));

const svgAttrs = $derived.by(() => {
  const attrs: Record<string, string> = {};
  for (const attr of parsed.svgOuter.attributes) {
    if (attr.name === 'class') continue;
    attrs[attr.name] = attr.value;
  }
  attrs.width = String(size);
  attrs.height = String(size);
  return attrs;
});

const classes = $derived.by(() => {
  const list = Array.from(parsed.svgOuter.classList);
  if (className) list.push(...className.split(/\s+/).filter(Boolean));
  if (symbolId) list.push('tw:hidden', 'svg-symbol-container');
  return list.join(' ');
});

const innerHtml = $derived.by(() => {
  if (!symbolId) return parsed.svgInnerHtml;
  return `<symbol id="${symbolId}" viewBox="${svgAttrs.viewBox ?? ''}">${parsed.svgInnerHtml}</symbol>`;
});
</script>

<svg {...svgAttrs} {...restProps} class={classes}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- inner markup is generated locally from bundled svg files -->
  {@html innerHtml}
</svg>
