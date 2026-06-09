import { z } from "zod";

export const askPreviewPayloadSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
  mode: z.enum(["rag", "general"]).optional(),
});

export const confirmAskSavePayloadSchema = z.object({
  requestId: z.string().min(1),
  note: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    links: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const refactorPreviewPayloadSchema = z.object({
  path: z.string().min(1),
});

export const confirmRefactorSavePayloadSchema = z.object({
  requestId: z.string().min(1),
  sourcePath: z.string().min(1),
  note: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    links: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const reindexPayloadSchema = z.object({
  path: z.string().min(1),
});

export const synthesisPreviewPayloadSchema = z.object({
  topic: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
});

export const confirmSynthesisSavePayloadSchema = z.object({
  requestId: z.string().min(1),
  note: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    links: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const weakNotesPayloadSchema = z.object({
  minQualityScore: z.number().min(0).max(1).optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
});

export const qualityMetricsSchema = z.object({
  linkDensity: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  coherence: z.number().min(0).max(1).optional(),
  wordCount: z.number().int().min(0),
});

export type QualityMetrics = z.infer<typeof qualityMetricsSchema>;
