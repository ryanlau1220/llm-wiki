import { z } from "zod";

export const llmRequestSchema = z.object({
  prompt: z.string(),
  systemInstruction: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  responseMimeType: z.enum(["text/plain", "application/json"]).optional(),
  webSearch: z.boolean().optional()
});

export type LLMRequest = z.infer<typeof llmRequestSchema>;

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  generate(request: LLMRequest): Promise<LLMResponse>;
}
