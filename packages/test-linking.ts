import { validateLinks } from "../core/src/linking/validator";
import { createDbClient, documents, links } from "../db/src";
import { eq } from "drizzle-orm";

async function test() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("Skipping link validation test: DATABASE_URL not set");
    return;
  }

  const { db } = createDbClient(dbUrl);

  try {
    // 1. Create a dummy document
    const [doc] = await db.insert(documents).values({
      path: "human/test-linking.md",
      title: "Test Linking",
      type: "human",
      content: "Linking to [[Postgres]] and [[MissingNote]]",
      content_hash: "test-hash",
      source_kind: "manual",
      is_ai_generated: false,
    }).returning();

    // 2. Add links
    await db.insert(links).values([
      {
        source_document_id: doc.id,
        source_path: doc.path,
        target_label: "Postgres",
        is_resolved: false,
      },
      {
        source_document_id: doc.id,
        source_path: doc.path,
        target_label: "MissingNote",
        is_resolved: false,
      }
    ]);

    // 3. Create one of the targets to simulate a resolved link
    const [target] = await db.insert(documents).values({
      path: "human/Postgres.md",
      title: "Postgres",
      type: "human",
      content: "Database stuff",
      content_hash: "postgres-hash",
      source_kind: "manual",
      is_ai_generated: false,
    }).returning();

    // Update the link to be resolved
    await db.update(links)
      .set({ target_document_id: target.id, is_resolved: true })
      .where(eq(links.target_label, "Postgres"));

    console.log("Validating links for document:", doc.id);
    const results = await validateLinks(db, doc.id);
    console.log("Validation Results:", JSON.stringify(results, null, 2));

    // Cleanup
    await db.delete(documents).where(eq(documents.id, doc.id));
    await db.delete(documents).where(eq(documents.id, target.id));
    
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
