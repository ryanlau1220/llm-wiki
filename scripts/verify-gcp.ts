import { GoogleAuth } from "google-auth-library";
import { createLLMProvider, createEmbeddingProvider } from "../packages/ai/src";

async function verifyGcp() {
  console.log("🚀 Starting GCP/GEAP Verification...");

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  const location = process.env.GEMINI_GCP_LOCATION || "us-central1";
  
  if (!projectId) {
    console.error("❌ ERROR: GOOGLE_CLOUD_PROJECT is not set.");
    process.exit(1);
  }
  console.log(`✅ Project ID: ${projectId}`);
  console.log(`✅ Location: ${location}`);

  try {
    const auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    const credentials = await auth.getCredentials();
    
    console.log(`✅ Authentication: SUCCESS (${credentials.client_email || "Authorized User"})`);
  } catch (error: any) {
    console.error("❌ ERROR: Authentication failed. Run 'gcloud auth application-default login'.");
    console.error(error.message);
    process.exit(1);
  }

  // Verify LLM Access
  try {
    const llm = createLLMProvider({
      provider: "gemini-geap",
      geminiGeap: {
        projectId,
        location,
        model: process.env.GEMINI_GCP_LLM_MODEL || "gemini-2.5-flash"
      }
    });
    
    console.log(`⏳ Testing LLM access (${process.env.GEMINI_GCP_LLM_MODEL || "gemini-2.5-flash"})...`);
    const res = await llm.generate({ prompt: "Health check. Reply with 'OK'.", temperature: 0.1 });
    if (res.text.trim().includes("OK")) {
      console.log("✅ LLM Access: SUCCESS");
    } else {
      console.warn(`⚠️ LLM Access: Unexpected response: ${res.text}`);
    }
  } catch (error: any) {
    console.error("❌ ERROR: LLM access failed.");
    console.error(error.message);
  }

  // Verify Embedding Access
  try {
    const embedder = createEmbeddingProvider({
      provider: "gemini-geap",
      geminiGeap: {
        projectId,
        location,
        model: process.env.GEMINI_GCP_EMBEDDING_MODEL || "gemini-embedding-001"
      }
    });
    
    console.log(`⏳ Testing Embedding access (${process.env.GEMINI_GCP_EMBEDDING_MODEL || "gemini-embedding-001"})...`);
    const res = await embedder.embed({ texts: ["Health check."] });
    if (res.vectors.length > 0) {
      console.log(`✅ Embedding Access: SUCCESS (Dimensions: ${res.vectors[0].length})`);
    } else {
      console.error("❌ ERROR: Embedding access returned no vectors.");
    }
  } catch (error: any) {
    console.error("❌ ERROR: Embedding access failed.");
    console.error(error.message);
  }

  console.log("\n✨ Verification Complete.");
}

verifyGcp();
