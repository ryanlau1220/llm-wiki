/**
 * Convert Obsidian-style image/file embeds `![[target]]` (and
 * `![[target|alias]]`) into standard Markdown image syntax
 * `![alt](target)` so a markdown renderer displays them.
 */
export function transformImageEmbeds(body: string): string {
  if (!body.includes("![[")) return body;

  const parts = body.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, idx) =>
      idx % 2 === 1 ? part : transformImageEmbedsOutsideCode(part)
    )
    .join("");
}

const IMAGE_EMBED_RE = /!\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;

function transformImageEmbedsOutsideCode(text: string): string {
  if (!text.includes("![[")) return text;
  const parts = text.split(/(`[^`\n]+`)/g);
  return parts
    .map((part, idx) => (idx % 2 === 1 ? part : replaceImageEmbeds(part)))
    .join("");
}

function replaceImageEmbeds(text: string): string {
  return text.replace(
    IMAGE_EMBED_RE,
    (_match, rawTarget: string, rawAlias?: string) => {
      const target = rawTarget.trim();
      const alias = rawAlias?.trim() ?? "";
      const alt = alias.replace(/]/g, ")");
      return `![${alt}](${target})`;
    }
  );
}

/**
 * Convert Obsidian-style `[[target]]` and `[[target|alias]]` wiki
 * links inside a markdown body to standard markdown links.
 * Output format: `[label](#target)`
 */
export function transformWikilinks(body: string): string {
  if (!body.includes("[[")) return body;

  const parts = body.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, idx) => (idx % 2 === 1 ? part : transformOutsideCode(part)))
    .join("");
}

const WIKILINK_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;

function transformOutsideCode(text: string): string {
  if (!text.includes("[[")) return text;

  const parts = text.split(/(`[^`\n]+`)/g);
  return parts
    .map((part, idx) => (idx % 2 === 1 ? part : replaceWikilinks(part)))
    .join("");
}

function replaceWikilinks(text: string): string {
  return text.replace(WIKILINK_RE, (_match, rawTarget: string, rawAlias?: string) => {
    const target = rawTarget.trim();
    const alias = rawAlias?.trim() ?? "";
    const label = alias.length > 0 ? alias : target;
    const href = `#${encodeURIComponent(target)}`;
    const escapedLabel = label.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    return `[${escapedLabel}](${href})`;
  });
}
