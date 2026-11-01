export type LogMatch = {
  node: Text;
  start: number;
  end: number;
  lineId: string | null;
};

const SKIP_SELECTOR = '.line-num, .log-time, .log-time-stamp, .log-time-seconds';
const MSG_SELECTOR = '.log-msg';
const LINE_SELECTOR = '.job-log-line';

export function findMatches(root: Element, query: string, caseSensitive: boolean, limit: number): LogMatch[] {
  if (!query || limit <= 0) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: LogMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (!parent?.closest(MSG_SELECTOR) || parent.closest(SKIP_SELECTOR)) {
      node = walker.nextNode() as Text | null;
      continue;
    }
    const hay = caseSensitive ? node.data : node.data.toLowerCase();
    let pos = 0;
    let idx = hay.indexOf(needle, pos);
    while (idx !== -1) {
      if (matches.length >= limit) return matches;
      const lineEl = parent.closest(LINE_SELECTOR);
      matches.push({node, start: idx, end: idx + needle.length, lineId: lineEl ? lineEl.id : null});
      pos = idx + needle.length;
      idx = hay.indexOf(needle, pos);
    }
    node = walker.nextNode() as Text | null;
  }
  return matches;
}

export function findFirstErrorLine(lines: string[]): number {
  const re = /\b(?:error|fatal|failed|failure|panic|exception)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

export function supportsHighlightApi(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

export function applyHighlights(matches: LogMatch[], activeIndex: number): void {
  if (!supportsHighlightApi()) return;
  const all = new Highlight();
  let active: Highlight | undefined;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const range = document.createRange();
    range.setStart(m.node, m.start);
    range.setEnd(m.node, m.end);
    all.add(range);
    if (i === activeIndex) {
      active = new Highlight();
      const r = document.createRange();
      r.setStart(m.node, m.start);
      r.setEnd(m.node, m.end);
      active.add(r);
    }
  }
  CSS.highlights.set('action-log-search', all);
  if (active) {
    CSS.highlights.set('action-log-search-active', active);
  } else {
    CSS.highlights.delete('action-log-search-active');
  }
}

export function clearHighlights(): void {
  if (!supportsHighlightApi()) return;
  CSS.highlights.delete('action-log-search');
  CSS.highlights.delete('action-log-search-active');
}
