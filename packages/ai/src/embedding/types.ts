export type EmbeddingModelInfo = {
  provider: string;
  model: string;
  dimensions?: number;
};

export type EmbeddingRequest = {
  texts: string[];
};

export type EmbeddingResult = {
  vectors: number[][];
  model: EmbeddingModelInfo;
};

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;

  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
