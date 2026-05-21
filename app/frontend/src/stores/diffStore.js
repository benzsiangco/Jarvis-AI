import { create } from 'zustand';

/**
 * diffStore — tracks file modifications within a session.
 * Each diff records the original content, modified content, and computed stats.
 */
const useDiffStore = create((set, get) => ({
  // Map of filePath → { original, modified, language, timestamp }
  diffs: {},

  // Currently selected diff path for review
  reviewPath: null,

  // Whether review panel is open
  reviewOpen: false,

  /** Record a file diff (called when AI writes/patches a file) */
  recordDiff: (filePath, original, modified, language) => {
    const stats = computeStats(original, modified);
    set((state) => ({
      diffs: {
        ...state.diffs,
        [filePath]: {
          path: filePath,
          name: filePath.split(/[\\/]/).pop(),
          original: original || '',
          modified: modified || '',
          language: language || 'plaintext',
          additions: stats.additions,
          deletions: stats.deletions,
          hunks: stats.hunks,
          timestamp: Date.now(),
        },
      },
    }));
  },

  /** Open the review panel for a specific file */
  openReview: (filePath) => {
    set({ reviewPath: filePath || null, reviewOpen: true });
  },

  /** Close the review panel */
  closeReview: () => {
    set({ reviewOpen: false });
  },

  /** Toggle review panel */
  toggleReview: () => {
    set((state) => ({ reviewOpen: !state.reviewOpen }));
  },

  /** Accept a diff (remove from pending) */
  acceptDiff: (filePath) => {
    set((state) => {
      const next = { ...state.diffs };
      delete next[filePath];
      const remaining = Object.keys(next);
      return {
        diffs: next,
        reviewPath: remaining.length > 0 ? remaining[0] : null,
        reviewOpen: remaining.length > 0,
      };
    });
  },

  /** Reject a diff (remove from pending — reverted externally) */
  rejectDiff: (filePath) => {
    set((state) => {
      const next = { ...state.diffs };
      delete next[filePath];
      const remaining = Object.keys(next);
      return {
        diffs: next,
        reviewPath: remaining.length > 0 ? remaining[0] : null,
        reviewOpen: remaining.length > 0,
      };
    });
  },

  /** Accept all diffs */
  acceptAll: () => {
    set({ diffs: {}, reviewPath: null, reviewOpen: false });
  },

  /** Clear all diffs */
  clear: () => {
    set({ diffs: {}, reviewPath: null, reviewOpen: false });
  },

  /** Get totals across all files */
  getTotals: () => {
    const { diffs } = get();
    const entries = Object.values(diffs);
    return {
      files: entries.length,
      additions: entries.reduce((sum, d) => sum + d.additions, 0),
      deletions: entries.reduce((sum, d) => sum + d.deletions, 0),
    };
  },

  /** Get sorted list of changed files */
  getChangedFiles: () => {
    const { diffs } = get();
    return Object.values(diffs).sort((a, b) => b.timestamp - a.timestamp);
  },
}));

/** Compute line-level diff stats between two strings */
function computeStats(original, modified) {
  const origLines = (original || '').split('\n');
  const modLines = (modified || '').split('\n');
  let additions = 0;
  let deletions = 0;
  const hunks = [];

  // Simple line-by-line diff using LCS-based approach
  const { ops } = diffLines(origLines, modLines);

  let currentHunk = null;
  for (const op of ops) {
    if (op.type === 'equal') {
      if (currentHunk) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
    } else {
      if (!currentHunk) {
        currentHunk = { lines: [] };
      }
      currentHunk.lines.push(op);
      if (op.type === 'add') additions++;
      if (op.type === 'del') deletions++;
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  return { additions, deletions, hunks };
}

/** Simple line diff using patience-style algorithm */
function diffLines(aLines, bLines) {
  const ops = [];
  const maxLen = Math.max(aLines.length, bLines.length);

  // Build a simple LCS table for small files, fall back to line-by-line for large
  if (aLines.length + bLines.length > 5000) {
    // Fast fallback: line-by-line comparison
    return fastDiff(aLines, bLines);
  }

  const lcs = buildLCS(aLines, bLines);
  let ai = 0, bi = 0, li = 0;

  while (ai < aLines.length || bi < bLines.length) {
    if (li < lcs.length && ai < aLines.length && bi < bLines.length && aLines[ai] === lcs[li]) {
      if (aLines[ai] === bLines[bi]) {
        ops.push({ type: 'equal', content: aLines[ai], lineA: ai + 1, lineB: bi + 1 });
        ai++; bi++; li++;
      } else {
        ops.push({ type: 'add', content: bLines[bi], lineB: bi + 1 });
        bi++;
      }
    } else if (ai < aLines.length && (li >= lcs.length || aLines[ai] !== lcs[li])) {
      ops.push({ type: 'del', content: aLines[ai], lineA: ai + 1 });
      ai++;
    } else if (bi < bLines.length) {
      ops.push({ type: 'add', content: bLines[bi], lineB: bi + 1 });
      bi++;
    }
  }

  return { ops };
}

function buildLCS(a, b) {
  const m = a.length, n = b.length;
  // Use a 2-row optimization for memory
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

function fastDiff(aLines, bLines) {
  const ops = [];
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    if (i < aLines.length && i < bLines.length) {
      if (aLines[i] === bLines[i]) {
        ops.push({ type: 'equal', content: aLines[i], lineA: i + 1, lineB: i + 1 });
      } else {
        ops.push({ type: 'del', content: aLines[i], lineA: i + 1 });
        ops.push({ type: 'add', content: bLines[i], lineB: i + 1 });
      }
    } else if (i < aLines.length) {
      ops.push({ type: 'del', content: aLines[i], lineA: i + 1 });
    } else {
      ops.push({ type: 'add', content: bLines[i], lineB: i + 1 });
    }
  }
  return { ops };
}

export default useDiffStore;
