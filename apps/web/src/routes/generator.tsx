import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  Loader2,
  Save,
  Search,
  Send,
  Tag as TagIcon,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AiGeneratorEvaluate, reviewResponseToPrefill } from "../components/AiGeneratorEvaluate";
import { AiTraceInspect } from "../components/AiTraceInspect";
import { orpc } from "../lib/orpc";

export const Route = createFileRoute("/generator")({
  validateSearch: z.object({
    mode: z.enum(["rag", "general", "synthesis", "bootstrap"]).optional(),
    noteIds: z.string().optional(),
    title: z.string().optional(),
    inspect: z.string().uuid().optional(),
    view: z.enum(["inspect", "evaluate"]).optional(),
  }),
  component: GeneratorComponent,
});

function GeneratorComponent() {
  const navigate = Route.useNavigate();
  const {
    mode: queryMode,
    noteIds: queryNoteIds,
    title: queryTitle,
    inspect: inspectTraceId,
    view,
  } = Route.useSearch();
  const [activeMode, setActiveMode] = useState<"rag" | "general" | "synthesis" | "bootstrap">(
    queryMode || "rag",
  );
  const [queryText, setQueryText] = useState(queryTitle || "");
  const [result, setResult] = useState<{
    mode: "rag" | "general" | "synthesis" | "bootstrap";
    query: string;
    data: any;
  } | null>(null);

  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>(() => {
    return queryNoteIds ? queryNoteIds.split(",") : [];
  });
  const [noteSearch, setNoteSearch] = useState("");

  const { data: notes } = useQuery(orpc.listNotes.queryOptions());

  const { data: linkHealth, isLoading: linkHealthLoading } = useQuery(
    orpc.getLinkHealth.queryOptions(),
  );

  const filteredNotesList =
    notes?.filter(
      (note) =>
        note.path.toLowerCase().includes(noteSearch.toLowerCase()) ||
        note.title?.toLowerCase().includes(noteSearch.toLowerCase()),
    ) || [];

  const askMutation = useMutation(
    orpc.askPreview.mutationOptions({
      onSuccess: (data) => {
        setResult({
          mode: activeMode, // 'rag' or 'general'
          query: queryText,
          data,
        });
        setSaveStatus(null);
      },
    }),
  );

  const askSaveMutation = useMutation(
    orpc.confirmAskSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === "rejected") {
          setSaveStatus({
            type: "error",
            message: `Save rejected: ${data.error?.replace(/_/g, " ")}`,
          });
        } else {
          setSaveStatus({ type: "success", message: "Note successfully saved to vault!" });
          setResult(null);
          setQueryText("");
        }
      },
    }),
  );

  const synthesisMutation = useMutation(
    orpc.synthesisPreview.mutationOptions({
      onSuccess: (data) => {
        setResult({
          mode: "synthesis",
          query: queryText,
          data,
        });
        setSaveStatus(null);
      },
    }),
  );

  const bootstrapMutation = useMutation(
    orpc.bootstrapPreview.mutationOptions({
      onSuccess: (data) => {
        setResult({
          mode: "bootstrap",
          query: queryText,
          data,
        });
        setSaveStatus(null);
      },
    }),
  );

  const bootstrapSaveMutation = useMutation(
    orpc.confirmBootstrapSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === "rejected") {
          setSaveStatus({
            type: "error",
            message: `Save rejected: ${data.error?.replace(/_/g, " ")}`,
          });
        } else {
          setSaveStatus({
            type: "success",
            message: "Bootstrap note successfully created and saved to your vault!",
          });
          setResult(null);
          setQueryText("");
        }
      },
    }),
  );

  const synthesisSaveMutation = useMutation(
    orpc.confirmSynthesisSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === "rejected") {
          setSaveStatus({
            type: "error",
            message: `Save rejected: ${data.error?.replace(/_/g, " ")}`,
          });
        } else {
          setSaveStatus({
            type: "success",
            message: "Knowledge successfully synthesized and saved to your vault!",
          });
          setResult(null);
          setQueryText("");
        }
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) return;

    if (activeMode === "synthesis") {
      synthesisMutation.mutate({ topic: queryText, noteIds: selectedNoteIds });
    } else if (activeMode === "bootstrap") {
      bootstrapMutation.mutate({ title: queryText });
    } else {
      askMutation.mutate({ query: queryText, mode: activeMode });
    }
  };

  const handleSave = () => {
    if (!result) return;
    if (result.mode === "synthesis") {
      if (!result.data?.note) return;
      synthesisSaveMutation.mutate({
        requestId: result.data.requestId,
        note: result.data.note,
      });
    } else if (result.mode === "bootstrap") {
      if (!result.data?.note) return;
      bootstrapSaveMutation.mutate({
        requestId: result.data.requestId,
        note: result.data.note,
      });
    } else {
      if (!result.data?.note) return;
      askSaveMutation.mutate({
        requestId: result.data.requestId,
        note: result.data.note,
      });
    }
  };

  if (inspectTraceId || view === "inspect")
    return (
      <div className="p-5 max-w-5xl mx-auto">
        <AiTraceInspect traceId={inspectTraceId} onBack={() => navigate({ to: "/generator" })} />
      </div>
    );
  if (view === "evaluate")
    return (
      <div className="p-5 max-w-5xl mx-auto">
        <AiGeneratorEvaluate
          onBack={() => navigate({ to: "/generator" })}
          prefill={
            result
              ? reviewResponseToPrefill(
                  result.query,
                  result.data.sources ?? result.data.citations ?? [],
                )
              : undefined
          }
        />
      </div>
    );

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">
            AI Assistant
          </h1>
          <p className="text-[var(--sea-ink-soft)] text-base">
            Generate fresh knowledge using local notes or web search.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/generator"
            search={{ view: "inspect" }}
            className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-sea-ink hover:bg-foam"
          >
            Inspect runs
          </Link>
          <Link
            to="/generator"
            search={{ view: "evaluate" }}
            className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-sea-ink hover:bg-foam"
          >
            Evaluate
          </Link>
        </div>
      </header>

      {saveStatus && (
        <div
          className={`p-4 mb-6 border rounded-xl flex items-center gap-3 ${
            saveStatus.type === "success"
              ? "bg-green-50 border-green-100 text-green-700"
              : "bg-amber-50 border-amber-100 text-amber-700"
          }`}
        >
          {saveStatus.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{saveStatus.message}</span>
        </div>
      )}

      {!result ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto text-center rise-in">
          <h2 className="display-title text-4xl font-extrabold text-[var(--sea-ink)] mb-3 leading-tight tracking-tight">
            What would you like to generate today?
          </h2>
          <p className="text-[var(--sea-ink-soft)] text-sm mb-8 max-w-md">
            Query your local wiki, search the live web for general knowledge, or synthesize multiple
            pages.
          </p>

          <form
            onSubmit={handleSubmit}
            className="w-full relative shadow-md rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] flex items-center p-1.5 focus-within:ring-2 focus-within:ring-[var(--lagoon)] transition-all"
          >
            <div className="shrink-0 pl-3 pr-2 border-r border-[var(--line)]">
              <select
                value={activeMode}
                onChange={(e) => {
                  setActiveMode(e.target.value as any);
                  setQueryText("");
                }}
                className="bg-transparent text-xs font-bold text-[var(--sea-ink)] focus:outline-none cursor-pointer pr-2 py-2"
              >
                <option value="rag">Ask Wiki (RAG)</option>
                <option value="general">Ask AI (Web Search)</option>
                <option value="synthesis">Synthesize Topic</option>
                <option value="bootstrap">AI Bootstrapper (Unresolved Link)</option>
              </select>
            </div>

            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={
                activeMode === "rag"
                  ? "Ask a question about your wiki content..."
                  : activeMode === "general"
                    ? "Ask general knowledge or browse the web..."
                    : activeMode === "synthesis"
                      ? "Enter a topic to synthesize (e.g. 'Drizzle ORM')"
                      : "Enter concept or select unresolved link below..."
              }
              className="flex-1 bg-transparent px-4 py-3 text-base text-[var(--sea-ink)] focus:outline-none placeholder:text-[var(--sea-ink-soft)]"
            />

            <button
              type="submit"
              disabled={
                askMutation.isPending || synthesisMutation.isPending || bootstrapMutation.isPending
              }
              className="p-3 bg-sea-ink text-bg-base rounded-xl hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-all cursor-pointer shrink-0"
            >
              {askMutation.isPending ||
              synthesisMutation.isPending ||
              bootstrapMutation.isPending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </form>

          {activeMode === "synthesis" && (
            <div className="w-full mt-6 text-left p-5 bg-[var(--surface-strong)] border border-[var(--line)] rounded-2xl shadow-sm space-y-4 max-w-2xl">
              <div className="flex justify-between items-center border-b border-[var(--line)] pb-2">
                <span className="text-xs font-black text-[var(--sea-ink)] uppercase tracking-wider">
                  Select Source Notes ({selectedNoteIds.length} selected)
                </span>
                {selectedNoteIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedNoteIds([])}
                    className="text-[10px] text-red-600 hover:text-red-800 font-bold transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Filter Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-[var(--sea-ink-soft)]" size={14} />
                <input
                  type="text"
                  placeholder="Type to filter notes list..."
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  className="w-full bg-[var(--foam)] border border-[var(--line)] rounded-xl py-2 pl-9 pr-3 text-xs text-[var(--sea-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--lagoon)] shadow-inner"
                />
              </div>

              {/* Notes Checklist */}
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-[var(--line)] rounded-xl bg-[var(--surface)] p-2">
                {filteredNotesList.length === 0 ? (
                  <div className="text-[11px] text-[var(--sea-ink-soft)] italic text-center py-6">
                    No notes found matching search.
                  </div>
                ) : (
                  filteredNotesList.map((note) => {
                    const isChecked = selectedNoteIds.includes(note.id);
                    return (
                      <label
                        key={note.id}
                        className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--foam)] cursor-pointer text-xs transition-colors select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedNoteIds((prev) => {
                              if (isChecked) {
                                return prev.filter((id) => id !== note.id);
                              } else {
                                return [...prev, note.id];
                              }
                            });
                          }}
                          className="h-4 w-4 rounded border-[var(--line)] text-[var(--lagoon)] focus:ring-[var(--lagoon)] cursor-pointer"
                        />
                        <span className="font-bold truncate text-[var(--sea-ink)]">
                          {note.title || note.path.split("/").pop()?.replace(".md", "")}
                        </span>
                        <span className="text-[10px] text-[var(--sea-ink-soft)] truncate font-mono">
                          ({note.path})
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeMode === "bootstrap" && (
            <div className="w-full mt-6 text-left p-5 bg-[var(--surface-strong)] border border-[var(--line)] rounded-2xl shadow-sm space-y-4 max-w-2xl">
              <div className="border-b border-[var(--line)] pb-2 flex items-center justify-between">
                <span className="text-xs font-black text-[var(--sea-ink)] uppercase tracking-wider">
                  Unresolved Links in Vault
                </span>
                {linkHealth && linkHealth.length > 0 && (
                  <span className="text-[10px] font-bold text-[var(--sea-ink-soft)] bg-[var(--line)] px-2 py-0.5 rounded-full">
                    {linkHealth.length} missing note{linkHealth.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {linkHealthLoading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--sea-ink-soft)] py-6 justify-center">
                  <Loader2 className="animate-spin" size={14} />
                  <span>Loading unresolved links...</span>
                </div>
              ) : !linkHealth || linkHealth.length === 0 ? (
                <p className="text-xs text-green-600 dark:text-green-400 font-bold text-center py-6">
                  ✨ No unresolved links! Your vault is completely healthy.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto gap-2 grid grid-cols-1 sm:grid-cols-2 p-2 bg-[var(--surface)] border border-[var(--line)] rounded-xl">
                  {linkHealth.map((link) => (
                    <button
                      key={link.label}
                      type="button"
                      onClick={() => setQueryText(link.label)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        queryText === link.label
                          ? "bg-[var(--lagoon)] border-[var(--lagoon)] text-[var(--sea-ink)] font-bold shadow-sm"
                          : "bg-[var(--foam)] border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--line)]"
                      }`}
                    >
                      <span className="truncate mr-2 font-bold">[[{link.label}]]</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                          queryText === link.label
                            ? "bg-white/30 text-[var(--sea-ink)]"
                            : "bg-[var(--line)] text-[var(--sea-ink-soft)]"
                        }`}
                      >
                        {link.count} ref{link.count > 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 rise-in">
          {/* Consolidated query bar at the top */}
          <div className="island-shell p-3 rounded-xl flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setQueryText("");
              }}
              className="p-2 hover:bg-[var(--line)] rounded-full text-[var(--sea-ink-soft)] transition-colors cursor-pointer shrink-0"
              title="New Chat"
            >
              <ChevronRight className="rotate-180" size={18} />
            </button>

            <form
              onSubmit={handleSubmit}
              className="flex-1 flex items-center p-1 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)]"
            >
              <div className="shrink-0 pl-3 pr-2 border-r border-[var(--line)]">
                <select
                  value={activeMode}
                  onChange={(e) => {
                    setActiveMode(e.target.value as any);
                    setQueryText("");
                  }}
                  className="bg-transparent text-xs font-bold text-[var(--sea-ink)] focus:outline-none cursor-pointer pr-1 py-1"
                >
                  <option value="rag">Ask Wiki (RAG)</option>
                  <option value="general">Ask AI (Web Search)</option>
                  <option value="synthesis">Synthesize Topic</option>
                  <option value="bootstrap">AI Bootstrapper (Unresolved Link)</option>
                </select>
              </div>

              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                className="flex-1 bg-transparent px-3 py-1.5 text-sm text-[var(--sea-ink)] focus:outline-none"
              />

              <button
                type="submit"
                disabled={
                  askMutation.isPending ||
                  synthesisMutation.isPending ||
                  bootstrapMutation.isPending
                }
                className="p-2 mr-1 bg-sea-ink text-bg-base rounded-lg hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-colors cursor-pointer"
              >
                {askMutation.isPending ||
                synthesisMutation.isPending ||
                bootstrapMutation.isPending ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </form>
          </div>

          {(askMutation.isPending ||
            synthesisMutation.isPending ||
            bootstrapMutation.isPending) && (
            <div className="island-shell p-16 rounded-xl text-center flex flex-col items-center">
              <Loader2 className="animate-spin text-[var(--lagoon-deep)] mb-4" size={48} />
              <h3 className="text-xl font-bold text-[var(--sea-ink)] mb-1">Generating Response</h3>
              <p className="text-sm text-[var(--sea-ink-soft)]">
                Please wait while the AI compiles your knowledge...
              </p>
            </div>
          )}

          {!(askMutation.isPending || synthesisMutation.isPending || bootstrapMutation.isPending) &&
            result.data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rise-in">
                {/* Left Column: AI Answer (or Proposed Note for Synthesis/Bootstrap) */}
                <section className="island-shell rounded-xl p-5 flex flex-col min-h-[28rem]">
                  <h2 className="island-kicker mb-3 flex items-center gap-2">
                    <CheckCircle2 size={12} />{" "}
                    {result.mode === "synthesis"
                      ? "Synthesized Wiki Note"
                      : result.mode === "bootstrap"
                        ? "Bootstrapped Wiki Note"
                        : "AI Response"}
                  </h2>
                  <div className="flex-1 overflow-y-auto pr-1">
                    <div className="prose prose-slate max-w-none text-sm text-[var(--sea-ink)] leading-relaxed whitespace-pre-wrap font-sans select-text">
                      {result.mode === "synthesis" || result.mode === "bootstrap"
                        ? result.data.note?.content
                        : result.data.answer}
                    </div>
                  </div>
                </section>

                {/* Right Column: Details, Draft Note & Ingestion Actions */}
                <section className="flex flex-col gap-5">
                  <div className="island-shell rounded-xl p-5 flex-1 border border-[var(--lagoon)] bg-surface-strong relative flex flex-col min-h-[24rem]">
                    <div className="absolute top-0 right-0 p-2.5 bg-[var(--lagoon)] text-white text-[9px] font-bold uppercase tracking-widest rounded-tr-xl rounded-bl-lg shrink-0">
                      Proposed Wiki Draft
                    </div>

                    <h2 className="island-kicker mb-4 flex items-center gap-2 shrink-0">
                      <FileText size={12} /> Note Structure
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">
                          Title
                        </span>
                        <div className="text-xl font-bold text-[var(--sea-ink)]">
                          {result.data.note?.title}
                        </div>
                      </div>

                      {result.mode !== "synthesis" && result.mode !== "bootstrap" && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">
                            Content Summary
                          </span>
                          <div className="text-xs text-[var(--sea-ink-soft)] bg-surface p-3 rounded-lg border border-[var(--line)] font-mono whitespace-pre-wrap overflow-y-auto max-h-[12rem] select-text">
                            {result.data.note?.content}
                          </div>
                        </div>
                      )}

                      {result.mode === "synthesis" && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">
                            Retrieval metrics
                          </span>
                          <div className="text-xs text-[var(--sea-ink-soft)] font-semibold">
                            Chunks Analyzed: {result.data.retrieval?.chunkCount ?? 0} • Links
                            Checked: {result.data.retrieval?.linkCount ?? 0}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        {result.data.note?.links?.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--lagoon-deep)] font-medium">
                            <LinkIcon size={10} /> {result.data.note.links.length} Links
                          </div>
                        )}
                        {result.data.note?.tags?.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--palm)] font-medium">
                            <TagIcon size={10} /> {result.data.note.tags.length} Tags
                          </div>
                        )}
                      </div>

                      {result.data.sources?.length > 0 && (
                        <div className="border-t border-[var(--line)] pt-3.5 mt-2 shrink-0">
                          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1.5">
                            Referred Sources
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {result.data.sources.map((src: any) => (
                              <Link
                                key={src.id}
                                to="/vault"
                                search={{ path: src.path }}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--line)] hover:text-[var(--lagoon-deep)] transition-all font-medium"
                              >
                                <FileText size={10} /> {src.title || src.path.split("/").pop()}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.mode === "rag" && result.data.citations?.length > 0 && (
                        <div className="border-t border-[var(--line)] pt-3.5 mt-2 shrink-0">
                          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1.5">
                            Answer citations
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {result.data.citations.map((citation: any) => (
                              <Link
                                key={citation.id}
                                to="/vault"
                                search={{ path: citation.path }}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--line)] hover:text-[var(--lagoon-deep)] transition-all font-medium"
                              >
                                <FileText size={10} /> [{citation.id}] {citation.title}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          to="/generator"
                          search={{ view: "evaluate" }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-lagoon-deep hover:underline"
                        >
                          Review this response <ChevronRight size={14} />
                        </Link>
                        {result.data.traceId && (
                          <Link
                            to="/generator"
                            search={{ inspect: result.data.traceId }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-lagoon-deep hover:underline"
                          >
                            Inspect this run <ChevronRight size={14} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={
                      askSaveMutation.isPending ||
                      synthesisSaveMutation.isPending ||
                      bootstrapSaveMutation.isPending
                    }
                    className="w-full flex items-center justify-center gap-2 py-3 bg-lagoon text-lagoon-text rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-lagoon-text shadow-sm transition-all disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {askSaveMutation.isPending ||
                    synthesisSaveMutation.isPending ||
                    bootstrapSaveMutation.isPending ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <Save size={16} />
                        {result.mode === "synthesis"
                          ? "Save Synthesized Note"
                          : result.mode === "bootstrap"
                            ? "Save Bootstrapped Note"
                            : "Save to Wiki"}
                      </>
                    )}
                  </button>
                </section>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
