import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  configuredOllamaModels,
  inspectOllamaModels,
  type OllamaModelReadiness,
  pullOllamaModel,
} from "../packages/ai/src/ollama/models";

async function askToInstall(models: string[]): Promise<boolean> {
  if (!input.isTTY || !output.isTTY) {
    console.log(
      `[Ollama] Missing local model(s): ${models.join(", ")}. Run this command in an interactive terminal to install them.`,
    );
    return false;
  }

  const prompt = createInterface({ input, output });
  try {
    const answer = await prompt.question(
      `Do you want to install local evaluation model(s): ${models.join(", ")}? [Y/n] `,
    );
    return /^(?:|y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function ensureOllamaModels(): Promise<void> {
  const configuredBaseUrl = process.env.OLLAMA_BASE_URL;
  if (!configuredBaseUrl) {
    console.log("[Ollama] Local model setup skipped (OLLAMA_BASE_URL not set).");
    return;
  }

  const baseUrl = configuredBaseUrl;
  const requiredModels = configuredOllamaModels();

  let readiness: OllamaModelReadiness;
  try {
    readiness = await inspectOllamaModels(baseUrl, requiredModels);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[Ollama] Local model setup skipped: ${message}`);
    return;
  }

  if (readiness.missingModels.length === 0) {
    console.log(`[Ollama] Local model(s) ready: ${requiredModels.join(", ")}.`);
    return;
  }

  console.log(`[Ollama] Missing local model(s): ${readiness.missingModels.join(", ")}.`);
  if (!(await askToInstall(readiness.missingModels))) {
    console.log(
      "[Ollama] Installation skipped. The provider diagnostic will report the missing model(s).",
    );
    return;
  }

  for (const model of readiness.missingModels) {
    process.stdout.write(`[Ollama] Downloading ${model}... `);
    try {
      await pullOllamaModel(baseUrl, model);
      console.log("done.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`failed (${message}).`);
    }
  }
}

await ensureOllamaModels();
