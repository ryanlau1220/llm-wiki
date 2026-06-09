import { z } from "zod";

const actionNameSchema = z.enum([
  "create_note",
  "refactor_note",
  "suggest_links",
  "search"
]);

const tagSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/);
const linkSchema = z.string().min(1).max(200);

export const createNotePayloadSchema = z.object({
  title: z.string().min(1).max(150),
  content: z.string().min(1).max(50_000),
  links: z.array(linkSchema).max(100).optional(),
  tags: z.array(tagSchema).max(30).optional(),
  source: z.enum(["ask", "synthesis", "manual", "refactor"]).optional()
});

export const refactorNotePayloadSchema = z.object({
  source_path: z.string().regex(/^human\/.+\.md$/).max(400),
  title: z.string().min(1).max(150),
  content: z.string().min(1).max(50_000),
  links: z.array(linkSchema).max(100).optional(),
  tags: z.array(tagSchema).max(30).optional()
});

export const suggestLinksPayloadSchema = z.object({
  source_path: z.string().regex(/^human\/.+\.md$/).max(400),
  candidate_links: z.array(linkSchema).min(1).max(50)
});

export const searchPayloadSchema = z.object({
  query: z.string().min(1).max(1_000),
  top_k: z.number().int().min(1).max(20).default(8),
  include_ai_generated: z.boolean().default(true)
});

export const aiActionEnvelopeSchema = z.object({
  request_id: z.string().min(1).max(128),
  action: actionNameSchema,
  dry_run: z.boolean().default(false),
  payload: z.union([
    createNotePayloadSchema,
    refactorNotePayloadSchema,
    suggestLinksPayloadSchema,
    searchPayloadSchema
  ]),
  reason: z.string().max(500).optional()
});

export type ActionName = z.infer<typeof actionNameSchema>;
export type CreateNotePayload = z.infer<typeof createNotePayloadSchema>;
export type RefactorNotePayload = z.infer<typeof refactorNotePayloadSchema>;
export type SuggestLinksPayload = z.infer<typeof suggestLinksPayloadSchema>;
export type SearchPayload = z.infer<typeof searchPayloadSchema>;
export type AiActionEnvelope = z.infer<typeof aiActionEnvelopeSchema>;
