import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createLLMProvider } from "@llm-wiki/ai";

import type { AppConfig } from "./config";
import { confirmAskSave } from "./ask-confirm";

export async function refactorNotePreview(
  config: AppConfig,
  filePath: string
) {
  const fullPath = path.resolve(config.vaultPath, filePath);
  
  // Safety check: ensure file is within vault human root
  if (!fullPath.startsWith(path.resolve(config.vaultPath))) {
    throw new Error("Invalid file path: must be within vault human directory");
  }

  const content = await fs.readFile(fullPath, "utf8");

  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider, // Defaulting to the same provider
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel
    }
  });

  const systemInstruction = `
You are a expert knowledge engineer. Your task is to refactor a messy note into a highly structured, wiki-style markdown page.

REFACTORING RULES:
1. Preserve all core information.
2. Structure the note with the following sections:
   - # [Title]
   - ## Summary (A concise overview)
   - ## Key Concepts (Bullet points of main ideas)
   - ## Detailed Breakdown (The core content restructured for clarity)
   - ## Related Concepts (Suggested wikilinks)
3. Use clear, professional language.
4. Output your response as a JSON object matching the schema below.

JSON SCHEMA:
{
  "refactored_note": {
    "title": "string",
    "content": "string (markdown content ONLY, no frontmatter)",
    "tags": ["string"],
    "links": ["string"]
  }
}
`.trim();

  const prompt = `
REFACTOR THIS NOTE:
---
${content}
---

Provide the refactored version in JSON format.
`.trim();

  const llmResponse = await llmProvider.generate({
    prompt,
    systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.1
  });

  try {
    const parsed = JSON.parse(llmResponse.text);
    const requestId = crypto.randomUUID();

    return {
      requestId,
      sourcePath: filePath,
      ...parsed
    };
  } catch (_error) {
    console.error("Failed to parse LLM refactor response:", llmResponse.text);
    return {
      error: "Failed to generate structured refactor",
      rawResponse: llmResponse.text
    };
  }
}

export async function confirmRefactorSave(
  config: AppConfig,
  requestId: string,
  _sourcePath: string,
  note: { title: string; content: string; links?: string[]; tags?: string[] }
) {
  // We can reuse the confirmAskSave logic but with different metadata
  // Actually, we should customize it for refactoring
  return confirmAskSave(config, requestId, {
    ...note,
    tags: [...(note.tags || []), "refactored"],
  });
}
