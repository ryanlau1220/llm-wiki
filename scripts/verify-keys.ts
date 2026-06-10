import {
  createLLMProvider,
  createEmbeddingProvider,
  OpenAILLMProvider,
  OpenAIEmbeddingProvider,
  GeminiLLMProvider,
  GeminiEmbeddingProvider,
  GeminiGeapLLMProvider,
  GeminiGeapEmbeddingProvider,
  OllamaLLMProvider,
  OllamaEmbeddingProvider
} from "../packages/ai/src";

function maskKey(key: string | undefined): string {
  if (!key) return "Not Configured";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 8)}...${key.slice(-6)}`;
}

async function runTest(_name: string, action: () => Promise<any>): Promise<{ ok: boolean; message: string }> {
  try {
    const start = Date.now();
    await action();
    const duration = Date.now() - start;
    return { ok: true, message: `✅ SUCCESS (${duration}ms)` };
  } catch (error: any) {
    return { ok: false, message: `❌ FAILED: ${error.message || error}` };
  }
}

async function verifyKeys() {
  console.log("==============================================");
  console.log("   🔑 LLM Wiki API Keys & Provider Diagnostics");
  console.log("==============================================\n");

  const results: { provider: string; type: string; status: string; ok: boolean }[] = [];

  const addResult = (provider: string, type: string, res: { ok: boolean; message: string }) => {
    results.push({ provider, type, status: res.message, ok: res.ok });
    console.log(`[${provider}] - ${type}: ${res.message}`);
  };

  // 1. Groq Check
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    console.log(`👉 Testing Groq (Key: ${maskKey(groqKey)})...`);
    const provider = new OpenAILLMProvider({
      apiKey: groqKey,
      baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      model: process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile"
    });
    const res = await runTest("Groq LLM", () =>
      provider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("Groq", "LLM", res);
  } else {
    console.log(`[Groq] - LLM: ➖ SKIPPED (GROQ_API_KEY not set)`);
  }

  // 2. OpenRouter Check
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    console.log(`👉 Testing OpenRouter (Key: ${maskKey(openRouterKey)})...`);
    const provider = new OpenAILLMProvider({
      apiKey: openRouterKey,
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_LLM_MODEL || "google/gemma-4-31b-it:free"
    });
    const res = await runTest("OpenRouter LLM", () =>
      provider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("OpenRouter", "LLM", res);
  } else {
    console.log(`[OpenRouter] - LLM: ➖ SKIPPED (OPENROUTER_API_KEY not set)`);
  }

  // 3. BazaarLink Check
  const bazaarLinkKey = process.env.BAZAARLINK_API_KEY;
  if (bazaarLinkKey) {
    console.log(`👉 Testing BazaarLink (Key: ${maskKey(bazaarLinkKey)})...`);
    
    // LLM
    const llmProvider = new OpenAILLMProvider({
      apiKey: bazaarLinkKey,
      baseUrl: process.env.BAZAARLINK_BASE_URL || "https://bazaarlink.ai/api/v1",
      model: process.env.BAZAARLINK_LLM_MODEL || "gpt-4o-mini"
    });
    const llmRes = await runTest("BazaarLink LLM", () =>
      llmProvider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("BazaarLink", "LLM", llmRes);

    // Embedding
    const embedProvider = new OpenAIEmbeddingProvider({
      apiKey: bazaarLinkKey,
      baseUrl: process.env.BAZAARLINK_BASE_URL || "https://bazaarlink.ai/api/v1",
      model: process.env.BAZAARLINK_EMBEDDING_MODEL || "openai/text-embedding-3-small",
      dimensions: 768
    });
    const embedRes = await runTest("BazaarLink Embedding", () =>
      embedProvider.embed({ texts: ["Health check."] })
    );
    addResult("BazaarLink", "Embedding", embedRes);
  } else {
    console.log(`[BazaarLink] - LLM: ➖ SKIPPED (BAZAARLINK_API_KEY not set)`);
    console.log(`[BazaarLink] - Embedding: ➖ SKIPPED (BAZAARLINK_API_KEY not set)`);
  }

  // 4. Gemini GEAP Check
  const gcpProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (gcpProject) {
    console.log(`👉 Testing Gemini GEAP (Project: ${gcpProject})...`);
    
    // LLM
    const llmProvider = new GeminiGeapLLMProvider({
      projectId: gcpProject,
      location: process.env.GEMINI_GCP_LOCATION || "global",
      model: process.env.GEMINI_GCP_LLM_MODEL || "gemini-2.5-flash"
    });
    const llmRes = await runTest("Gemini GEAP LLM", () =>
      llmProvider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("Gemini GEAP", "LLM", llmRes);

    // Embedding
    const embedProvider = new GeminiGeapEmbeddingProvider({
      projectId: gcpProject,
      location: process.env.GEMINI_GCP_LOCATION || "global",
      model: process.env.GEMINI_GCP_EMBEDDING_MODEL || "gemini-embedding-001"
    });
    const embedRes = await runTest("Gemini GEAP Embedding", () =>
      embedProvider.embed({ texts: ["Health check."] })
    );
    addResult("Gemini GEAP", "Embedding", embedRes);
  } else {
    console.log(`[Gemini GEAP] - LLM: ➖ SKIPPED (GOOGLE_CLOUD_PROJECT not set)`);
    console.log(`[Gemini GEAP] - Embedding: ➖ SKIPPED (GOOGLE_CLOUD_PROJECT not set)`);
  }

  // 5. Gemini API Key Check
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    console.log(`👉 Testing Gemini API Key (Key: ${maskKey(geminiKey)})...`);
    
    // LLM
    const llmProvider = new GeminiLLMProvider({
      apiKey: geminiKey
    });
    const llmRes = await runTest("Gemini LLM", () =>
      llmProvider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("Gemini", "LLM", llmRes);

    // Embedding
    const embedProvider = new GeminiEmbeddingProvider({
      apiKey: geminiKey
    });
    const embedRes = await runTest("Gemini Embedding", () =>
      embedProvider.embed({ texts: ["Health check."] })
    );
    addResult("Gemini", "Embedding", embedRes);
  } else {
    console.log(`[Gemini] - LLM: ➖ SKIPPED (GEMINI_API_KEY not set)`);
    console.log(`[Gemini] - Embedding: ➖ SKIPPED (GEMINI_API_KEY not set)`);
  }

  // 6. Ollama Check
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaUrl) {
    console.log(`👉 Testing Ollama (URL: ${ollamaUrl})...`);
    
    // LLM
    const llmProvider = new OllamaLLMProvider({
      baseUrl: ollamaUrl,
      model: process.env.OLLAMA_LLM_MODEL || "llama3"
    });
    const llmRes = await runTest("Ollama LLM", () =>
      llmProvider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("Ollama", "LLM", llmRes);

    // Embedding
    const embedProvider = new OllamaEmbeddingProvider({
      baseUrl: ollamaUrl,
      model: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text"
    });
    const embedRes = await runTest("Ollama Embedding", () =>
      embedProvider.embed({ texts: ["Health check."] })
    );
    addResult("Ollama", "Embedding", embedRes);
  } else {
    console.log(`[Ollama] - LLM: ➖ SKIPPED (OLLAMA_BASE_URL not set)`);
    console.log(`[Ollama] - Embedding: ➖ SKIPPED (OLLAMA_BASE_URL not set)`);
  }

  // 7. OpenAI Check
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    console.log(`👉 Testing OpenAI (Key: ${maskKey(openaiKey)})...`);
    
    // LLM
    const llmProvider = new OpenAILLMProvider({
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_LLM_MODEL || "gpt-4o-mini"
    });
    const llmRes = await runTest("OpenAI LLM", () =>
      llmProvider.generate({ prompt: "Reply only with the word 'OK'.", temperature: 0.1 })
    );
    addResult("OpenAI", "LLM", llmRes);

    // Embedding
    const embedProvider = new OpenAIEmbeddingProvider({
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      dimensions: 768
    });
    const embedRes = await runTest("OpenAI Embedding", () =>
      embedProvider.embed({ texts: ["Health check."] })
    );
    addResult("OpenAI", "Embedding", embedRes);
  } else {
    console.log(`[OpenAI] - LLM: ➖ SKIPPED (OPENAI_API_KEY not set)`);
    console.log(`[OpenAI] - Embedding: ➖ SKIPPED (OPENAI_API_KEY not set)`);
  }

  // 8. Test Dynamic Fallback Chain Build
  console.log("\n👉 Testing Dynamic Fallback Orchestrator Initialization...");
  const orchestratorLLMRes = await runTest("Fallback LLM Orchestrator", async () => {
    const llm = createLLMProvider();
    console.log(`   (LLM Fallback chain: ${llm.model})`);
  });
  addResult("Fallback Orchestrator", "LLM Build", orchestratorLLMRes);

  const orchestratorEmbedRes = await runTest("Fallback Embedding Orchestrator", async () => {
    const embedder = createEmbeddingProvider();
    console.log(`   (Embedding Fallback chain: ${embedder.model})`);
  });
  addResult("Fallback Orchestrator", "Embedding Build", orchestratorEmbedRes);

  // Summary Report
  console.log("\n==============================================");
  console.log("               Diagnostic Report");
  console.log("==============================================");
  let failedCount = 0;
  for (const item of results) {
    if (!item.ok) {
      failedCount++;
    }
  }

  if (failedCount > 0) {
    console.log(`❌ Done with errors. ${failedCount} test(s) failed.`);
    process.exit(1);
  } else {
    console.log("✨ All configured providers verified successfully!");
    process.exit(0);
  }
}

verifyKeys();
