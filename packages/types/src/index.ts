import { oc, type ContractRouterClient } from "@orpc/contract";
export type { ContractRouterClient };
import { z } from "zod";
import {
  askPreviewPayloadSchema,
  confirmAskSavePayloadSchema,
  refactorPreviewPayloadSchema,
  confirmRefactorSavePayloadSchema,
  reindexPayloadSchema
} from "./schemas";

export const appContract = oc.router({
  askPreview: oc.input(askPreviewPayloadSchema).output(z.any()),
  confirmAskSave: oc.input(confirmAskSavePayloadSchema).output(z.any()),
  refactorPreview: oc.input(refactorPreviewPayloadSchema).output(z.any()),
  confirmRefactorSave: oc.input(confirmRefactorSavePayloadSchema).output(z.any()),
  reindex: oc.input(reindexPayloadSchema).output(z.any()),
  getLinkHealth: oc.input(z.void().optional()).output(z.array(z.object({
    label: z.string(),
    count: z.number(),
    sourcePaths: z.array(z.string())
  }))),
  health: oc.input(z.void().optional()).output(z.any()),
  listNotes: oc.input(z.void().optional()).output(z.array(z.object({
    id: z.string(),
    path: z.string(),
    title: z.string().optional()
  }))),
});

export type AppRouter = typeof appContract;

export * from "./schemas";
export * from "./ai-actions";
