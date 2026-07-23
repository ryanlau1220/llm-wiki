import { RETRIEVAL_POLICY, type RetrievalPolicy } from "./trace";

export const ASK_RETRIEVAL_MODE = {
  RAG: "rag",
  GENERAL: "general",
} as const;

export const ASK_RETRIEVAL_POLICY_REASON = {
  EXPLICIT_VAULT_MODE: "explicit_vault_mode",
  EXPLICIT_GENERAL_MODE: "explicit_general_mode",
} as const;

export type AskRetrievalMode = typeof ASK_RETRIEVAL_MODE[keyof typeof ASK_RETRIEVAL_MODE];
export type AskRetrievalPolicyReason = typeof ASK_RETRIEVAL_POLICY_REASON[keyof typeof ASK_RETRIEVAL_POLICY_REASON];

export type AskRetrievalDecision = {
  policy: RetrievalPolicy;
  reason: AskRetrievalPolicyReason;
  requiresGroundedEvidence: boolean;
};

export function resolveAskRetrievalPolicy(mode: AskRetrievalMode): AskRetrievalDecision {
  if (mode === ASK_RETRIEVAL_MODE.RAG) {
    return {
      policy: RETRIEVAL_POLICY.VAULT_HYBRID,
      reason: ASK_RETRIEVAL_POLICY_REASON.EXPLICIT_VAULT_MODE,
      requiresGroundedEvidence: true,
    };
  }

  return {
    policy: RETRIEVAL_POLICY.GENERAL_WEB,
    reason: ASK_RETRIEVAL_POLICY_REASON.EXPLICIT_GENERAL_MODE,
    requiresGroundedEvidence: false,
  };
}

export function shouldAbstainForMissingEvidence(
  decision: AskRetrievalDecision,
  packedEvidenceCount: number,
): boolean {
  return decision.requiresGroundedEvidence && packedEvidenceCount === 0;
}
