import { z } from "zod";

export const askPreviewPayloadSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
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
