import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { computeAlignedDiff } from "../lib/diff";
import {
  formatCandidateNoteReference,
  formatCandidateReferenceCount,
  formatOrganizationPercentage,
  formatOrganizationSuggestionKind,
  organizationSuggestionTone,
} from "../lib/organization-suggestion-presentation";
import { orpc } from "../lib/orpc";

export const Route = createFileRoute("/refactor")({
  validateSearch: z.object({
    path: z.string().optional(),
  }),
  component: RefactorComponent,
});

const ORGANIZATION_SUGGESTION_LIMIT = 50;

type OrganizationSuggestion = {
  id: string;
  type: string;
  notePath: string;
  priority: number;
  confidence: number;
  reason: string;
  actionLabel: string;
  candidateNoteIds: string[];
  requiresApproval: true;
  reversible: true;
};

type CandidateNoteReference = {
  path: string;
  title?: string | null;
};

function RefactorComponent() {
  const navigate = useNavigate();
  const { path } = Route.useSearch();
  const [selectedPath, setSelectedPath] = useState<string | null>(path || null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [worklistFilter, setWorklistFilter] = useState<"all" | "review" | "notes">("all");
  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [checkedSuggestions, setCheckedSuggestions] = useState<Record<string, boolean>>({});
  const [diffViewMode, setDiffViewMode] = useState<"split" | "raw">("split");

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollRef = useRef<"left" | "right" | null>(null);

  const syncScroll = (source: "left" | "right") => {
    if (activeScrollRef.current !== source) return;
    const sourceEl = source === "left" ? leftScrollRef.current : rightScrollRef.current;
    const targetEl = source === "left" ? rightScrollRef.current : leftScrollRef.current;
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop;
    }
  };

  useEffect(() => {
    if (previewData) {
      setCheckedSuggestions({});
    }
  }, [previewData]);

  const { data: notes, isLoading: isLoadingNotes } = useQuery(orpc.listNotes.queryOptions());

  const { data: weakNotes, isLoading: isLoadingWeakNotes } = useQuery(
    orpc.getWeakNotes.queryOptions({ input: { minQualityScore: 0.55, maxResults: 50 } }),
  );

  const auditSuggestionsQuery = useQuery(
    orpc.listOrganizationSuggestions.queryOptions({
      input: { maxResults: ORGANIZATION_SUGGESTION_LIMIT },
    }),
  );

  const previewMutation = useMutation(
    orpc.refactorPreview.mutationOptions({
      onSuccess: (data) => {
        setPreviewData(data);
        setSaveStatus(null);
      },
    }),
  );

  const { mutate: previewMutate } = previewMutation;

  // Run refactor analysis immediately on mount if path is provided in query params
  useEffect(() => {
    if (path) {
      setSelectedPath(path);
      previewMutate({ path });
    }
  }, [path, previewMutate]);

  const confirmMutation = useMutation(
    orpc.confirmRefactorSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === "rejected") {
          setSaveStatus({
            type: "error",
            message: `Refactor save rejected: ${data.error?.replace(/_/g, " ")}`,
          });
        } else {
          setSaveStatus({ type: "success", message: "Note successfully refactored and saved!" });
          setPreviewData(null);
          setSelectedPath(null);
          navigate({ to: "/refactor", search: { path: undefined } });
        }
      },
    }),
  );

  const handleRefactor = (targetPath: string) => {
    setSelectedPath(targetPath);
    navigate({ to: "/refactor", search: { path: targetPath } });
  };

  const filteredNotes =
    notes?.filter(
      (note) =>
        note.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.title?.toLowerCase().includes(searchTerm.toLowerCase()),
    ) || [];

  const candidateNotesById = new Map<string, CandidateNoteReference>(
    notes?.map((note) => [note.id, { path: note.path, title: note.title }]) ?? [],
  );
  const matchingSuggestions = (auditSuggestionsQuery.data ?? []).filter((suggestion) => {
    const query = searchTerm.trim().toLowerCase();
    return (
      !query ||
      [suggestion.notePath, suggestion.reason, suggestion.actionLabel, suggestion.type].some(
        (value) => value.toLowerCase().includes(query),
      )
    );
  });

  const alignedDiff = (() => {
    if (!previewData) return [];
    const diff = computeAlignedDiff(previewData.originalContent, previewData.note.content);
    let origCounter = 0;
    let refCounter = 0;
    return diff.map((line) => {
      const originalLineNum = line.original.type !== "empty" ? ++origCounter : null;
      const refactoredLineNum = line.refactored.type !== "empty" ? ++refCounter : null;
      return {
        ...line,
        originalLineNum,
        refactoredLineNum,
      };
    });
  })();

  return (
    <div className="p-5 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">
          Note Refactor
        </h1>
        <p className="text-[var(--sea-ink-soft)] text-base">
          Clean up and structure messy notes using AI.
        </p>
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

      {!selectedPath ? (
        <div className="rise-in">
          <section className="island-shell overflow-hidden rounded-xl">
            <div className="border-b border-[var(--line)] p-5">
              <div className="relative">
                <Search className="absolute left-4 top-3 text-[var(--sea-ink-soft)]" size={18} />
                <input
                  type="text"
                  placeholder="Search notes to refactor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--foam)] border border-[var(--line)] rounded-lg py-2.5 pl-11 pr-4 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-inner"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All work"],
                    ["review", "Needs review"],
                    ["notes", "Notes"],
                  ] as const
                ).map(([filter, label]) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setWorklistFilter(filter)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${worklistFilter === filter ? "border-lagoon bg-lagoon text-lagoon-text" : "border-line text-sea-ink hover:bg-foam"}`}
                  >
                    {label}
                  </button>
                ))}
                {worklistFilter !== "notes" && (
                  <button
                    type="button"
                    onClick={() => auditSuggestionsQuery.refetch()}
                    disabled={auditSuggestionsQuery.isFetching}
                    className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-lagoon-deep hover:underline disabled:opacity-50"
                  >
                    <RefreshCw
                      className={auditSuggestionsQuery.isFetching ? "animate-spin" : ""}
                      size={14}
                    />{" "}
                    Refresh
                  </button>
                )}
              </div>
            </div>

            {worklistFilter !== "notes" && (
              <AuditSuggestionList
                isError={auditSuggestionsQuery.isError}
                isLoading={auditSuggestionsQuery.isLoading}
                candidateNotesById={candidateNotesById}
                onOpenRefactor={handleRefactor}
                suggestions={matchingSuggestions}
              />
            )}

            {worklistFilter !== "review" &&
              (isLoadingNotes || isLoadingWeakNotes ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-[var(--lagoon-deep)]" size={28} />
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto p-2 space-y-2">
                  {(() => {
                    const weakNoteMap = new Map(weakNotes?.map((w) => [w.path, w.reasons]) || []);
                    const sortedNotes = filteredNotes
                      ? [...filteredNotes].sort((a, b) => {
                          const aWeak = weakNoteMap.has(a.path);
                          const bWeak = weakNoteMap.has(b.path);
                          if (aWeak && !bWeak) return -1;
                          if (!aWeak && bWeak) return 1;
                          return 0;
                        })
                      : [];

                    if (sortedNotes.length === 0) {
                      return (
                        <div className="text-center py-12 text-sm text-[var(--sea-ink-soft)] italic">
                          No notes found.
                        </div>
                      );
                    }

                    return sortedNotes.map((note) => {
                      const reasons = weakNoteMap.get(note.path);
                      const isWeak = !!reasons;

                      return (
                        <button
                          type="button"
                          key={note.id}
                          onClick={() => handleRefactor(note.path)}
                          className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-[var(--foam)] border border-transparent hover:border-[var(--line)] transition-all group text-left cursor-pointer"
                        >
                          <div className="flex items-start gap-3.5 min-w-0 flex-1">
                            <div className="p-2 bg-surface rounded-lg shadow-sm shrink-0 border border-line mt-0.5">
                              <FileText size={16} className="text-[var(--sea-ink-soft)]" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2.5">
                                <h4 className="font-bold text-sm text-[var(--sea-ink)] truncate">
                                  {note.title || note.path.split("/").pop()?.replace(".md", "")}
                                </h4>
                                {note.qualityScore !== null && note.qualityScore !== undefined && (
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                      isWeak
                                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-450 dark:border-amber-900/30"
                                        : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-450 dark:border-green-900/30"
                                    }`}
                                  >
                                    Score: {note.qualityScore.toFixed(2)}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-[var(--sea-ink-soft)] font-mono truncate mt-0.5 mb-1">
                                {note.path}
                              </div>

                              {isWeak && reasons && reasons.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {reasons.map((r: string) => (
                                    <span
                                      key={r}
                                      className="text-[9px] uppercase tracking-wider font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-900/30"
                                    >
                                      {r.replace(/_/g, " ")}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <ChevronRight
                            size={18}
                            className="text-[var(--line)] group-hover:text-[var(--lagoon-deep)] transition-colors shrink-0 ml-4"
                          />
                        </button>
                      );
                    });
                  })()}
                </div>
              ))}
          </section>
        </div>
      ) : (
        <section className="rise-in">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPath(null);
                  setPreviewData(null);
                  navigate({ to: "/refactor", search: { path: undefined } });
                }}
                className="p-1.5 hover:bg-[var(--line)] rounded-full text-[var(--sea-ink-soft)] transition-colors cursor-pointer"
              >
                <ChevronRight size={20} className="rotate-180" />
              </button>
              <h2 className="text-xl font-bold text-[var(--sea-ink)] flex items-center gap-2 flex-wrap">
                <span>Refactoring: {selectedPath.split("/").pop()}</span>
                {previewData?.note.title && (
                  <>
                    <span className="text-[var(--sea-ink-soft)] font-light">→</span>
                    <span className="text-[var(--lagoon-deep)] font-semibold">
                      {previewData.note.title}
                    </span>
                  </>
                )}
              </h2>
            </div>

            {previewData && (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-[var(--surface-strong)] p-1 rounded-xl border border-[var(--line)] w-64">
                  <button
                    type="button"
                    onClick={() => setDiffViewMode("split")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                      diffViewMode === "split"
                        ? "bg-sea-ink text-bg-base"
                        : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                    }`}
                  >
                    Split Git Diff
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiffViewMode("raw")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                      diffViewMode === "raw"
                        ? "bg-sea-ink text-bg-base"
                        : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                    }`}
                  >
                    Side-by-Side Raw
                  </button>
                </div>
              </div>
            )}
          </div>

          {previewMutation.isPending && (
            <div className="island-shell p-16 rounded-xl text-center flex flex-col items-center">
              <RotateCcw className="animate-spin text-[var(--lagoon-deep)] mb-4" size={48} />
              <h3 className="text-xl font-bold text-[var(--sea-ink)] mb-1">Analyzing Note</h3>
              <p className="text-sm text-[var(--sea-ink-soft)]">
                AI is restructuring your content for better clarity...
              </p>
            </div>
          )}

          {previewData && (
            <div className="flex flex-col gap-6">
              {/* Roadmap */}
              {previewData.improvements && previewData.improvements.length > 0 && (
                <div className="island-shell p-5 rounded-xl">
                  <h3 className="island-kicker mb-3 flex items-center gap-1.5 text-[var(--lagoon-deep)]">
                    <ListChecks size={14} /> Quality Improvement Roadmap
                  </h3>
                  <ul className="space-y-2.5 max-h-24 overflow-y-auto pr-1">
                    {previewData.improvements.map((s: any) => {
                      const isChecked = !!checkedSuggestions[s.id || s.actionLabel];
                      return (
                        <li key={s.id || s.actionLabel} className="text-xs">
                          <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                setCheckedSuggestions((prev) => ({
                                  ...prev,
                                  [s.id || s.actionLabel]: !isChecked,
                                }))
                              }
                              className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[var(--lagoon)] focus:ring-[var(--lagoon)] cursor-pointer shrink-0"
                            />
                            <div>
                              <span
                                className={`font-bold text-[var(--sea-ink)] ${isChecked ? "line-through opacity-50" : ""}`}
                              >
                                {s.actionLabel}:{" "}
                              </span>
                              <span
                                className={`text-[var(--sea-ink-soft)] ${isChecked ? "line-through opacity-50" : ""}`}
                              >
                                {s.description}
                              </span>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Diffs Side-by-Side Grid */}
              {diffViewMode === "split" ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Aligned Original */}
                  <article className="island-shell p-5 rounded-xl flex flex-col h-[32rem]">
                    <h3 className="island-kicker mb-3 flex items-center justify-between">
                      <span>Original Content</span>
                      <span className="text-[10px] text-red-500 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">
                        Removed
                      </span>
                    </h3>
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: sync scrolling */}
                    <div
                      ref={leftScrollRef}
                      onMouseEnter={() => {
                        activeScrollRef.current = "left";
                      }}
                      onMouseLeave={() => {
                        if (activeScrollRef.current === "left") activeScrollRef.current = null;
                      }}
                      onScroll={() => syncScroll("left")}
                      className="flex-1 overflow-y-auto pr-1 font-mono text-[10px] sm:text-xs leading-relaxed border border-[var(--line)] bg-[var(--surface)] p-3 rounded-lg select-text"
                    >
                      {alignedDiff.map((line, idx) => (
                        <div
                          // biome-ignore lint/suspicious/noArrayIndexKey: static aligned diff lines
                          key={idx}
                          className={`flex min-h-[1.5rem] px-1.5 rounded ${
                            line.original.type === "removed"
                              ? "bg-red-500/10 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-l-2 border-red-500 font-semibold"
                              : line.original.type === "empty"
                                ? "bg-slate-100/50 dark:bg-slate-900/20 opacity-30 select-none"
                                : "text-[var(--sea-ink-soft)]"
                          }`}
                        >
                          <span className="w-8 shrink-0 opacity-40 select-none text-right pr-2 text-[10px] font-mono">
                            {line.originalLineNum ?? ""}
                          </span>
                          <span className="whitespace-pre-wrap">{line.original.content}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  {/* Right: Aligned Refactored */}
                  <article className="island-shell p-5 rounded-xl border border-[var(--lagoon)] bg-surface-strong flex flex-col h-[32rem]">
                    <h3 className="island-kicker mb-4 flex items-center justify-between text-[var(--lagoon-deep)] shrink-0">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 size={12} /> AI Improvements
                      </span>
                      <span className="text-[10px] text-green-500 font-bold bg-green-500/10 px-1.5 py-0.5 rounded">
                        Added
                      </span>
                    </h3>

                    <div className="flex-1 flex flex-col min-h-0">
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: sync scrolling */}
                      <div
                        ref={rightScrollRef}
                        onMouseEnter={() => {
                          activeScrollRef.current = "right";
                        }}
                        onMouseLeave={() => {
                          if (activeScrollRef.current === "right") activeScrollRef.current = null;
                        }}
                        onScroll={() => syncScroll("right")}
                        className="flex-1 overflow-y-auto pr-1 font-mono text-[10px] sm:text-xs leading-relaxed border border-[var(--line)] bg-surface p-3 rounded-lg select-text"
                      >
                        {alignedDiff.map((line, idx) => (
                          <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: static aligned diff lines
                            key={idx}
                            className={`flex min-h-[1.5rem] px-1.5 rounded ${
                              line.refactored.type === "added"
                                ? "bg-green-500/10 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-l-2 border-green-500 font-semibold"
                                : line.refactored.type === "empty"
                                  ? "bg-slate-100/50 dark:bg-slate-900/20 opacity-30 select-none"
                                  : "text-[var(--sea-ink)]"
                            }`}
                          >
                            <span className="w-8 shrink-0 opacity-40 select-none text-right pr-2 text-[10px] font-mono">
                              {line.refactoredLineNum ?? ""}
                            </span>
                            <span className="whitespace-pre-wrap">{line.refactored.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Raw Original */}
                  <article className="island-shell p-5 rounded-xl flex flex-col h-[32rem]">
                    <h3 className="island-kicker mb-3 flex items-center gap-2">Original Content</h3>
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: sync scrolling */}
                    <div
                      ref={leftScrollRef}
                      onMouseEnter={() => {
                        activeScrollRef.current = "left";
                      }}
                      onMouseLeave={() => {
                        if (activeScrollRef.current === "left") activeScrollRef.current = null;
                      }}
                      onScroll={() => syncScroll("left")}
                      className="flex-1 overflow-y-auto pr-1"
                    >
                      <pre className="text-xs text-[var(--sea-ink-soft)] whitespace-pre-wrap font-mono select-text leading-relaxed p-3 border border-[var(--line)] bg-[var(--surface)] rounded-lg">
                        {previewData.originalContent}
                      </pre>
                    </div>
                  </article>

                  {/* Right: Raw Refactored */}
                  <article className="island-shell p-5 rounded-xl border border-[var(--lagoon)] bg-surface-strong flex flex-col h-[32rem]">
                    <h3 className="island-kicker mb-4 flex items-center gap-2 text-[var(--lagoon-deep)] shrink-0">
                      <CheckCircle2 size={12} /> AI Improvements
                    </h3>

                    <div className="flex-1 flex flex-col min-h-0">
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: sync scrolling */}
                      <div
                        ref={rightScrollRef}
                        onMouseEnter={() => {
                          activeScrollRef.current = "right";
                        }}
                        onMouseLeave={() => {
                          if (activeScrollRef.current === "right") activeScrollRef.current = null;
                        }}
                        onScroll={() => syncScroll("right")}
                        className="flex-1 text-xs text-[var(--sea-ink)] bg-surface p-3 rounded-lg border border-[var(--line)] whitespace-pre-wrap font-mono overflow-y-auto"
                      >
                        {previewData.note.content}
                      </div>
                    </div>
                  </article>
                </div>
              )}

              {/* Save Button */}
              <button
                type="button"
                onClick={() =>
                  confirmMutation.mutate({
                    requestId: previewData.requestId,
                    sourcePath: selectedPath!,
                    note: {
                      title: previewData.note.title,
                      content: previewData.note.content,
                      tags: previewData.note.tags,
                      links: previewData.note.links,
                    },
                  })
                }
                disabled={confirmMutation.isPending}
                className="w-full py-3 bg-sea-ink text-bg-base rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-bg-base shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <>
                    <Save size={16} /> Save Refactored Version
                  </>
                )}
              </button>
            </div>
          )}

          {previewMutation.isError && (
            <div className="p-8 island-shell rounded-xl text-center">
              <AlertCircle className="text-red-500 mx-auto mb-3" size={36} />
              <h3 className="text-lg font-bold text-red-700">Refactor Failed</h3>
              <p className="text-sm text-red-600 mb-4">
                Something went wrong while refactoring the note.
              </p>
              <button
                type="button"
                onClick={() => handleRefactor(selectedPath)}
                className="px-5 py-2 bg-sea-ink text-bg-base rounded-lg font-bold text-sm cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AuditSuggestionList({
  candidateNotesById,
  isError,
  isLoading,
  onOpenRefactor,
  suggestions,
}: {
  candidateNotesById: Map<string, CandidateNoteReference>;
  isError: boolean;
  isLoading: boolean;
  onOpenRefactor: (path: string) => void;
  suggestions: OrganizationSuggestion[];
}) {
  return (
    <div className="border-b border-[var(--line)]">
      {isLoading && <AuditQueueLoading />}
      {isError && <AuditQueueUnavailable />}
      {!isLoading && !isError && suggestions.length === 0 && <AuditQueueEmpty />}
      {!isLoading && !isError && suggestions.length > 0 && (
        <ol className="divide-y divide-[var(--line)]">
          {suggestions.map((suggestion) => (
            <AuditSuggestionCard
              key={suggestion.id}
              candidateNotesById={candidateNotesById}
              suggestion={suggestion}
              onOpenRefactor={onOpenRefactor}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditSuggestionCard({
  candidateNotesById,
  onOpenRefactor,
  suggestion,
}: {
  candidateNotesById: Map<string, CandidateNoteReference>;
  onOpenRefactor: (path: string) => void;
  suggestion: OrganizationSuggestion;
}) {
  const tone = organizationSuggestionTone(suggestion.priority);

  return (
    <li className="p-4 lg:p-5">
      <article className="rounded-xl border border-transparent p-1 transition-colors hover:border-[rgba(50,143,151,0.3)] hover:bg-[var(--foam)]/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={suggestionTypeClass(tone)}>
                {formatOrganizationSuggestionKind(suggestion.type)}
              </span>
              {suggestion.requiresApproval && (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Approval required
                </span>
              )}
              {suggestion.reversible && (
                <span className="rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Reversible
                </span>
              )}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sea-ink)]">
              {suggestion.reason}
            </p>
            {suggestion.candidateNoteIds.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-[var(--sea-ink-soft)]">
                  Candidate references ·{" "}
                  {formatCandidateReferenceCount(suggestion.candidateNoteIds.length)}
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Candidate note references">
                  {suggestion.candidateNoteIds.map((candidateId) => {
                    const candidate = candidateNotesById.get(candidateId);
                    const label = formatCandidateNoteReference(candidate, candidateId);

                    return (
                      <li key={candidateId} title={candidateId}>
                        {candidate ? (
                          <button
                            type="button"
                            onClick={() => onOpenRefactor(candidate.path)}
                            className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-left text-[10px] text-[var(--sea-ink-soft)] hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)]"
                          >
                            {label}
                          </button>
                        ) : (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                            {label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <p className="mt-3 text-xs font-bold text-[var(--sea-ink-soft)]">
              Next review: <span className="text-[var(--sea-ink)]">{suggestion.actionLabel}</span>
            </p>
            <button
              type="button"
              onClick={() => onOpenRefactor(suggestion.notePath)}
              className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm font-bold text-[var(--lagoon-deep)] hover:underline"
            >
              <RotateCcw size={15} className="shrink-0" />
              <span className="truncate">Open {suggestion.notePath} in Refactor Note</span>
            </button>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-2 text-center lg:min-w-[190px]">
            <AuditMetric
              label="Priority"
              value={formatOrganizationPercentage(suggestion.priority)}
              tone={tone}
            />
            <AuditMetric
              label="Confidence"
              value={formatOrganizationPercentage(suggestion.confidence)}
              tone="neutral"
            />
          </dl>
        </div>
      </article>
    </li>
  );
}

function AuditMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "high" | "medium" | "low" | "neutral";
  value: string;
}) {
  return (
    <div className={metricClass(tone)}>
      <dt className="text-[10px] font-bold uppercase tracking-wider">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold">{value}</dd>
    </div>
  );
}

function AuditQueueLoading() {
  return (
    <div className="p-12 text-center text-sm text-[var(--sea-ink-soft)]">
      <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
      Loading deterministic audit signals…
    </div>
  );
}

function AuditQueueUnavailable() {
  return (
    <div className="p-10 text-center">
      <AlertTriangle className="mx-auto mb-3 text-red-600" size={26} />
      <h3 className="font-extrabold text-[var(--sea-ink)]">Audit signals are unavailable</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--sea-ink-soft)]">
        Confirm the local API and indexed vault are available, then try again. Your vault remains
        unchanged.
      </p>
    </div>
  );
}

function AuditQueueEmpty() {
  return (
    <div className="px-5 py-4 text-sm text-[var(--sea-ink-soft)]">
      No notes need review with the current filters.
    </div>
  );
}

function suggestionTypeClass(tone: "high" | "medium" | "low"): string {
  if (tone === "high")
    return "rounded-md bg-red-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-800 dark:bg-red-950/40 dark:text-red-300";
  if (tone === "medium")
    return "rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "rounded-md bg-sky-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-800 dark:bg-sky-950/40 dark:text-sky-300";
}

function metricClass(tone: "high" | "medium" | "low" | "neutral"): string {
  if (tone === "high")
    return "rounded-lg bg-red-50 px-2 py-2 text-red-800 dark:bg-red-950/30 dark:text-red-200";
  if (tone === "medium")
    return "rounded-lg bg-amber-50 px-2 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (tone === "low")
    return "rounded-lg bg-sky-50 px-2 py-2 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200";
  return "rounded-lg bg-[var(--foam)] px-2 py-2 text-[var(--sea-ink)]";
}
