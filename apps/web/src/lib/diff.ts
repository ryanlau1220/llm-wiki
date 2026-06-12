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

  const rawAligned: AlignedDiffLine[] = [];
  let i = n;
  let j = m;

  // Backtrack to find the diff alignment
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawAligned.unshift({
        original: { type: "unchanged", content: oldLines[i - 1] },
        refactored: { type: "unchanged", content: newLines[j - 1] },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawAligned.unshift({
        original: { type: "empty", content: "" },
        refactored: { type: "added", content: newLines[j - 1] },
      });
      j--;
    } else {
      rawAligned.unshift({
        original: { type: "removed", content: oldLines[i - 1] },
        refactored: { type: "empty", content: "" },
      });
      i--;
    }
  }

  // Post-process to align removed and added lines side-by-side in chunks
  const result: AlignedDiffLine[] = [];
  let index = 0;
  while (index < rawAligned.length) {
    if (rawAligned[index].original.type === "unchanged") {
      result.push(rawAligned[index]);
      index++;
    } else {
      // Gather a block of changes (removed or added)
      const removedBlock: string[] = [];
      const addedBlock: string[] = [];
      while (index < rawAligned.length && rawAligned[index].original.type !== "unchanged") {
        const item = rawAligned[index];
        if (item.original.type === "removed") {
          removedBlock.push(item.original.content);
        }
        if (item.refactored.type === "added") {
          addedBlock.push(item.refactored.content);
        }
        index++;
      }

      // Pair them up side-by-side
      const maxLen = Math.max(removedBlock.length, addedBlock.length);
      for (let k = 0; k < maxLen; k++) {
        const hasRemoved = k < removedBlock.length;
        const hasAdded = k < addedBlock.length;
        result.push({
          original: {
            type: hasRemoved ? "removed" : "empty",
            content: hasRemoved ? removedBlock[k] : "",
          },
          refactored: {
            type: hasAdded ? "added" : "empty",
            content: hasAdded ? addedBlock[k] : "",
          },
        });
      }
    }
  }

  return result;
}
