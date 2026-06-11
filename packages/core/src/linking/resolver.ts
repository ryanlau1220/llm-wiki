import { eq, sql, and, isNull, inArray } from "drizzle-orm";
import { documents, links, type DbClient } from "@llm-wiki/db";

/**
 * Resolves outgoing and incoming links for a single document.
 */
export async function resolveLinksForDocument(
  db: DbClient,
  documentId: string,
  title: string
): Promise<void> {
  // 1. Resolve outgoing links from this document (source_document_id = documentId)
  const unresolvedOutgoing = await db
    .select({
      id: links.id,
      label: links.target_label,
    })
    .from(links)
    .where(
      and(
        eq(links.source_document_id, documentId),
        isNull(links.target_document_id)
      )
    );

  for (const link of unresolvedOutgoing) {
    const targetDoc = await db
      .select({ id: documents.id })
      .from(documents)
      .where(sql`lower(${documents.title}) = lower(${link.label})`)
      .limit(1);

    if (targetDoc.length > 0) {
      await db
        .update(links)
        .set({
          target_document_id: targetDoc[0].id,
          is_resolved: true,
          updated_at: new Date(),
        })
        .where(eq(links.id, link.id));
    }
  }

  // 2. Resolve incoming links targeting this document's title
  const matchingIncoming = await db
    .select({ id: links.id })
    .from(links)
    .where(
      and(
        sql`lower(${links.target_label}) = lower(${title})`,
        isNull(links.target_document_id)
      )
    );

  if (matchingIncoming.length > 0) {
    const ids = matchingIncoming.map((l) => l.id);
    await db
      .update(links)
      .set({
        target_document_id: documentId,
        is_resolved: true,
        updated_at: new Date(),
      })
      .where(inArray(links.id, ids));
  }
}

/**
 * Scans the database and resolves all unresolved links.
 */
export async function resolveAllLinks(db: DbClient): Promise<void> {
  const unresolved = await db
    .select({
      id: links.id,
      label: links.target_label,
    })
    .from(links)
    .where(isNull(links.target_document_id));

  for (const link of unresolved) {
    const targetDoc = await db
      .select({ id: documents.id })
      .from(documents)
      .where(sql`lower(${documents.title}) = lower(${link.label})`)
      .limit(1);

    if (targetDoc.length > 0) {
      await db
        .update(links)
        .set({
          target_document_id: targetDoc[0].id,
          is_resolved: true,
          updated_at: new Date(),
        })
        .where(eq(links.id, link.id));
    }
  }
}
