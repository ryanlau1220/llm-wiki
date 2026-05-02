import { validateLinks } from "../../packages/core/src/linking/validator";
import { createDbClient, documents, links } from "../../packages/db/src";
import { eq } from "drizzle-orm";

function containsConnRefused(err: any, depth = 0): boolean {
  if (!err || depth > 5) return false;
  const msg = String(err?.message ?? err ?? "");
  if (msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED")) return true;
  return (
    containsConnRefused(err?.cause, depth + 1) ||
    containsConnRefused(err?.error, depth + 1) ||
    containsConnRefused(err?.originalError, depth + 1) ||
    containsConnRefused(err?.original, depth + 1)
  );
}

async function test() {
  console.log("🚀 Starting Link Intelligence Test...");
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("⚠️  Skipping test: DATABASE_URL is not set.");
    process.exit(0);
  }

  const { db } = createDbClient(dbUrl);

  try {
    // 1. Create a dummy document with messy links
    const [doc] = await db.insert(documents).values({
      path: "human/intelligence-test.md",
      title: "Intelligence Test",
      type: "human",
      content: "Exploring [[Gemini]] and [[MissingKnowledge]].",
      content_hash: `test-hash-${Date.now()}`,
      source_kind: "manual",
      is_ai_generated: false,
    }).returning();

    // 2. Register links in the DB (simulating parser output)
    await db.insert(links).values([
      {
        source_document_id: doc.id,
        source_path: doc.path,
        target_label: "Gemini",
        is_resolved: false,
      },
      {
        source_document_id: doc.id,
        source_path: doc.path,
        target_label: "MissingKnowledge",
        is_resolved: false,
      }
    ]);

    // 3. Create 'Gemini' to resolve one link
    const [target] = await db.insert(documents).values({
      path: "human/Gemini.md",
      title: "Gemini",
      type: "human",
      content: "Information about Gemini 3.1.",
      content_hash: `gemini-hash-${Date.now()}`,
      source_kind: "manual",
      is_ai_generated: false,
    }).returning();

    await db.update(links)
      .set({ target_document_id: target.id, is_resolved: true })
      .where(eq(links.target_label, "Gemini"));

    // 4. Validate
    const results = await validateLinks(db, doc.id);
    
    console.log("✅ Validation Results:");
    results.forEach(r => {
      console.log(`  - [[${r.label}]]: ${r.exists ? `FOUND (${r.targetPath})` : "MISSING"}`);
    });

    // Cleanup
    await db.delete(documents).where(eq(documents.id, doc.id));
    await db.delete(documents).where(eq(documents.id, target.id));
    console.log("🧹 Test cleanup completed.");
    
  } catch (error: any) {
    if (containsConnRefused(error)) {
      console.warn("⚠️  Skipping test: Postgres is not reachable (check DATABASE_URL / port 5432).");
      process.exit(0);
    }
    console.error("💥 Critical Error during test:", error);
    process.exit(1);
  }
  process.exit(0);
}

test();
