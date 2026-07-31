import { expect, test } from "bun:test";

import { validateMigrationJournal, verifyMigrationJournal } from "./verify-migrations";

test("migration journal accepts the tracked migration sequence", async () => {
  await expect(verifyMigrationJournal()).resolves.toBeUndefined();
});

test("migration journal rejects a later entry with an earlier timestamp", () => {
  expect(() =>
    validateMigrationJournal(
      {
        entries: [
          { idx: 0, tag: "0000_initial", when: 100 },
          { idx: 1, tag: "0001_later", when: 99 },
        ],
      },
      ["0000_initial.sql", "0001_later.sql"],
    ),
  ).toThrow("timestamps must be strictly increasing");
});
