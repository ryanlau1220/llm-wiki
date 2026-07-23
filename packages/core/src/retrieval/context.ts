import type { RetrievalChunk } from "./types";

export const DEFAULT_CONTEXT_CHARACTER_BUDGET = 12_000;
export const DEFAULT_CHUNKS_PER_DOCUMENT = 2;

export type ContextChunk = Pick<
  RetrievalChunk,
  "documentId" | "documentPath" | "chunkIndex" | "text"
>;

export type ContextPack<Chunk extends ContextChunk = ContextChunk> = {
  chunks: Chunk[];
  text: string;
  characterCount: number;
};

export type ContextPackOptions = {
  characterBudget?: number;
  chunksPerDocument?: number;
};

export function packRetrievalContext<Chunk extends ContextChunk>(
  chunks: Chunk[],
  options: ContextPackOptions = {},
): ContextPack<Chunk> {
  const characterBudget = options.characterBudget ?? DEFAULT_CONTEXT_CHARACTER_BUDGET;
  const chunksPerDocument = options.chunksPerDocument ?? DEFAULT_CHUNKS_PER_DOCUMENT;
  validateOptions(characterBudget, chunksPerDocument);

  const selected: Chunk[] = [];
  const documentCounts = new Map<string, number>();
  let characterCount = 0;

  for (const chunk of chunks) {
    if ((documentCounts.get(chunk.documentId) ?? 0) >= chunksPerDocument) continue;
    const formattedChunk = formatContextChunk(chunk, selected.length + 1);
    const separatorLength = selected.length ? 2 : 0;
    if (characterCount + separatorLength + formattedChunk.length > characterBudget) continue;

    selected.push(chunk);
    documentCounts.set(chunk.documentId, (documentCounts.get(chunk.documentId) ?? 0) + 1);
    characterCount += separatorLength + formattedChunk.length;
  }

  return {
    chunks: selected,
    text: selected.map((chunk, index) => formatContextChunk(chunk, index + 1)).join("\n\n"),
    characterCount,
  };
}

function formatContextChunk(chunk: ContextChunk, index: number): string {
  return `[Context ${index} | ${chunk.documentPath}#${chunk.chunkIndex}]:\n${chunk.text}`;
}

function validateOptions(characterBudget: number, chunksPerDocument: number): void {
  if (!Number.isInteger(characterBudget) || characterBudget < 1) {
    throw new Error("Context character budget must be a positive integer");
  }
  if (!Number.isInteger(chunksPerDocument) || chunksPerDocument < 1) {
    throw new Error("Context chunks per document must be a positive integer");
  }
}
