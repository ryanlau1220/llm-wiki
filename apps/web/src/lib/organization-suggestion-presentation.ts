const ORGANIZATION_SUGGESTION_LABELS = {
  add_links: "Connection review",
  complete_metadata: "Metadata review",
  expand_note: "Scope review",
  review_duplicate: "Duplicate review",
  review_stale_note: "Freshness review",
} as const;

type OrganizationSuggestionKind = keyof typeof ORGANIZATION_SUGGESTION_LABELS;

export function formatOrganizationSuggestionKind(type: string): string {
  if (isOrganizationSuggestionKind(type)) return ORGANIZATION_SUGGESTION_LABELS[type];
  return "Organization review";
}

export function formatOrganizationPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function organizationSuggestionTone(priority: number): string {
  if (priority >= 0.8) return "high";
  if (priority >= 0.6) return "medium";
  return "low";
}

function isOrganizationSuggestionKind(value: string): value is OrganizationSuggestionKind {
  return value in ORGANIZATION_SUGGESTION_LABELS;
}
