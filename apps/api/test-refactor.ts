import { refactorNotePreview } from "./src/refactor";
import { loadConfig } from "./src/config";

async function test() {
  const config = loadConfig();
  // Override vault path for test if needed
  config.vaultPath = "./vault/human";

  try {
    console.log("Testing refactorNotePreview for messy.md...");
    const result = await refactorNotePreview(config, "messy.md");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
