import { expect, test, describe } from "bun:test";
import { normalizeMarkdownContent, hashContent, inferTitleFromPath, byteLength } from "./utils";

describe("Ingestion Utils", () => {
  test("normalizeMarkdownContent should fix line endings and trailing spaces", () => {
    const input = "Line 1  \r\nLine 2 \nLine 3";
    const expected = "Line 1\nLine 2\nLine 3";
    expect(normalizeMarkdownContent(input)).toBe(expected);
  });

  test("hashContent should return consistent sha256 hex", () => {
    const content = "hello world";
    const hash = hashContent(content);
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  test("inferTitleFromPath should remove extension and return basename", () => {
    expect(inferTitleFromPath("human/notes/My Note.md")).toBe("My Note");
    expect(inferTitleFromPath("root.MD")).toBe("root");
  });

  test("byteLength should return correct UTF-8 byte count", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("🚀")).toBe(4);
  });
});
