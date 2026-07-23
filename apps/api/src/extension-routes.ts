import { Elysia } from "elysia";

import { extensionResearchCaptureSchema } from "@llm-wiki/types";
import type { AppConfig } from "./config";
import { createResearchCapture, pairExtension } from "./research-captures";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() || null : null;
}

/**
 * Deliberately small REST boundary for the extension. It does not share the
 * dashboard's cookie/JWT session and accepts only a paired device token.
 */
export function researchCaptureExtensionRoutes(config: AppConfig) {
  return new Elysia({ name: "research-capture-extension" })
    .post("/extension/pair", async ({ request }) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return response(400, { error: "Request body must be valid JSON" });
      }
      const parsed = parsePairingRequest(body);
      if (!parsed) return response(400, { error: "Invalid pairing request" });

      try {
        return await pairExtension(config, parsed.pairingCode, parsed.name);
      } catch (error) {
        return response(401, { error: error instanceof Error ? error.message : "Unable to pair extension" });
      }
    })
    .post("/extension/captures", async ({ request }) => {
      const token = bearerToken(request);
      if (!token) return response(401, { error: "A paired extension token is required" });

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return response(400, { error: "Request body must be valid JSON" });
      }
      const parsed = extensionResearchCaptureSchema.safeParse(body);
      if (!parsed.success) return response(400, { error: "Invalid research capture", details: parsed.error.flatten() });

      try {
        const capture = await createResearchCapture(config, token, parsed.data);
        return response(201, capture);
      } catch (error) {
        return response(401, { error: error instanceof Error ? error.message : "Unable to save research capture" });
      }
    });
}

function parsePairingRequest(body: unknown): { pairingCode: string; name: string } | null {
  if (!body || typeof body !== "object") return null;
  const { pairingCode, name } = body as Record<string, unknown>;
  if (typeof pairingCode !== "string") return null;
  const normalizedCode = pairingCode.trim();
  if (normalizedCode.length < 9 || normalizedCode.length > 64) return null;
  if (name !== undefined && typeof name !== "string") return null;
  const normalizedName = (name ?? "Desktop browser").trim();
  return normalizedName && normalizedName.length <= 120
    ? { pairingCode: normalizedCode, name: normalizedName }
    : null;
}
