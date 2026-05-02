import type { LLMProvider } from "@llm-wiki/ai";

export type ImprovementSuggestion = {
  id: string;
  type: "structure" | "linking" | "content" | "metadata";
  description: string;
  actionLabel: string;
};

const IMPROVEMENT_PROMPT = `
You are a knowledge engineering assistant. Analyze the following wiki note and suggest 3-4 specific, actionable improvements to increase its quality score.

Note content:
---
{{CONTENT}}
---

Categories of improvements:
1. structure: improving readability, headers, or logical flow.
2. linking: suggesting missing [[wikilinks]] to other concepts.
3. content: identifying gaps or sections that need more detail.
4. metadata: missing tags or title issues.

Output ONLY a JSON array of objects with this schema:
[
  {
    "id": "short-unique-slug",
    "type": "structure|linking|content|metadata",
    "description": "Specific suggestion",
    "actionLabel": "Short label for the action (e.g. 'Add links')"
  }
]
`.trim();

export async function suggestImprovements(
  llm: LLMProvider,
  content: string
): Promise<ImprovementSuggestion[]> {
  const truncated = content.slice(0, 4000);
  const prompt = IMPROVEMENT_PROMPT.replace("{{CONTENT}}", truncated);

  try {
    const response = await llm.generate({
      prompt,
      temperature: 0.3,
      responseMimeType: "application/json",
    });

    const suggestions = JSON.parse(response.text);
    return Array.isArray(suggestions) ? suggestions : [];
  } catch (error) {
    console.error("Failed to suggest improvements:", error);
    return [];
  }
}
