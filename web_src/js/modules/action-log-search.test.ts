import {afterEach, describe, expect, test, vi} from 'vitest';
import {applyHighlights, clearHighlights, findFirstErrorLine, findMatches, supportsHighlightApi} from './action-log-search.ts';

function makeRoot(html: string): Element {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const line = (id: string, text: string) =>
  `<div class="job-log-line" id="${id}"><a class="line-num">1</a><span class="log-time-stamp">00:01</span><span class="log-msg">${text}</span></div>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findMatches', () => {
  test('returns [] for empty query', () => {
    const root = makeRoot(line('jobstep-1-1', 'hello world'));
    expect(findMatches(root, '', false, 10)).toEqual([]);
    expect(findMatches(root, '   ', true, 10)).toEqual([]);
  });

  test('finds multiple matches per node with correct offsets', () => {
    const root = makeRoot(line('jobstep-1-2', 'aba aba aba'));
    const m = findMatches(root, 'aba', false, 10);
    expect(m.length).toEqual(3);
    expect(m.map((x) => [x.start, x.end])).toEqual([[0, 3], [4, 7], [8, 11]]);
    expect(m[0].node.textContent).toEqual('aba aba aba');
  });

  test('case-insensitive by default, case-sensitive when asked', () => {
    const root = makeRoot(line('jobstep-1-3', 'Error error ERROR'));
    expect(findMatches(root, 'error', false, 10).length).toEqual(3);
    expect(findMatches(root, 'error', true, 10).length).toEqual(1);
    expect(findMatches(root, 'Error', true, 10).length).toEqual(1);
  });

  test('respects the limit cap', () => {
    const root = makeRoot(line('jobstep-1-4', 'x x x x x x'));
    expect(findMatches(root, 'x', false, 3).length).toEqual(3);
  });

  test('skips line-num and timestamp elements', () => {
    const root = makeRoot(line('jobstep-1-5', 'msg'));
    expect(findMatches(root, '1', false, 10).length).toEqual(0);
    expect(findMatches(root, '00:01', false, 10).length).toEqual(0);
  });

  test('only matches inside .log-msg', () => {
    const root = makeRoot(`<div class="job-log-line" id="x"><span class="other">needle</span></div>`);
    expect(findMatches(root, 'needle', false, 10).length).toEqual(0);
  });

  test('regex special characters are matched literally', () => {
    const root = makeRoot(line('jobstep-1-6', 'a.b (x) [y] a-b'));
    expect(findMatches(root, 'a.b', false, 10).length).toEqual(1);
    expect(findMatches(root, '(x)', false, 10).length).toEqual(1);
    expect(findMatches(root, '[y]', false, 10).length).toEqual(1);
    expect(findMatches(root, 'a-b', false, 10).length).toEqual(1);
    expect(findMatches(root, 'aXb', false, 10).length).toEqual(0);
  });

  test('lineId comes from the closest .job-log-line ancestor', () => {
    const root = makeRoot(line('jobstep-2-7', 'match'));
    const m = findMatches(root, 'match', false, 10);
    expect(m[0].lineId).toEqual('jobstep-2-7');
    const bare = makeRoot(`<span class="log-msg">match</span>`);
    expect(findMatches(bare, 'match', false, 10)[0].lineId).toBeNull();
  });

  test('document order across lines', () => {
    const root = makeRoot(line('a', 'foo') + line('b', 'foo'));
    const m = findMatches(root, 'foo', false, 10);
    expect(m.map((x) => x.lineId)).toEqual(['a', 'b']);
  });
});

describe('findFirstErrorLine', () => {
  test('finds the first matching line', () => {
    expect(findFirstErrorLine(['ok', 'it failed here', 'also fine'])).toEqual(1);
  });
  test('returns -1 when nothing matches', () => {
    expect(findFirstErrorLine(['all good', 'still good'])).toEqual(-1);
  });
  test('word boundaries: matches error: and Error, not terror or errors', () => {
    expect(findFirstErrorLine(['terror'])).toEqual(-1);
    expect(findFirstErrorLine(['errors everywhere'])).toEqual(-1);
    expect(findFirstErrorLine(['error: boom'])).toEqual(0);
    expect(findFirstErrorLine(['Error detected'])).toEqual(0);
    expect(findFirstErrorLine(['panic!'])).toEqual(0);
  });
});

describe('highlight api', () => {
  test('supportsHighlightApi reflects globals', () => {
    expect(typeof supportsHighlightApi()).toBe('boolean');
  });

  test('applyHighlights is a no-op when unsupported', () => {
    vi.stubGlobal('Highlight', undefined);
    const css = {highlights: new Map()};
    vi.stubGlobal('CSS', css);
    const root = makeRoot(line('x', 'match'));
    expect(() => applyHighlights(findMatches(root, 'match', false, 1), 0)).not.toThrow();
    expect(css.highlights.size).toEqual(0);
  });

  test('applyHighlights and clearHighlights manage both names', () => {
    class FakeHighlight extends Set {
      constructor(...args: unknown[]) { super(); for (const a of args) this.add(a); }
    }
    const css = {highlights: new Map()};
    vi.stubGlobal('CSS', css);
    vi.stubGlobal('Highlight', FakeHighlight);
    const root = makeRoot(line('x', 'foo foo'));
    const m = findMatches(root, 'foo', false, 10);
    applyHighlights(m, 1);
    expect(css.highlights.get('action-log-search').size).toEqual(2);
    expect(css.highlights.get('action-log-search-active').size).toEqual(1);
    clearHighlights();
    expect(css.highlights.size).toEqual(0);
  });
});
