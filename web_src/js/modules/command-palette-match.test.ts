import {expect, test} from 'vitest';
import {rankItems, scoreMatch} from './command-palette-match.ts';

test('scoreMatch returns null when query is not a subsequence', () => {
  expect(scoreMatch('xyz', 'dashboard')).toBeNull();
});

test('scoreMatch matches case-insensitively', () => {
  expect(scoreMatch('DASH', 'dashboard')).toBeTruthy();
  expect(scoreMatch('dash', 'Dashboard')).toBeTruthy();
});

test('scoreMatch returns indexes for highlight', () => {
  const m = scoreMatch('db', 'dashboard');
  expect(m?.indexes).toEqual([0, 4]);
});

test('scoreMatch prefers prefix over later match', () => {
  const a = scoreMatch('repo', 'repository')!;
  const b = scoreMatch('repo', 'my repository')!;
  expect(a.score).toBeGreaterThan(b.score);
});

test('scoreMatch prefers word starts and consecutive runs', () => {
  const wordStart = scoreMatch('rp', 'repo pulls')!;
  const midWord = scoreMatch('rp', 'sharp')!;
  expect(wordStart.score).toBeGreaterThan(midWord.score);
});

test('scoreMatch empty query matches with score 0', () => {
  expect(scoreMatch('', 'anything')).toEqual({score: 0, indexes: []});
});

test('rankItems sorts by score and drops non-matches', () => {
  const items = [
    {label: 'notifications'},
    {label: 'repository settings'},
    {label: 'repositories'},
    {label: 'unrelated'},
  ];
  const ranked = rankItems(items, 'repo');
  expect(ranked.map((x) => x.item.label)).toEqual(['repositories', 'repository settings']);
});
