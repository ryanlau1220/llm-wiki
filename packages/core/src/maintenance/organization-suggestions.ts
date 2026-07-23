/**
 * Deterministic, review-only suggestions derived from indexed note signals.
 * Applying a suggestion is deliberately outside this module: every action
 * requires an explicit user decision and can be undone by the caller.
 */
export const ORGANIZATION_SUGGESTION_TYPE = {
  ADD_LINKS: "add_links",
  COMPLETE_METADATA: "complete_metadata",
  EXPAND_NOTE: "expand_note",
  REVIEW_DUPLICATE: "review_duplicate",
  REVIEW_STALE_NOTE: "review_stale_note",
} as const;

export type OrganizationSuggestionType =
  (typeof ORGANIZATION_SUGGESTION_TYPE)[keyof typeof ORGANIZATION_SUGGESTION_TYPE];

export type OrganizationNoteSignals = {
  id: string;
  path: string;
  title: string;
  qualityScore?: number | null;
  healthScore?: number | null;
  wordCount?: number | null;
  completeness?: number | null;
  linkDensity?: number | null;
  unresolvedLinkCount?: number;
  duplicateNoteIds?: readonly string[];
  staleDays?: number | null;
};

export type OrganizationSuggestion = {
  id: string;
  type: OrganizationSuggestionType;
  noteId: string;
  notePath: string;
  priority: number;
  confidence: number;
  reason: string;
  actionLabel: string;
  candidateNoteIds: string[];
  requiresApproval: true;
  reversible: true;
};

const LOW_LINK_DENSITY_THRESHOLD = 0.02;
const LOW_COMPLETENESS_THRESHOLD = 0.5;
const MIN_COMPLETE_NOTE_WORD_COUNT = 80;
const STALE_NOTE_DAY_THRESHOLD = 90;
const MAX_CONFIDENCE = 1;
const MIN_CONFIDENCE = 0;
const DUPLICATE_REVIEW_PRIORITY = 0.92;
const DUPLICATE_REVIEW_CONFIDENCE = 0.85;
const METADATA_PRIORITY = 0.78;
const METADATA_CONFIDENCE = 0.9;
const LINKING_PRIORITY = 0.72;
const LINKING_CONFIDENCE = 0.88;
const EXPAND_NOTE_PRIORITY = 0.62;
const EXPAND_NOTE_CONFIDENCE = 0.82;
const STALE_NOTE_PRIORITY = 0.45;
const STALE_NOTE_CONFIDENCE = 0.7;

/**
 * Ranks candidate improvements without inspecting note content or mutating a
 * vault. A caller may persist the output, but this function remains stable
 * for the same input so suggestions are explainable and easy to test.
 */
export function rankOrganizationSuggestions(
  notes: readonly OrganizationNoteSignals[],
): OrganizationSuggestion[] {
  const suggestions = notes.flatMap(rankNoteSuggestions);

  return suggestions.sort(compareSuggestions);
}

function rankNoteSuggestions(note: OrganizationNoteSignals): OrganizationSuggestion[] {
  validateSignals(note);

  const suggestions: OrganizationSuggestion[] = [];
  const duplicateNoteIds = normalizeCandidateIds(note.duplicateNoteIds, note.id);
  if (duplicateNoteIds.length) {
    suggestions.push(createSuggestion(note, {
      type: ORGANIZATION_SUGGESTION_TYPE.REVIEW_DUPLICATE,
      priority: DUPLICATE_REVIEW_PRIORITY,
      confidence: DUPLICATE_REVIEW_CONFIDENCE,
      reason: `Review ${duplicateNoteIds.length} possible duplicate note${pluralize(duplicateNoteIds.length)} before merging or discarding anything.`,
      actionLabel: "Review duplicates",
      candidateNoteIds: duplicateNoteIds,
    }));
  }

  if (isBelow(note.completeness, LOW_COMPLETENESS_THRESHOLD)) {
    suggestions.push(createSuggestion(note, {
      type: ORGANIZATION_SUGGESTION_TYPE.COMPLETE_METADATA,
      priority: METADATA_PRIORITY,
      confidence: METADATA_CONFIDENCE,
      reason: "Metadata completeness is below the review threshold.",
      actionLabel: "Review metadata",
      candidateNoteIds: [],
    }));
  }

  if (isBelow(note.linkDensity, LOW_LINK_DENSITY_THRESHOLD) || hasUnresolvedLinks(note.unresolvedLinkCount)) {
    suggestions.push(createSuggestion(note, {
      type: ORGANIZATION_SUGGESTION_TYPE.ADD_LINKS,
      priority: LINKING_PRIORITY,
      confidence: LINKING_CONFIDENCE,
      reason: linkReason(note),
      actionLabel: "Review links",
      candidateNoteIds: [],
    }));
  }

  if (isBelowWordCount(note.wordCount, MIN_COMPLETE_NOTE_WORD_COUNT)) {
    suggestions.push(createSuggestion(note, {
      type: ORGANIZATION_SUGGESTION_TYPE.EXPAND_NOTE,
      priority: EXPAND_NOTE_PRIORITY,
      confidence: EXPAND_NOTE_CONFIDENCE,
      reason: `The note has fewer than ${MIN_COMPLETE_NOTE_WORD_COUNT} words and may need a clearer summary or outline.`,
      actionLabel: "Review note scope",
      candidateNoteIds: [],
    }));
  }

  if (isStaleAndWeak(note)) {
    suggestions.push(createSuggestion(note, {
      type: ORGANIZATION_SUGGESTION_TYPE.REVIEW_STALE_NOTE,
      priority: STALE_NOTE_PRIORITY,
      confidence: STALE_NOTE_CONFIDENCE,
      reason: `The note has not changed for at least ${STALE_NOTE_DAY_THRESHOLD} days and has a below-target quality or health score.`,
      actionLabel: "Review freshness",
      candidateNoteIds: [],
    }));
  }

  return suggestions;
}

function createSuggestion(
  note: OrganizationNoteSignals,
  suggestion: Omit<OrganizationSuggestion, "id" | "noteId" | "notePath" | "requiresApproval" | "reversible">,
): OrganizationSuggestion {
  return {
    id: `${note.id}:${suggestion.type}`,
    noteId: note.id,
    notePath: note.path,
    requiresApproval: true,
    reversible: true,
    ...suggestion,
  };
}

function compareSuggestions(left: OrganizationSuggestion, right: OrganizationSuggestion): number {
  return (right.priority - left.priority)
    || (right.confidence - left.confidence)
    || compareText(left.notePath, right.notePath)
    || compareText(left.type, right.type);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeCandidateIds(candidateIds: readonly string[] | undefined, noteId: string): string[] {
  return [...new Set((candidateIds ?? []).filter((candidateId) => candidateId && candidateId !== noteId))]
    .sort(compareText);
}

function isBelow(value: number | null | undefined, threshold: number): boolean {
  return typeof value === "number" && value < threshold;
}

function hasUnresolvedLinks(value: number | undefined): boolean {
  return typeof value === "number" && value > 0;
}

function isBelowWordCount(value: number | null | undefined, threshold: number): boolean {
  return typeof value === "number" && value < threshold;
}

function isStaleAndWeak(note: OrganizationNoteSignals): boolean {
  if (typeof note.staleDays !== "number" || note.staleDays < STALE_NOTE_DAY_THRESHOLD) return false;

  return isBelow(note.qualityScore, LOW_COMPLETENESS_THRESHOLD)
    || isBelow(note.healthScore, LOW_COMPLETENESS_THRESHOLD);
}

function linkReason(note: OrganizationNoteSignals): string {
  const unresolvedLinkCount = note.unresolvedLinkCount ?? 0;
  if (hasUnresolvedLinks(unresolvedLinkCount)) {
    return `${unresolvedLinkCount} unresolved wikilink${pluralize(unresolvedLinkCount)} need review.`;
  }

  return "Link density is below the review threshold.";
}

function pluralize(count: number): string {
  return count === 1 ? "" : "s";
}

function validateSignals(note: OrganizationNoteSignals): void {
  if (!note.id.trim()) throw new Error("Organization note ID is required");
  if (!note.path.trim()) throw new Error("Organization note path is required");
  if (!note.title.trim()) throw new Error("Organization note title is required");

  validateUnitInterval(note.qualityScore, "Quality score");
  validateUnitInterval(note.healthScore, "Health score");
  validateUnitInterval(note.completeness, "Completeness");
  validateUnitInterval(note.linkDensity, "Link density");
  validateNonNegativeInteger(note.wordCount, "Word count");
  validateNonNegativeInteger(note.unresolvedLinkCount, "Unresolved link count");
  validateNonNegativeInteger(note.staleDays, "Stale days");
}

function validateUnitInterval(value: number | null | undefined, label: string): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value < MIN_CONFIDENCE || value > MAX_CONFIDENCE) {
    throw new Error(`${label} must be between ${MIN_CONFIDENCE} and ${MAX_CONFIDENCE}`);
  }
}

function validateNonNegativeInteger(value: number | null | undefined, label: string): void {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}
