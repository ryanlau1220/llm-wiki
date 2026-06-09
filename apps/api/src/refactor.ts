import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createLLMProvider } from "@llm-wiki/ai";
import { createLogger } from "@llm-wiki/core";

import type { AppConfig } from "./config";
import { confirmAskSave } from "./ask-confirm";

export async function refactorNotePreview(
  config: AppConfig,
  filePath: string
) {
  const logger = createLogger("refactor");
  logger.info("New refactor request", { filePath });

  const vaultParent = path.resolve(config.vaultPath, "..");
  const fullPath = path.resolve(vaultParent, filePath);
  
  // Safety check: ensure file is within vault root directory
  if (!fullPath.startsWith(vaultParent)) {
    throw new Error("Invalid file path: must be within vault directory");
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
5. IMPORTANT: NEVER use unescaped double quotes inside the "content" or "title" string values. If you need to emphasize something or use a quote within the text, use single quotes (') or markdown bolding (**text**) instead. Unescaped double quotes will break the JSON parsing and fail the task.

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

  logger.debug("Generating LLM refactor...");
  const startTime = Date.now();
  const llmResponse = await llmProvider.generate({
    prompt,
    systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.1
  });
  const duration = Date.now() - startTime;

  const rawText = llmResponse.text;
  let noteData: any = null;
  try {
    const parsed = JSON.parse(rawText);
    noteData = parsed.refactored_note || parsed.note || parsed;
  } catch (_error) {
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        noteData = parsed.refactored_note || parsed.note || parsed;
      }
    } catch (_fallbackError) {
      // Ignore fallback error
    }
  }

  if (noteData) {
    const requestId = crypto.randomUUID();
    logger.info("Note refactored successfully", {
      requestId,
      durationMs: duration,
      title: noteData.title
    });

    let improvements: any[] = [];
    try {
      const { suggestImprovements } = await import("@llm-wiki/core");
      improvements = await suggestImprovements(llmProvider, content);
    } catch (err) {
      logger.error("Failed to suggest improvements for note", err);
    }

    return {
      requestId,
      sourcePath: filePath,
      originalContent: content,
      improvements,
      note: noteData
    };
  }

  console.error("Failed to parse LLM refactor response:", rawText);
  return {
    error: "Failed to generate structured refactor",
    rawResponse: rawText
  };
}

export async function confirmRefactorSave(
  config: AppConfig,
  requestId: string,
  _sourcePath: string,
  note: { title: string; content: string; links?: string[]; tags?: string[] }
) {
  return confirmAskSave(
    config,
    requestId,
    {
      ...note,
      tags: [...(note.tags || []), "refactored"]
    },
    { type: "ai_refactored", source: "refactor" }
  );
}
