import { describe, expect, test } from "bun:test";

import {
  isRadarCaptureCandidate,
  isResearchAutomationRunStale,
  mapWithConcurrency,
  RADAR_STALE_RUN_TIMEOUT_MS,
  scoreFeedItem,
} from "./research-radar";

describe("Research Radar relevance fallback", () => {
  test("prioritizes a matching item over unrelated material without a model runtime", () => {
    const topic = "local AI developer events in Singapore";
    const matching = scoreFeedItem(topic, {
      externalId: "match",
      canonicalUrl: "https://example.com/meetup",
      title: "Singapore AI developer meetup",
      content: "A local event for AI builders.",
      publishedAt: null,
      author: null,
      categories: ["events"],
    });
    const unrelated = scoreFeedItem(topic, {
      externalId: "other",
      canonicalUrl: "https://example.com/garden",
      title: "Garden design",
      content: "How to grow herbs.",
      publishedAt: null,
      author: null,
      categories: [],
    });

    expect(matching).toBeGreaterThan(unrelated);
    expect(matching).toBeGreaterThan(0.2);
  });

  test("does not promote unrelated material through the deterministic fallback", () => {
    const score = scoreFeedItem("Kubernetes security updates", {
      externalId: "unrelated",
      canonicalUrl: "https://example.com/music",
      title: "New music festival",
      content: "Artists announced their summer line-up.",
      publishedAt: null,
      author: null,
      categories: ["culture"],
    });

    expect(score).toBe(0);
  });

  test("keeps weak generic term overlap out of the review inbox", () => {
    expect(isRadarCaptureCandidate(0.34)).toBe(false);
    expect(isRadarCaptureCandidate(0.35)).toBe(true);
  });

  test("bounds concurrent source work while preserving source order", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value % 2 ? 6 : 1));
      active -= 1;
      return value * 10;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  test("marks a persisted run stale only after the bounded local deadline", () => {
    const startedAt = new Date("2026-07-31T00:00:00.000Z");
    expect(isResearchAutomationRunStale(startedAt, new Date(startedAt.getTime() + RADAR_STALE_RUN_TIMEOUT_MS - 1))).toBe(false);
    expect(isResearchAutomationRunStale(startedAt, new Date(startedAt.getTime() + RADAR_STALE_RUN_TIMEOUT_MS))).toBe(true);
  });
});
