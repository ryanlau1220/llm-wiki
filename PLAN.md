Never edit this file directly. This is a generated file that defines the overall system design and architecture for the LLM Wiki project. All changes should be made in the source files, not here.

---

# 🧠 LLM WIKI — FULL SYSTEM PLAN

## 🎯 Vision

> A local-first AI system that connects to an Obsidian vault and turns it into a **self-growing, self-refactoring knowledge wiki**

It does 3 things:

1. **Understands your notes**
2. **Refactors messy knowledge into structured pages**
3. **Builds new knowledge from your questions**

---

# 🧱 1. CORE DESIGN PRINCIPLES

## 🔒 1.1 Safety-first execution

* LLM NEVER executes code directly
* LLM only outputs structured JSON “intent”
* Backend validates everything before execution

---

## 🧠 1.2 Human-controlled autonomy

* AI suggests
* Human approves write-back
* No silent modifications

---

## 📁 1.3 Obsidian as source of truth

Obsidian

* Human notes live in `/human`
* AI notes live in `/ai-generated`
* AI NEVER modifies human notes

---

## 🔁 1.4 Two-loop system

### Loop A — Retrieval

Answer questions using knowledge

### Loop B — Knowledge Growth

Generate new or refactored notes

---

# 🏗️ 2. TECH STACK (LOCKED)

## Runtime

* Bun

## Backend

* Elysia

## API Layer

* oRPC

## Frontend

* TanStack Start

## ORM

* Drizzle

## Storage

* PostgreSQL + pgvector

## Infra

* Docker Compose (fully local-first)

---

# 🧱 3. REPO STRUCTURE (TURBOREPO)

Turborepo

```text
llm-wiki/
│
├── apps/
│   ├── web/          # TanStack Start UI
│   └── api/          # Elysia backend (Bun)
│
├── packages/
│   ├── core/         # RAG + logic engine
│   ├── ai/           # LLM + embeddings
│   ├── db/           # Drizzle schema
│   ├── obsidian/     # vault watcher + parser
│   ├── types/        # shared oRPC contracts
│
├── infra/
│   └── docker/
│
└── vault/
    ├── human/        # user notes
    └── ai-generated/ # AI output only
```

---

# 📁 4. OBSIDIAN VAULT RULES

## Structure

```text
vault/
  human/
  ai-generated/
```

---

## Rules

* AI ONLY writes to `ai-generated/`
* AI NEVER modifies `human/`
* file watcher ignores `ai-generated/`

---

# ⚙️ 5. CORE SYSTEM COMPONENTS

---

## 5.1 File Watcher System

### Purpose:

Detect changes in Obsidian vault

### Behavior:

* watches `/human`
* triggers on file change
* applies debounce (5–10s)
* ignores unchanged hash

### Pipeline:

```text
file change
→ debounce queue
→ hash check
→ ingestion pipeline
```

---

## 5.2 Ingestion Engine

### Responsibilities:

* parse markdown
* extract links `[[note]]`
* extract metadata (YAML)
* chunk content

---

## 5.3 Embedding Engine

* uses Gemini embeddings (initially)
* stores vectors in pgvector

---

## 5.4 Retrieval Engine (Hybrid RAG)

Combines:

1. Vector search (semantic)
2. Full-text search (exact match)
3. Link-based expansion (graph awareness)

---

## 5.5 LLM Engine

* Gemini API (initial provider)
* abstracted behind interface

### Output MUST be:

```json
{
  "answer": "...",
  "suggested_note": {
    "title": "...",
    "content": "...",
    "links": []
  }
}
```

---

## 5.6 Write-back Engine

### Rule:

* ALWAYS create new file
* NEVER overwrite existing notes

### Output:

```text
vault/ai-generated/<slug>.md
```

---

# 🧠 6. CORE FEATURES

---

## 🟢 6.1 ASK & SAVE (MVP CORE)

### Flow:

1. User asks question
2. System retrieves context
3. LLM generates answer + optional note
4. User previews
5. User confirms
6. Save as new note

---

## 🟡 6.2 NOTE REFACTOR ENGINE (KEY FEATURE)

### Input:

* messy note

### Output:

* structured improved version

### Example structure:

```md
---
type: ai_refactored
source: original.md
---

# Title

## Summary
## Key Concepts
## Structure
## Related Notes
```

---

## 🟡 6.3 LINK INTELLIGENCE SYSTEM

* detect `[[links]]`
* validate existence
* suggest missing notes
* optionally create placeholders

---

## 🔴 6.4 MULTI-NOTE SYNTHESIS

* combine multiple notes
* generate wiki-style page

---

## 🔴 6.5 KNOWLEDGE MAINTENANCE

* detect duplicates
* detect weak notes
* suggest improvements

---

# 🧾 7. METADATA SYSTEM (YAML FRONTMATTER)

Every AI-generated note includes:

```yaml
type: ai_generated | ai_refactored
source: ask | refactor | synthesis
created_at: timestamp
tags: [...]
```

---

# 🧠 8. UX DESIGN (TOOL-BASED)

NOT chat-first.

Instead:

## Tools Panel:

* Ask Knowledge
* Refactor Note
* Generate Wiki Page
* Find Links

---

## Interaction style:

* user selects action
* system executes
* preview required before save

---

# 🔄 9. SYSTEM WORKFLOWS

---

## 9.1 Ask & Save

```text
query → retrieve → LLM → preview → save
```

---

## 9.2 File Watcher Sync

```text
file change → debounce → parse → embed → DB
```

---

## 9.3 Refactor

```text
note → LLM restructure → preview → save new note
```

---

## 9.4 Link Validation

```text
detect link → check DB → suggest or create stub
```

---

# 🗄️ 10. DATABASE DESIGN

---

## documents

* id
* path
* type
* content

---

## chunks

* document_id
* text
* embedding (vector)

---

## links

* source_note
* target_note

---

## metadata

* ai_generated flag
* source tracking

---

# 🔒 11. SAFETY MODEL

---

## Rules:

### ❌ Never allowed:

* raw SQL from LLM
* raw filesystem commands
* code execution

---

### ✅ Allowed:

* structured JSON actions only
* validated by backend

---

## Action schema:

```text
create_note
refactor_note
suggest_links
search
```

---

# 🧭 12. DEVELOPMENT PHASES

---

## 🟢 Phase 1 — Foundation

* vault watcher
* ingestion pipeline
* embeddings
* basic RAG

---

## 🟡 Phase 2 — Ask & Save

* tool-based UX
* structured output
* write-back system

---

## 🟡 Phase 3 — Refactor Engine

* AI note restructuring
* YAML metadata

---

## 🔴 Phase 4 — Linking Intelligence

* graph relationships
* link validation

---

## 🔴 Phase 5 — Knowledge Synthesis

* multi-note wiki generation

---

## 🔴 Phase 6 — Maintenance System

* duplicate detection
* knowledge quality scoring

---

# 🚀 FINAL SYSTEM DEFINITION

> **LLM Wiki is a local-first AI system that transforms an Obsidian vault into a structured, evolving knowledge graph through controlled AI refactoring, retrieval, and write-back generation.**

---

# 🧠 WHAT MAKES THIS PROJECT STRONG

You now have:

* real-world problem (knowledge fragmentation)
* AI integration (RAG + refactoring)
* system design (pipelines + watchers)
* safety design (structured outputs)
* product thinking (tool-based UX)
* scalable architecture (monorepo + separation of concerns)

---
