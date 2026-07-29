import { describe, expect, test } from "bun:test";

import { createResearchAutomationSchema } from "./schemas";

describe("Research Radar schedule contract", () => {
  test("does not accept a feed-polling interval below twenty minutes", () => {
    const input = {
      name: "Local events",
      topic: "developer events in Kuala Lumpur",
      sourceIds: ["00000000-0000-4000-8000-000000000000"],
      scheduleMinutes: 15,
    };

    expect(createResearchAutomationSchema.safeParse(input).success).toBe(false);
    expect(
      createResearchAutomationSchema.safeParse({ ...input, scheduleMinutes: 20 }).success,
    ).toBe(true);
  });
});
