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
  } catch (error) {
    console.error("💥 Critical Error during test:", error);
  }
}

test();
