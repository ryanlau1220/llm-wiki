export const INVALID_MODEL_RESPONSE_ERROR = "The model returned an invalid structured response. Please try again.";
export const INVALID_MODEL_RESPONSE_CODE = "invalid_model_response";

type RuntimeSchema<Output> = {
  safeParse(value: unknown):
    | { success: true; data: Output }
    | { success: false };
};

export type StructuredModelResponseResult<Output> =
  | { success: true; data: Output }
  | { success: false; reason: "invalid_json" | "invalid_schema" };

/**
 * Parses a complete JSON model response and validates it before it is allowed
 * to affect a preview. Deliberately does not attempt substring extraction:
 * accepting prose-wrapped JSON makes malformed responses ambiguous.
 */
export function parseStructuredModelResponse<Output>(
  text: string,
  schema: RuntimeSchema<Output>,
): StructuredModelResponseResult<Output> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { success: false, reason: "invalid_json" };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return { success: false, reason: "invalid_schema" };
  }

  return { success: true, data: validated.data };
}

export function createInvalidModelResponse(): {
  error: typeof INVALID_MODEL_RESPONSE_ERROR;
  code: typeof INVALID_MODEL_RESPONSE_CODE;
} {
  return {
    error: INVALID_MODEL_RESPONSE_ERROR,
    code: INVALID_MODEL_RESPONSE_CODE,
  };
}
