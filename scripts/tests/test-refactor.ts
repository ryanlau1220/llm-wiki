import { refactorNotePreview } from "../../apps/api/src/refactor";
import { loadConfig } from "../../apps/api/src/config";

async function test() {
  console.log("🚀 Starting Refactor Engine Test...");
  
  const config = loadConfig();
  // Ensure we have a test note
  const testNotePath = "messy-test.md";
  
  try {
    const result = await refactorNotePreview(config, testNotePath);
    if (result.error) {
      console.error("❌ Refactor Failed:", result.error);
      console.error("Raw Response:", result.rawResponse);
    } else {
      console.log("✅ Refactor Successful!");
      console.log("Request ID:", result.requestId);
      console.log("Refactored Title:", result.refactored_note?.title);
      console.log("Content Preview (first 100 chars):", result.refactored_note?.content?.slice(0, 100));
    }
  } catch (error: any) {
    if (error.message?.includes("404") && error.message.toLowerCase().includes("model was not found")) {
      console.warn("⚠️  Skipping test: GCP Model not found (404). This is a known infrastructure limitation.");
      process.exit(0);
    }
    if (
      typeof error?.message === "string" &&
      (error.message.includes("oauth2.googleapis.com/token") ||
        error.message.toLowerCase().includes("unable to connect") ||
        error.message.toLowerCase().includes("connectionrefused"))
    ) {
      console.warn(
        "⚠️  Skipping test: cannot reach Google OAuth token endpoint. This test requires network + ADC."
      );
      process.exit(0);
    }
    console.error("💥 Critical Error during test:", error);
    process.exit(1);
  }
  process.exit(0);
}

test();
