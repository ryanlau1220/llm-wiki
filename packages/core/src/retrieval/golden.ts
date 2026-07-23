import type { RetrievalEvaluationCase } from "./evaluation";

/**
 * Curated from the configured local Obsidian vault. Targets are paths only;
 * no vault content is copied into the repository.
 */
export const LOCAL_VAULT_GOLDEN_CASES: RetrievalEvaluationCase[] = [
  {
    id: "llm-wiki-definition",
    query: "What is an LLM Wiki?",
    relevant: [{ documentPath: "llm-wiki.md" }],
  },
  {
    id: "llm-applications",
    query: "What are the applications of a large language model?",
    relevant: [{ documentPath: "Large Language Model.md" }],
  },
  {
    id: "machine-learning-definition",
    query: "How is machine learning related to artificial intelligence?",
    relevant: [{ documentPath: "machine-learning.md" }],
  },
  {
    id: "ai-llm-wiki-relationship",
    query: "How do artificial intelligence and LLM Wiki relate?",
    relevant: [{ documentPath: "artificial-intelligence-and-llm-wiki.md" }],
  },
];
