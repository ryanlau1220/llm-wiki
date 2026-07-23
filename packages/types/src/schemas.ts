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
  noteIds: z.array(z.string()).optional(),
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

const httpUrlSchema = z.string().url().max(4_000).refine(
  (value) => /^https?:\/\//i.test(value),
  "Only http(s) URLs are allowed"
);

export const researchSourceSchema = z.object({
  title: z.string().trim().min(1).max(500),
  url: httpUrlSchema,
});

export const RESEARCH_CAPTURE_STATUS = {
  INBOX: "inbox",
  APPROVED: "approved",
  MERGED: "merged",
  DISCARDED: "discarded",
} as const;

export const RESEARCH_CAPTURE_ACTIVITY_EVENT = {
  CAPTURED: "captured",
  APPROVED: "approved",
  MERGED: "merged",
  DISCARDED: "discarded",
  INDEXING_FAILED: "indexing_failed",
  INDEXING_RETRIED: "indexing_retried",
} as const;

export const researchCaptureStatusSchema = z.enum([
  RESEARCH_CAPTURE_STATUS.INBOX,
  RESEARCH_CAPTURE_STATUS.APPROVED,
  RESEARCH_CAPTURE_STATUS.MERGED,
  RESEARCH_CAPTURE_STATUS.DISCARDED,
]);
export type ResearchCaptureStatus = z.infer<typeof researchCaptureStatusSchema>;

/** Payload accepted only from a locally paired desktop extension. */
export const extensionResearchCaptureSchema = z.object({
  sourceUrl: httpUrlSchema,
  sourceTitle: z.string().trim().min(1).max(500),
  query: z.string().trim().max(10_000).optional(),
  content: z.string().trim().min(1).max(100_000),
  sources: z.array(researchSourceSchema).max(100).default([]),
  capturedAt: z.string().datetime(),
});

export const approveResearchCaptureSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(150).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  destinationFolder: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*(\/[a-zA-Z0-9][a-zA-Z0-9 _-]*)*$/, 'Use a vault-relative folder path').optional(),
});

export const mergeResearchCaptureSchema = z.object({
  id: z.string().uuid(),
  targetDocumentId: z.string().uuid(),
});

export const retryResearchCaptureIndexSchema = z.object({
  id: z.string().uuid(),
});

export type ExtensionResearchCapture = z.infer<typeof extensionResearchCaptureSchema>;
export type ApproveResearchCapture = z.infer<typeof approveResearchCaptureSchema>;
export type MergeResearchCapture = z.infer<typeof mergeResearchCaptureSchema>;
export type RetryResearchCaptureIndex = z.infer<typeof retryResearchCaptureIndexSchema>;

export const qualityMetricsSchema = z.object({
  linkDensity: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  coherence: z.number().min(0).max(1).optional(),
  wordCount: z.number().int().min(0),
});

export type QualityMetrics = z.infer<typeof qualityMetricsSchema>;
