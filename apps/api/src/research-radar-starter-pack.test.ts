import { describe, expect, test } from "bun:test";

import { RESEARCH_RADAR_STARTER_SOURCES } from "./research-radar-starter-pack";

describe("Research Radar starter sources", () => {
  test("keeps a small, valid, de-duplicated feed bundle", () => {
    expect(RESEARCH_RADAR_STARTER_SOURCES).toHaveLength(8);
    expect(new Set(RESEARCH_RADAR_STARTER_SOURCES.map((source) => source.feedUrl)).size).toBe(RESEARCH_RADAR_STARTER_SOURCES.length);
    for (const source of RESEARCH_RADAR_STARTER_SOURCES) {
      expect(new URL(source.feedUrl).protocol).toBe("https:");
    }
  });
});
