import { describe, expect, test } from "bun:test";

import { canonicalizeCaptureSources, canonicalizeCaptureUrl } from "./capture-url-normalization";

describe("canonicalizeCaptureUrl", () => {
  test("removes Google tracking parameters but preserves the search query", () => {
    const sourceUrl =
      "https://www.google.com/search?q=squash+merge&oq=squash+merge&sourceid=chrome&ved=abc&sxsrf=token&sca_esv=session&ei=request#result";

    expect(canonicalizeCaptureUrl(sourceUrl)).toBe("https://www.google.com/search?q=squash+merge");
  });

  test("removes common campaign parameters without changing functional parameters", () => {
    const sourceUrl =
      "https://example.com/article?topic=local-first&utm_source=newsletter&gclid=campaign";

    expect(canonicalizeCaptureUrl(sourceUrl)).toBe("https://example.com/article?topic=local-first");
  });

  test("preserves non-Google source parameters", () => {
    const sourceUrl = "https://example.com/article?source=api&ref=related-content";

    expect(canonicalizeCaptureUrl(sourceUrl)).toBe(sourceUrl);
  });
});

describe("canonicalizeCaptureSources", () => {
  test("deduplicates citations after canonicalization", () => {
    const sources = canonicalizeCaptureSources([
      { title: "Primary source", url: "https://example.com/article?utm_source=search" },
      { title: "Duplicate source", url: "https://example.com/article" },
    ]);

    expect(sources).toEqual([{ title: "Primary source", url: "https://example.com/article" }]);
  });
});
