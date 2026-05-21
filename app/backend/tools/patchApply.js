/**
 * Apply a simple unified-style diff to file content.
 * Lines prefixed with '-' are removed, '+' lines are inserted.
 * Context lines (no prefix / ' ' prefix) must match for anchoring.
 */
export function applyPatch(original, diff) {
  const origLines = original.split('\n');
  const diffLines = diff.split('\n');

  // Build a list of hunks: sequences of +/- lines with surrounding context
  const result = [...origLines];
  let origIdx = 0;
  let resultOffset = 0;

  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@') || line === '') {
      i++;
      continue;
    }

    if (line.startsWith('-')) {
      // Remove line — find first match from origIdx onwards
      const target = line.slice(1);
      const foundAt = findLine(result, target, origIdx + resultOffset);
      if (foundAt !== -1) {
        result.splice(foundAt, 1);
        resultOffset--;
      }
      i++;
    } else if (line.startsWith('+')) {
      const target = line.slice(1);
      // Insert after last matched context/remove position
      const insertAt = origIdx + resultOffset;
      result.splice(insertAt, 0, target);
      resultOffset++;
      origIdx++;
      i++;
    } else {
      // Context line — advance origIdx past it
      const ctx = line.startsWith(' ') ? line.slice(1) : line;
      const foundAt = findLine(result, ctx, origIdx + resultOffset);
      if (foundAt !== -1) origIdx = foundAt - resultOffset + 1;
      i++;
    }
  }

  return result.join('\n');
}

function findLine(lines, target, fromIdx) {
  for (let i = Math.max(0, fromIdx); i < lines.length; i++) {
    if (lines[i] === target) return i;
  }
  return -1;
}
