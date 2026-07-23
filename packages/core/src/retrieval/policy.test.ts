import { describe, expect, test } from "bun:test";

import {
  ASK_RETRIEVAL_MODE,
  ASK_RETRIEVAL_POLICY_REASON,
  resolveAskRetrievalPolicy,
  shouldAbstainForMissingEvidence,
} from "./policy";
import { RETRIEVAL_POLICY } from "./trace";

describe("resolveAskRetrievalPolicy", () => {
  test("requires vault evidence only in explicit RAG mode", () => {
    const decision = resolveAskRetrievalPolicy(ASK_RETRIEVAL_MODE.RAG);

    expect(decision).toEqual({
      policy: RETRIEVAL_POLICY.VAULT_HYBRID,
      reason: ASK_RETRIEVAL_POLICY_REASON.EXPLICIT_VAULT_MODE,
      requiresGroundedEvidence: true,
    });
  });

  test("keeps explicit general mode separate from vault retrieval", () => {
    const decision = resolveAskRetrievalPolicy(ASK_RETRIEVAL_MODE.GENERAL);

    expect(decision).toEqual({
      policy: RETRIEVAL_POLICY.GENERAL_WEB,
      reason: ASK_RETRIEVAL_POLICY_REASON.EXPLICIT_GENERAL_MODE,
      requiresGroundedEvidence: false,
    });
  });
});

describe("shouldAbstainForMissingEvidence", () => {
  test("abstains only when a grounded mode has no packed evidence", () => {
    expect(
      shouldAbstainForMissingEvidence(
        resolveAskRetrievalPolicy(ASK_RETRIEVAL_MODE.RAG),
        0,
      ),
    ).toBe(true);
    expect(
      shouldAbstainForMissingEvidence(
        resolveAskRetrievalPolicy(ASK_RETRIEVAL_MODE.RAG),
        1,
      ),
    ).toBe(false);
    expect(
      shouldAbstainForMissingEvidence(
        resolveAskRetrievalPolicy(ASK_RETRIEVAL_MODE.GENERAL),
        0,
      ),
    ).toBe(false);
  });
});
