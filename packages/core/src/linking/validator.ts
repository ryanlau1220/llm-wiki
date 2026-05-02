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

export async function getGlobalLinkHealth(
  db: ReturnType<typeof createDbClient>["db"]
): Promise<{ label: string; count: number; sourcePaths: string[] }[]> {
  const brokenLinks = await db
    .select({
      label: links.target_label,
      sourceId: links.source_document_id
    })
    .from(links)
    .where(eq(links.target_document_id, null as any)); // Type hack for null

  const statsMap = new Map<string, { label: string; count: number; sourceIds: Set<string> }>();

  for (const link of brokenLinks) {
    const entry = statsMap.get(link.label) ?? { label: link.label, count: 0, sourceIds: new Set() };
    entry.count++;
    entry.sourceIds.add(link.sourceId);
    statsMap.set(link.label, entry);
  }

  const results = [];
  for (const entry of statsMap.values()) {
    const sourceDocs = await db
      .select({ path: documents.path })
      .from(documents)
      .where(inArray(documents.id, Array.from(entry.sourceIds)));
    
    results.push({
      label: entry.label,
      count: entry.count,
      sourcePaths: sourceDocs.map((d) => d.path)
    });
  }

  return results.sort((a, b) => b.count - a.count);
}
