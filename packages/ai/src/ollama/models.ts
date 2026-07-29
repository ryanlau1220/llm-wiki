export const DEFAULT_OLLAMA_LLM_MODEL = "llama3";
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";

type OllamaTagsResponse = {
  models?: Array<{
    model?: string;
    name?: string;
  }>;
};

export type OllamaModelReadiness = {
  installedModels: string[];
  missingModels: string[];
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function withoutLatestTag(model: string): string {
  return model.endsWith(":latest") ? model.slice(0, -":latest".length) : model;
}

export function isOllamaModelInstalled(model: string, installedModels: string[]): boolean {
  const expected = withoutLatestTag(model);
  return installedModels.some((installedModel) => withoutLatestTag(installedModel) === expected);
}

export function configuredOllamaModels(environment: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ...new Set([
      environment.OLLAMA_LLM_MODEL || DEFAULT_OLLAMA_LLM_MODEL,
      environment.OLLAMA_EMBEDDING_MODEL || DEFAULT_OLLAMA_EMBEDDING_MODEL,
    ]),
  ];
}

export async function inspectOllamaModels(
  baseUrl: string,
  requiredModels: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaModelReadiness> {
  const response = await fetchImpl(endpoint(baseUrl, "/api/tags"));
  if (!response.ok) {
    throw new Error(`Ollama model list failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OllamaTagsResponse;
  const installedModels = (payload.models || [])
    .flatMap((model) => [model.name, model.model])
    .filter((model): model is string => Boolean(model));

  return {
    installedModels,
    missingModels: requiredModels.filter(
      (model) => !isOllamaModelInstalled(model, installedModels),
    ),
  };
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(endpoint(baseUrl, "/api/pull"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama model download failed with status ${response.status}`);
  }
}
