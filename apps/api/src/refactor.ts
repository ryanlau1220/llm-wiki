import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";

import { createLLMProvider, createEmbeddingProvider } from "@llm-wiki/ai";
import { createLogger, ingestMarkdown } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";
import { sseEmitter } from "./events";

export async function refactorNotePreview(
  config: AppConfig,
  filePath: string
) {
  const logger = createLogger("refactor");
  logger.info("New refactor request", { filePath });

  const vaultRoot = path.resolve(config.vaultPath);
  const fullPath = path.resolve(vaultRoot, filePath);
  
  // Safety check: ensure file is within vault root directory
  if (!fullPath.startsWith(vaultRoot)) {
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
   - ## Related Concepts (Suggested wikilinks formatted exactly as [[Concept Name]] list, e.g., [[Machine Learning]])
3. Use clear, professional language.
4. Output your response as a JSON object matching the schema below.
5. IMPORTANT: NEVER use unescaped double quotes inside the "content" or "title" string values. If you need to emphasize something or use a quote within the text, use single quotes (') or markdown bolding (**text**) instead. Unescaped double quotes will break the JSON parsing and fail the task.
6. CRITICAL WIKILINK FORMAT: Always format internal links to other concepts as Obsidian-style wikilinks [[Concept Name]] (e.g., [[Machine Learning]]). Never use standard HTML or Markdown link syntax like [Machine Learning](/Machine%20Learning) or [Machine Learning](Machine%20Learning.md) for internal vault links.

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
  _requestId: string,
  sourcePath: string,
  note: { title: string; content: string; links?: string[]; tags?: string[] }
) {
  const logger = createLogger("refactor");
  logger.info("Confirm refactor save (in-place)", { sourcePath });

  if (!config.databaseUrl) {
    return { status: "rejected", error: "DATABASE_URL is required" };
  }

  const { db } = createDbClient(config.databaseUrl);

  const absoluteSourcePath = path.resolve(config.vaultPath, sourcePath);
  if (!absoluteSourcePath.startsWith(path.resolve(config.vaultPath))) {
    return { status: "rejected", error: "Invalid source path: must be within vault" };
  }

  // 1. Read existing file for backup
  let originalContent = "";
  try {
    originalContent = await fs.readFile(absoluteSourcePath, "utf8");
  } catch (err: any) {
    return { status: "rejected", error: `Failed to read original file: ${err.message}` };
  }

  // 2. Write backup to .llm-wiki/backups/
  const backupDir = path.join(config.vaultPath, ".llm-wiki", "backups");
  try {
    await fs.mkdir(backupDir, { recursive: true });
    const baseName = path.basename(absoluteSourcePath, ".md");
    // Format timestamp: YYYYMMDD_HHMMSS
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .split(".")[0];
    const backupFilePath = path.join(backupDir, `${baseName}.${timestamp}.md`);
    await fs.writeFile(backupFilePath, originalContent, "utf8");
    logger.info(`Pre-refactor backup created at: ${backupFilePath}`);
  } catch (err: any) {
    logger.error("Failed to create pre-refactor backup", err);
    return { status: "rejected", error: `Failed to create backup safety net: ${err.message}` };
  }

  // 3. Parse original frontmatter and merge refactored status
  let mergedMetadata: Record<string, any> = {};
  try {
    const parsedOriginal = matter(originalContent);
    mergedMetadata = {
      ...parsedOriginal.data,
      ai_status: "refactored",
      health_score: 0.95,
      type: "ai_refactored",
      source: "refactor",
      updated_at: new Date().toISOString()
    };
  } catch {
    mergedMetadata = {
      ai_status: "refactored",
      health_score: 0.95,
      type: "ai_refactored",
      source: "refactor",
      created_at: new Date().toISOString()
    };
  }

  // Sanitise tags if tags are specified
  const sanitizedTags = (note.tags || [])
    .map((tag) =>
      tag
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 50)
    )
    .filter((tag) => tag.length > 0);
  if (sanitizedTags.length) {
    mergedMetadata.tags = sanitizedTags;
  }

  // Re-generate file contents with stringified frontmatter
  const newFileContent = matter.stringify(note.content, mergedMetadata);

  // 4. Overwrite original note in-place
  try {
    await fs.writeFile(absoluteSourcePath, newFileContent, "utf8");
  } catch (err: any) {
    return { status: "rejected", error: `Failed to write refactored note: ${err.message}` };
  }

  // 5. Ingest updated document immediately
  try {
    const embeddingProvider = createEmbeddingProvider({
      provider: config.embeddingProvider,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpEmbeddingModel
      },
      ollama: {
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaEmbeddingModel
      },
      openai: {
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiEmbeddingModel
      }
    });

    const llmProvider = createLLMProvider({
      provider: config.embeddingProvider as any,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpLlmModel
      },
      ollama: {
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaLlmModel
      },
      openai: {
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiLlmModel
      }
    });

    await ingestMarkdown(
      {
        db,
        options: {
          embeddingProvider,
          llmProvider,
          embeddingVersion: config.embeddingVersion
        }
      },
      {
        vaultPath: sourcePath,
        rawContent: newFileContent,
        sourceKind: "ai",
        isAiGenerated: true
      }
    );
    sseEmitter.emit("change", { type: "note_changed", path: sourcePath });
  } catch (ingestError: any) {
    logger.error(`Failed to ingest refactored note: ${sourcePath}`, ingestError);
  }

  return {
    status: "saved" as const,
    path: absoluteSourcePath
  };
}
