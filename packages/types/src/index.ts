import { oc, type ContractRouterClient } from "@orpc/contract";
export type { ContractRouterClient };
import { z } from "zod";
import {
  askPreviewPayloadSchema,
  confirmAskSavePayloadSchema,
  refactorPreviewPayloadSchema,
  confirmRefactorSavePayloadSchema,
  reindexPayloadSchema,
  synthesisPreviewPayloadSchema,
  confirmSynthesisSavePayloadSchema,
  weakNotesPayloadSchema
} from "./schemas";

export const appContract = oc.router({
  askPreview: oc.input(askPreviewPayloadSchema).output(z.any()),
  confirmAskSave: oc.input(confirmAskSavePayloadSchema).output(z.any()),
  refactorPreview: oc.input(refactorPreviewPayloadSchema).output(z.any()),
  confirmRefactorSave: oc.input(confirmRefactorSavePayloadSchema).output(z.any()),
  synthesisPreview: oc.input(synthesisPreviewPayloadSchema).output(z.any()),
  confirmSynthesisSave: oc.input(confirmSynthesisSavePayloadSchema).output(z.any()),
  getWeakNotes: oc.input(weakNotesPayloadSchema.optional()).output(z.array(z.object({
    id: z.string(),
    path: z.string(),
    title: z.string(),
    qualityScore: z.number().nullable().optional(),
    reasons: z.array(z.string()),
  }))),
  reindex: oc.input(reindexPayloadSchema).output(z.any()),
  getLinkHealth: oc.input(z.void().optional()).output(z.array(z.object({
    label: z.string(),
    count: z.number(),
    sourcePaths: z.array(z.string())
  }))),
  health: oc.input(z.void().optional()).output(z.any()),
  me: oc.input(z.void().optional()).output(z.object({
    id: z.string(),
    email: z.string(),
    role: z.string()
  }).nullable()),
  login: oc.input(z.object({
    email: z.string().email(),
    password: z.string().min(1)
  })).output(z.object({
    success: z.boolean(),
    user: z.object({
      email: z.string(),
      role: z.string()
    }).optional()
  })),
  logout: oc.input(z.void().optional()).output(z.object({ success: z.boolean() })),
  listNotes: oc.input(z.void().optional()).output(z.array(z.object({
    id: z.string(),
    path: z.string(),
    title: z.string().optional(),
    qualityScore: z.number().nullable().optional(),
    qualityMetrics: z.any().optional(),
  }))),
});

export type AppRouter = typeof appContract;

export * from "./schemas";
export * from "./ai-actions";
