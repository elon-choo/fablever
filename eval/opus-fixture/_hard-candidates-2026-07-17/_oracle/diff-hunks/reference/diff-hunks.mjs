export function diffHunks(a, b, context = 3) {
  const n = a.length;
  const m = b.length;

  // L[i][j] = length of the LCS of a.slice(i) and b.slice(j).
  const L = [];
  for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j]
        ? 1 + L[i + 1][j + 1]
        : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }

  // Forward walk: match as early as possible, deletions win ties.
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ type: 'ctx', text: a[i] });
      i++;
      j++;
    } else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) {
      ops.push({ type: 'del', text: a[i] });
      i++;
    } else {
      ops.push({ type: 'ins', text: b[j] });
      j++;
    }
  }

  const changes = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].type !== 'ctx') changes.push(k);
  }
  if (changes.length === 0) return [];

  // Group changes: merge when the unchanged gap is at most 2 * context.
  const groups = [];
  let first = changes[0];
  let last = changes[0];
  for (let t = 1; t < changes.length; t++) {
    const gap = changes[t] - last - 1;
    if (gap <= 2 * context) {
      last = changes[t];
    } else {
      groups.push([first, last]);
      first = changes[t];
      last = changes[t];
    }
  }
  groups.push([first, last]);

  const hunks = [];
  for (const [groupFirst, groupLast] of groups) {
    const start = Math.max(0, groupFirst - context);
    const end = Math.min(ops.length - 1, groupLast + context);

    let aOffset = 0;
    let bOffset = 0;
    for (let k = 0; k < start; k++) {
      if (ops[k].type !== 'ins') aOffset++;
      if (ops[k].type !== 'del') bOffset++;
    }

    let aCount = 0;
    let bCount = 0;
    const lines = [];
    for (let k = start; k <= end; k++) {
      const op = ops[k];
      if (op.type === 'ctx') {
        aCount++;
        bCount++;
        lines.push(' ' + op.text);
      } else if (op.type === 'del') {
        aCount++;
        lines.push('-' + op.text);
      } else {
        bCount++;
        lines.push('+' + op.text);
      }
    }

    const aStart = aCount > 0 ? aOffset + 1 : aOffset;
    const bStart = bCount > 0 ? bOffset + 1 : bOffset;
    hunks.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@\n${lines.join('\n')}`);
  }

  return hunks;
}
