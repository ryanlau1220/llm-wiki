import { promises as fs } from "node:fs";
import path from "node:path";
import { createDbClient, actionAuditEvents } from "@llm-wiki/db";

export type PlaceholderConfig = {
  vaultPath: string;
  db: ReturnType<typeof createDbClient>["db"];
};

export async function createPlaceholder(
  config: PlaceholderConfig,
  label: string,
  requestId: string
): Promise<string> {
  const vaultRoot = path.resolve(config.vaultPath, "..", "ai-generated");
  await fs.mkdir(vaultRoot, { recursive: true });

  const safeSlug = slugify(label);
  const filePath = path.join(vaultRoot, `${safeSlug}.md`);

  // Check if already exists to avoid overwriting
  try {
    await fs.access(filePath);
    return filePath; // Already exists
  } catch {
    // Continue to create
  }

  const content = `---
type: ai_generated
source: placeholder
created_at: ${new Date().toISOString()}
---

# ${label}

This is a placeholder note for [[${label}]].
`.trim();

  await fs.writeFile(filePath, content, "utf8");

  await config.db.insert(actionAuditEvents).values({
    request_id: requestId,
    action: "create_placeholder",
    validation_result: "accepted",
    actor: "system",
    metadata: { path: filePath, label },
    created_at: new Date()
  });

  return filePath;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "placeholder";
}
