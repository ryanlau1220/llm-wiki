import type { LLMResponse } from "@llm-wiki/ai";

const MAX_RECORDED_TOKEN_COUNT = 10_000_000;

/** Usage counters are structural metadata; text, prompts, and model output stay out of traces. */
export function modelUsageAttributes(usage: LLMResponse["usage"]): Record<string, number> {
  if (!usage) return {};
  return {
    prompt_tokens: boundedTokenCount(usage.promptTokens),
    candidate_tokens: boundedTokenCount(usage.candidatesTokens),
    total_tokens: boundedTokenCount(usage.totalTokens),
  };
}

function boundedTokenCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), MAX_RECORDED_TOKEN_COUNT);
}
