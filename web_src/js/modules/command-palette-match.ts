export interface MatchResult {
  score: number;
  indexes: number[];
}

export function scoreMatch(query: string, label: string): MatchResult | null {
  const q = query.trim().toLowerCase();
  const l = label.toLowerCase();
  if (!q) return {score: 0, indexes: []};

  const indexes: number[] = [];
  let qi = 0;
  for (let li = 0; li < l.length && qi < q.length; li++) {
    if (l[li] === q[qi]) {
      indexes.push(li);
      qi++;
    }
  }
  if (qi < q.length) return null;

  let score = 0;
  let prev = -2;
  for (const i of indexes) {
    if (i === 0) {
      score += 16; // match at the very start of the label
    } else if (/\s|[-_/.]/.test(l[i - 1])) {
      score += 8; // word start
    } else {
      score += 1;
    }
    if (i === prev + 1) score += 6; // consecutive run
    prev = i;
  }
  score -= indexes[indexes.length - 1] / 100; // prefer earlier completion of the match
  return {score, indexes};
}

export function rankItems<T extends {label: string}>(
  items: T[],
  query: string,
): Array<{item: T; match: MatchResult}> {
  const out: Array<{item: T; match: MatchResult}> = [];
  for (const item of items) {
    const match = scoreMatch(query, item.label);
    if (match) out.push({item, match});
  }
  out.sort((a, b) => (b.match.score - a.match.score) || (a.item.label.length - b.item.label.length));
  return out;
}
