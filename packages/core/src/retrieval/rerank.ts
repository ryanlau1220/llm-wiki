import type { RetrievalChunk } from "./types";

const RERANK_FUSED_WEIGHT = 0.7;
const RERANK_TERM_COVERAGE_WEIGHT = 0.3;

export function rerankRetrievalChunks(query: string, chunks: RetrievalChunk[]): RetrievalChunk[] {
  const terms = query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const uniqueTerms = [...new Set(terms)];
  if (!uniqueTerms.length) return chunks;

  return chunks
    .map((chunk) => ({
      chunk,
      score: (RERANK_FUSED_WEIGHT * chunk.score) + (RERANK_TERM_COVERAGE_WEIGHT * termCoverage(uniqueTerms, chunk.text)),
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

function termCoverage(terms: string[], text: string): number {
  const normalizedText = text.toLocaleLowerCase();
  return terms.filter((term) => normalizedText.includes(term)).length / terms.length;
}
