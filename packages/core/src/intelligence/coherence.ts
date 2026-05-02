import type { LLMProvider } from "@llm-wiki/ai";

const COHERENCE_PROMPT = `
You are a knowledge quality evaluator. Evaluate the coherence and logical structure of the following wiki note.
A coherent note should:
1. Have a clear purpose or topic.
2. Be logically organized.
3. Be readable and free of extreme formatting errors.

Provide a single numeric score between 0.0 and 1.0, where:
- 1.0: Excellent, perfectly clear and organized.
- 0.7: Good, minor organizational issues.
- 0.4: Poor, disjointed or confusing.
- 0.0: Gibberish or empty.

Output ONLY the number.

Note content:
---
{{CONTENT}}
---
`.trim();

export async function calculateCoherence(
  llm: LLMProvider,
  content: string
): Promise<number> {
  if (!content.trim()) return 0;
  
  // Truncate content for scoring if it's too long
  const truncated = content.slice(0, 4000);
  const prompt = COHERENCE_PROMPT.replace("{{CONTENT}}", truncated);

  try {
    const response = await llm.generate({
      prompt,
      temperature: 0.1, // High deterministic for scoring
    });

    const score = parseFloat(response.text.trim());
    if (Number.isNaN(score)) return 0.5; // Default fallback
    
    return Math.max(0, Math.min(1, score));
  } catch (error) {
    console.error("Failed to calculate coherence:", error);
    return 0.5; // Graceful fallback
  }
}
