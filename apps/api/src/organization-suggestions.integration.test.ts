import crypto from "node:crypto";

import { afterEach, describe, expect, test } from "bun:test";
import { count, inArray } from "drizzle-orm";

import { createDbClient, documents, links } from "@llm-wiki/db";

import { listOrganizationSuggestions } from "./organization-suggestions";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;
const PRIVATE_NOTE_CONTENT =
  "This private note body must never be returned by organization suggestions.";
const REFERENCE_NOW = new Date("2026-07-24T00:00:00.000Z");
const STALE_UPDATED_AT = new Date("2026-01-01T00:00:00.000Z");
const ORGANIZATION_SUGGESTION_KEYS = [
  "actionLabel",
  "candidateNoteIds",
  "confidence",
  "id",
  "noteId",
  "notePath",
  "priority",
  "reason",
  "requiresApproval",
  "reversible",
  "type",
];

describeWithDatabase("organization suggestions API service", () => {
  const createdDocumentIds: string[] = [];
  const createdSourceDocumentIds: string[] = [];

  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!);
    if (createdSourceDocumentIds.length > 0) {
      await db
        .delete(links)
        .where(inArray(links.source_document_id, createdSourceDocumentIds.splice(0)));
    }
    if (createdDocumentIds.length > 0) {
      await db.delete(documents).where(inArray(documents.id, createdDocumentIds.splice(0)));
    }
  });

  test("returns deterministic review metadata without exposing content or mutating indexed data", async () => {
    const { db } = createDbClient(DATABASE_URL!);
    const beforeCounts = await getIndexedCounts();
    const firstDocument = await createTestDocument("first");
    const secondDocument = await createTestDocument("second");
    createdDocumentIds.push(firstDocument.id, secondDocument.id);

    await db.insert(links).values({
      source_document_id: firstDocument.id,
      source_path: firstDocument.path,
      target_label: "missing organization target",
      is_resolved: false,
    });
    createdSourceDocumentIds.push(firstDocument.id);

    const firstResult = await listOrganizationSuggestions(
      { databaseUrl: DATABASE_URL! },
      { maxResults: 200 },
      REFERENCE_NOW,
    );
    const secondResult = await listOrganizationSuggestions(
      { databaseUrl: DATABASE_URL! },
      { maxResults: 200 },
      REFERENCE_NOW,
    );
    const afterCounts = await getIndexedCounts();
    const testSuggestions = firstResult.filter(
      (suggestion) => suggestion.noteId === firstDocument.id,
    );

    expect(firstResult).toEqual(secondResult);
    expect(afterCounts).toEqual({
      documents: beforeCounts.documents + 2,
      links: beforeCounts.links + 1,
    });
    expect(testSuggestions.map((suggestion) => suggestion.type)).toEqual([
      "complete_metadata",
      "add_links",
      "expand_note",
      "review_stale_note",
    ]);
    expect(
      testSuggestions.every((suggestion) => suggestion.requiresApproval && suggestion.reversible),
    ).toBe(true);
    expect(
      testSuggestions.every(
        (suggestion) =>
          Object.keys(suggestion).sort().join(",") === ORGANIZATION_SUGGESTION_KEYS.join(","),
      ),
    ).toBe(true);
    expect(JSON.stringify(firstResult)).not.toContain(PRIVATE_NOTE_CONTENT);
  });
});

async function createTestDocument(label: string): Promise<{ id: string; path: string }> {
  const { db } = createDbClient(DATABASE_URL!);
  const uniqueId = crypto.randomUUID();
  const path = `test/organization-api-${label}-${uniqueId}.md`;
  const [document] = await db
    .insert(documents)
    .values({
      path,
      title: `Organization API ${label}`,
      type: "note",
      content: PRIVATE_NOTE_CONTENT,
      content_hash: crypto.createHash("sha256").update(uniqueId).digest("hex"),
      source_kind: "vault",
      quality_score: 0.3,
      health_score: 0.3,
      quality_metrics: {
        linkDensity: 0,
        completeness: 0,
        wordCount: 12,
      },
      updated_at: STALE_UPDATED_AT,
    })
    .returning({ id: documents.id, path: documents.path });

  if (!document) {
    throw new Error("Test document was not created");
  }
  return document;
}

async function getIndexedCounts(): Promise<{ documents: number; links: number }> {
  const { db } = createDbClient(DATABASE_URL!);
  const [documentResult, linkResult] = await Promise.all([
    db.select({ value: count() }).from(documents),
    db.select({ value: count() }).from(links),
  ]);

  return {
    documents: documentResult[0]?.value ?? 0,
    links: linkResult[0]?.value ?? 0,
  };
}
