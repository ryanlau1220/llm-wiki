import { eq, inArray } from "drizzle-orm";
import { createDbClient, documents, links } from "@llm-wiki/db";

export type LinkValidationResult = {
  label: string;
  exists: boolean;
  targetPath?: string;
};

export async function validateLinks(
  db: ReturnType<typeof createDbClient>["db"],
  documentId: string
): Promise<LinkValidationResult[]> {
  const documentLinks = await db
    .select({
      targetLabel: links.target_label,
      targetDocumentId: links.target_document_id
    })
    .from(links)
    .where(eq(links.source_document_id, documentId));

  const results: LinkValidationResult[] = [];

  for (const link of documentLinks) {
    if (link.targetDocumentId) {
      const [target] = await db
        .select({ path: documents.path })
        .from(documents)
        .where(eq(documents.id, link.targetDocumentId))
        .limit(1);

      results.push({
        label: link.targetLabel,
        exists: true,
        targetPath: target?.path
      });
    } else {
      results.push({
        label: link.targetLabel,
        exists: false
      });
    }
  }

  return results;
}

export async function suggestMissingNotes(
  db: ReturnType<typeof createDbClient>["db"],
  documentId: string
): Promise<string[]> {
  const validation = await validateLinks(db, documentId);
  return validation
    .filter((v) => !v.exists)
    .map((v) => v.label);
}
