/**
 * Promptfoo is intentionally isolated here: it is a Node-oriented evaluation
 * engine, while the rest of the product remains a Bun workspace. The API
 * layer will call this adapter rather than depending on Promptfoo directly.
 */
export const PROMPTFOO_EVALUATION_ENGINE = "promptfoo";
