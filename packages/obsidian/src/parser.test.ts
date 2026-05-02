import { expect, test, describe } from "bun:test";
import { extractWikiLinks, chunkMarkdown, chunkMarkdownWithOffsets } from "./parser";

describe("Obsidian Parser", () => {
  test("extractWikiLinks should find standard wikilinks", () => {
    const md = "Hello [[World]] and [[Postgres|Database]] and [[AI#intro]].";
    const links = extractWikiLinks(md);
    expect(links).toContain("World");
    expect(links).toContain("Postgres");
    expect(links).toContain("AI");
    expect(links.length).toBe(3);
  });

  test("extractWikiLinks should handle empty and malformed links", () => {
    const md = "[[ ]] and [[|PipeOnly]] and [[]]";
    const links = extractWikiLinks(md);
    expect(links.length).toBe(0);
  });

  test("chunkMarkdown should split text into chunks with overlap", () => {
    const text = "1234567890";
    const chunks = chunkMarkdown(text, 5, 2);
    // Chunk 1: 12345
    // Chunk 2: 45678 (start = 5-2=3, so 45678)
    // Chunk 3: 7890 (start = 8-2=6, so 7890)
    expect(chunks).toEqual(["12345", "45678", "7890"]);
  });

  test("chunkMarkdownWithOffsets should provide correct offsets", () => {
    const text = "1234567890";
    const chunks = chunkMarkdownWithOffsets(text, 5, 2);
    expect(chunks[0]).toEqual({ text: "12345", start: 0, end: 5 });
    expect(chunks[1]).toEqual({ text: "45678", start: 3, end: 8 });
    expect(chunks[2]).toEqual({ text: "7890", start: 6, end: 10 });
  });
});
