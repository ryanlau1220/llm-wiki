import { describe, expect, test } from "bun:test";
import { getWeakNotes } from "./weak-notes";

describe("Maintenance", () => {
  test("getWeakNotes should return empty for empty DB", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => []
            })
          })
        })
      })
    };

    const results = await getWeakNotes(mockDb as any, { maxResults: 10 });
    expect(results).toEqual([]);
  });
});

