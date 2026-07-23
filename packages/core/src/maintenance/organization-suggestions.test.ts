import { describe, expect, test } from "bun:test";

import {
  ORGANIZATION_SUGGESTION_TYPE,
  rankOrganizationSuggestions,
} from "./organization-suggestions";

describe("rankOrganizationSuggestions", () => {
  test("ranks review-only suggestions from measurable note signals", () => {
    const suggestions = rankOrganizationSuggestions([
      {
        id: "networking",
        path: "knowledge/networking.md",
        title: "Networking",
        qualityScore: 0.4,
        healthScore: 0.4,
        wordCount: 24,
        completeness: 0.2,
        linkDensity: 0,
        unresolvedLinkCount: 2,
        duplicateNoteIds: ["networking-copy", "networking-copy", "networking"],
        staleDays: 120,
      },
    ]);

    expect(suggestions.map((suggestion) => suggestion.type)).toEqual([
      ORGANIZATION_SUGGESTION_TYPE.REVIEW_DUPLICATE,
      ORGANIZATION_SUGGESTION_TYPE.COMPLETE_METADATA,
      ORGANIZATION_SUGGESTION_TYPE.ADD_LINKS,
      ORGANIZATION_SUGGESTION_TYPE.EXPAND_NOTE,
      ORGANIZATION_SUGGESTION_TYPE.REVIEW_STALE_NOTE,
    ]);
    expect(suggestions[0]).toMatchObject({
      id: "networking:review_duplicate",
      candidateNoteIds: ["networking-copy"],
      requiresApproval: true,
      reversible: true,
    });
    expect(suggestions[2]?.reason).toBe("2 unresolved wikilinks need review.");
  });

  test("does not flag age alone as a reason to change a healthy note", () => {
    const suggestions = rankOrganizationSuggestions([
      {
        id: "stable-note",
        path: "knowledge/stable.md",
        title: "Stable note",
        qualityScore: 0.95,
        healthScore: 0.95,
        wordCount: 500,
        completeness: 1,
        linkDensity: 0.1,
        staleDays: 365,
      },
    ]);

    expect(suggestions).toEqual([]);
  });

  test("is deterministic and orders equal priority suggestions by path", () => {
    const notes = [
      {
        id: "zeta",
        path: "knowledge/zeta.md",
        title: "Zeta",
        completeness: 0.1,
      },
      {
        id: "alpha",
        path: "knowledge/alpha.md",
        title: "Alpha",
        completeness: 0.1,
      },
    ];

    expect(rankOrganizationSuggestions(notes)).toEqual(rankOrganizationSuggestions([...notes].reverse()));
    expect(rankOrganizationSuggestions(notes).map((suggestion) => suggestion.notePath)).toEqual([
      "knowledge/alpha.md",
      "knowledge/zeta.md",
    ]);
  });

  test("rejects malformed signal values", () => {
    const validNote = {
      id: "valid",
      path: "knowledge/valid.md",
      title: "Valid",
    };

    expect(() => rankOrganizationSuggestions([{ ...validNote, linkDensity: 1.1 }]))
      .toThrow("Link density must be between 0 and 1");
    expect(() => rankOrganizationSuggestions([{ ...validNote, wordCount: -1 }]))
      .toThrow("Word count must be a non-negative integer");
    expect(() => rankOrganizationSuggestions([{ ...validNote, id: " " }]))
      .toThrow("Organization note ID is required");
  });
});
