export interface AlignedDiffLine {
  original: { type: "removed" | "unchanged" | "empty"; content: string };
  refactored: { type: "added" | "unchanged" | "empty"; content: string };
}

/**
 * Computes a line-by-line diff between original and refactored text and aligns them side-by-side.
 */
export function computeAlignedDiff(oldText: string, newText: string): AlignedDiffLine[] {
  // Normalize line endings and split
  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").split("\n");

  const n = oldLines.length;
  const m = newLines.length;

  // Initialize DP table for Longest Common Subsequence (LCS)
  const dp: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const aligned: AlignedDiffLine[] = [];
  let i = n;
  let j = m;

  // Backtrack to find the diff alignment
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      aligned.unshift({
        original: { type: "unchanged", content: oldLines[i - 1] },
        refactored: { type: "unchanged", content: newLines[j - 1] },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      aligned.unshift({
        original: { type: "empty", content: "" },
        refactored: { type: "added", content: newLines[j - 1] },
      });
      j--;
    } else {
      aligned.unshift({
        original: { type: "removed", content: oldLines[i - 1] },
        refactored: { type: "empty", content: "" },
      });
      i--;
    }
  }

  return aligned;
}
