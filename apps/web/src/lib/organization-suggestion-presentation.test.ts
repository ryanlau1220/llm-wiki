import { describe, expect, it } from "vitest";

import {
  formatCandidateNoteReference,
  formatCandidateReferenceCount,
  formatOrganizationPercentage,
  formatOrganizationSuggestionKind,
  organizationSuggestionTone,
} from "./organization-suggestion-presentation";

describe("organization suggestion presentation helpers", () => {
  it("uses clear labels for known organization signal types", () => {
    expect(formatOrganizationSuggestionKind("review_duplicate")).toBe("Duplicate review");
    expect(formatOrganizationSuggestionKind("complete_metadata")).toBe("Metadata review");
    expect(formatOrganizationSuggestionKind("unknown_signal")).toBe("Organization review");
  });

  it("formats normalized scores as whole percentages", () => {
    expect(formatOrganizationPercentage(0)).toBe("0%");
    expect(formatOrganizationPercentage(0.725)).toBe("73%");
    expect(formatOrganizationPercentage(1)).toBe("100%");
  });

  it("labels candidate references with the correct count", () => {
    expect(formatCandidateReferenceCount(1)).toBe("1 indexed note");
    expect(formatCandidateReferenceCount(2)).toBe("2 indexed notes");
  });

  it("uses the resolved note title and path, with an explicit unavailable fallback", () => {
    expect(
      formatCandidateNoteReference(
        { title: "Retrieval overview", path: "ai/retrieval.md" },
        "candidate-id",
      ),
    ).toBe("Retrieval overview · ai/retrieval.md");
    expect(formatCandidateNoteReference(undefined, "12345678-1234-1234-1234-123456789abc")).toBe(
      "Unavailable note reference (12345678…)",
    );
  });

  it("assigns restrained priority tones at the review boundaries", () => {
    expect(organizationSuggestionTone(0.8)).toBe("high");
    expect(organizationSuggestionTone(0.6)).toBe("medium");
    expect(organizationSuggestionTone(0.59)).toBe("low");
  });
});
