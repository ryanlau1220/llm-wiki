import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type MigrationJournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

type MigrationJournal = {
  entries: MigrationJournalEntry[];
};

/**
 * Drizzle uses the journal timestamp to determine whether a migration is new.
 * A later file with an earlier timestamp is silently skipped, so reject that
 * state before either checks or migration execution can proceed.
 */
export function validateMigrationJournal(journal: MigrationJournal, sqlFiles: string[]) {
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("Drizzle migration journal must contain at least one entry");
  }

  const sqlTags = new Set(sqlFiles.filter((file) => file.endsWith(".sql")).map((file) => file.slice(0, -4)));
  const seenTags = new Set<string>();
  let previousTimestamp = -1;

  for (const [position, entry] of journal.entries.entries()) {
    if (!Number.isInteger(entry.idx) || entry.idx !== position) {
      throw new Error(`Drizzle migration journal index must be sequential at entry ${position}`);
    }
    if (!entry.tag || !sqlTags.has(entry.tag)) {
      throw new Error(`Drizzle migration journal entry ${entry.idx} has no matching SQL file: ${entry.tag}`);
    }
    if (seenTags.has(entry.tag)) {
      throw new Error(`Drizzle migration journal contains a duplicate tag: ${entry.tag}`);
    }
    if (!Number.isSafeInteger(entry.when) || entry.when <= previousTimestamp) {
      throw new Error(`Drizzle migration journal timestamps must be strictly increasing: ${entry.tag}`);
    }
    seenTags.add(entry.tag);
    previousTimestamp = entry.when;
  }

  const untrackedSqlFiles = [...sqlTags].filter((tag) => !seenTags.has(tag));
  if (untrackedSqlFiles.length) {
    throw new Error(`Drizzle migration SQL files are missing from the journal: ${untrackedSqlFiles.join(", ")}`);
  }
}

export async function verifyMigrationJournal(journalPath = fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url))) {
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as MigrationJournal;
  const sqlDirectory = resolve(dirname(journalPath), "..");
  validateMigrationJournal(journal, await readdir(sqlDirectory));
}

async function main() {
  await verifyMigrationJournal();
  console.log("Drizzle migration journal is valid.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
