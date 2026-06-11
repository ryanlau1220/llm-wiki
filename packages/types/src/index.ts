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
  getImprovementSuggestions: oc.input(z.object({ documentId: z.string() })).output(z.array(z.object({
    id: z.string(),
    type: z.enum(["structure", "linking", "content", "metadata"]),
    description: z.string(),
    actionLabel: z.string()
  }))),
  reindex: oc.input(reindexPayloadSchema).output(z.any()),
  reindexAll: oc.input(z.void().optional()).output(z.any()),
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
    token: z.string().optional(),
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
  getGraph: oc.input(z.void().optional()).output(z.object({
    nodes: z.array(z.object({
      id: z.string(),
      title: z.string(),
      path: z.string(),
      type: z.string(),
      is_ai_generated: z.boolean(),
      qualityScore: z.number().nullable().optional(),
    })),
    edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      label: z.string().optional(),
    })),
  })),
  getNote: oc.input(z.object({ id: z.string() })).output(z.object({
    id: z.string(),
    path: z.string(),
    title: z.string(),
    content: z.string(),
    type: z.string(),
    is_ai_generated: z.boolean(),
    qualityScore: z.number().nullable().optional(),
    qualityMetrics: z.any().optional(),
    created_at: z.string(),
    updated_at: z.string()
  })),
  getSettings: oc.input(z.void().optional()).output(z.object({
    vaultPath: z.string(),
  })),
  updateSettings: oc.input(z.object({
    vaultPath: z.string().min(1),
  })).output(z.object({
    success: z.boolean(),
    error: z.string().optional(),
  })),
});

export type AppRouter = typeof appContract;

export * from "./schemas";
export * from "./ai-actions";
