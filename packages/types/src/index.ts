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
  weakNotesPayloadSchema,
  approveResearchCaptureSchema,
  mergeResearchCaptureSchema,
  retryResearchCaptureIndexSchema,
  researchCaptureStatusSchema,
  listRetrievalTracesSchema,
  pruneRetrievalTracesSchema,
  retrievalTracePageSchema,
  pruneRetrievalTracesResultSchema,
  RESEARCH_CAPTURE_ACTIVITY_EVENT,
  RESEARCH_CAPTURE_STATUS
} from "./schemas";

const researchCaptureSchema = z.object({
  id: z.string().uuid(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  query: z.string().nullable(),
  content: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  duplicateCandidates: z.array(z.object({
    captureId: z.string().uuid(),
    title: z.string(),
    path: z.string().nullable(),
  })),
  status: researchCaptureStatusSchema,
  savedDocumentId: z.string().uuid().nullable(),
  savedPath: z.string().nullable(),
  indexError: z.string().nullable(),
  capturedAt: z.string(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});

const researchCaptureIndexResultSchema = z.union([
  z.object({
    status: z.literal(RESEARCH_CAPTURE_STATUS.APPROVED),
    path: z.string(),
    documentId: z.string().uuid().nullable(),
  }),
  z.object({
    status: z.literal(RESEARCH_CAPTURE_STATUS.MERGED),
    path: z.string(),
    documentId: z.string().uuid(),
  }),
  z.object({
    status: z.literal("indexing_failed"),
    path: z.string(),
    documentId: z.string().uuid().nullable(),
    error: z.string(),
  }),
]);

const researchCaptureActivitySchema = z.object({
  id: z.string().uuid(),
  eventType: z.enum([
    RESEARCH_CAPTURE_ACTIVITY_EVENT.CAPTURED,
    RESEARCH_CAPTURE_ACTIVITY_EVENT.APPROVED,
    RESEARCH_CAPTURE_ACTIVITY_EVENT.MERGED,
    RESEARCH_CAPTURE_ACTIVITY_EVENT.DISCARDED,
    RESEARCH_CAPTURE_ACTIVITY_EVENT.INDEXING_FAILED,
    RESEARCH_CAPTURE_ACTIVITY_EVENT.INDEXING_RETRIED,
  ]),
  detail: z.record(z.string(), z.string()),
  createdAt: z.string(),
});

export const appContract = oc.router({
  askPreview: oc.input(askPreviewPayloadSchema).output(z.any()),
  confirmAskSave: oc.input(confirmAskSavePayloadSchema).output(z.any()),
  refactorPreview: oc.input(refactorPreviewPayloadSchema).output(z.any()),
  confirmRefactorSave: oc.input(confirmRefactorSavePayloadSchema).output(z.any()),
  synthesisPreview: oc.input(synthesisPreviewPayloadSchema).output(z.any()),
  confirmSynthesisSave: oc.input(confirmSynthesisSavePayloadSchema).output(z.any()),
  confirmBootstrapSave: oc.input(confirmSynthesisSavePayloadSchema).output(z.any()),
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
    isAiGenerated: z.boolean().optional(),
    aiStatus: z.string().nullable().optional(),
    healthScore: z.number().nullable().optional(),
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
  bootstrapPreview: oc.input(z.object({
    title: z.string().min(1),
  })).output(z.object({
    requestId: z.string(),
    note: z.object({
      title: z.string(),
      content: z.string(),
      links: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }),
  })),
  listBackups: oc.input(z.object({
    path: z.string()
  })).output(z.array(z.object({
    filename: z.string(),
    timestamp: z.string(),
    formattedDate: z.string(),
    sizeBytes: z.number()
  }))),
  getBackupContent: oc.input(z.object({
    path: z.string(),
    timestamp: z.string()
  })).output(z.object({
    content: z.string()
  })),
  restoreBackup: oc.input(z.object({
    path: z.string(),
    timestamp: z.string()
  })).output(z.object({
    success: z.boolean()
  })),
  browseDirectories: oc.input(z.object({
    path: z.string().optional(),
  })).output(z.object({
    currentPath: z.string(),
    parentPath: z.string().nullable(),
    directories: z.array(z.string()),
    shortcuts: z.array(z.object({
      name: z.string(),
      path: z.string(),
    })).optional(),
    error: z.string().optional(),
  })),
  createExtensionPairingCode: oc.input(z.void().optional()).output(z.object({
    code: z.string(),
    expiresAt: z.string(),
  })),
  listResearchCaptures: oc.input(z.object({
    status: researchCaptureStatusSchema.or(z.literal("all")).optional(),
  }).optional()).output(z.array(researchCaptureSchema)),
  approveResearchCapture: oc.input(approveResearchCaptureSchema).output(researchCaptureIndexResultSchema),
  mergeResearchCapture: oc.input(mergeResearchCaptureSchema).output(researchCaptureIndexResultSchema),
  discardResearchCapture: oc.input(z.object({ id: z.string().uuid() })).output(z.object({
    status: z.literal(RESEARCH_CAPTURE_STATUS.DISCARDED),
  })),
  retryResearchCaptureIndex: oc.input(retryResearchCaptureIndexSchema).output(researchCaptureIndexResultSchema),
  listResearchCaptureActivities: oc.input(z.object({ id: z.string().uuid() })).output(z.array(researchCaptureActivitySchema)),
  listRetrievalTraces: oc.input(listRetrievalTracesSchema).output(retrievalTracePageSchema),
  pruneRetrievalTraces: oc.input(pruneRetrievalTracesSchema).output(pruneRetrievalTracesResultSchema),
});

export type AppRouter = typeof appContract;

export * from "./schemas";
export * from "./ai-actions";
