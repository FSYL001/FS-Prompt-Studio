export type DiffLineType = 'same' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/** 按行做 LCS 差异对比，用于历史版本比较。超长文本降级为逐行集合对比。 */
export function diffLines(leftText: string, rightText: string): DiffResult {
  const left = leftText.replace(/\r\n/g, '\n').split('\n');
  const right = rightText.replace(/\r\n/g, '\n').split('\n');

  if (left.length > 1500 || right.length > 1500) {
    return naiveDiff(left, right);
  }

  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let endLeft = left.length;
  let endRight = right.length;
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) {
    endLeft--;
    endRight--;
  }

  const a = left.slice(start, endLeft);
  const b = right.slice(start, endRight);
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) {
    return { lines: left.map((text) => ({ type: 'same', text })), added: 0, removed: 0 };
  }

  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const mid: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      mid.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      mid.push({ type: 'remove', text: a[i] });
      removed++;
      i++;
    } else {
      mid.push({ type: 'add', text: b[j] });
      added++;
      j++;
    }
  }
  while (i < n) {
    mid.push({ type: 'remove', text: a[i++] });
    removed++;
  }
  while (j < m) {
    mid.push({ type: 'add', text: b[j++] });
    added++;
  }

  return {
    lines: [
      ...left.slice(0, start).map((text) => ({ type: 'same' as const, text })),
      ...mid,
      ...left.slice(endLeft).map((text) => ({ type: 'same' as const, text })),
    ],
    added,
    removed,
  };
}

function naiveDiff(left: string[], right: string[]): DiffResult {
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (left[i] === right[i]) {
      if (left[i] !== undefined) lines.push({ type: 'same', text: left[i] });
    } else {
      if (left[i] !== undefined) {
        lines.push({ type: 'remove', text: left[i] });
        removed++;
      }
      if (right[i] !== undefined) {
        lines.push({ type: 'add', text: right[i] });
        added++;
      }
    }
  }
  return { lines, added, removed };
}
