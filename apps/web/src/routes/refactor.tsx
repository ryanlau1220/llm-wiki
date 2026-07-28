import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  ListChecks,
  Loader2,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { computeAlignedDiff } from "../lib/diff";
import { formatOrganizationPercentage } from "../lib/organization-suggestion-presentation";
import { orpc } from "../lib/orpc";

export const Route = createFileRoute("/refactor")({
  validateSearch: z.object({
    path: z.string().optional(),
  }),
  component: RefactorComponent,
});

const ORGANIZATION_SUGGESTION_LIMIT = 50;

type OrganizationSuggestion = {
  notePath: string;
  priority: number;
  confidence: number;
};

function RefactorComponent() {
  const navigate = useNavigate();
  const { path } = Route.useSearch();
  const [selectedPath, setSelectedPath] = useState<string | null>(path || null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [worklistFilter, setWorklistFilter] = useState<"all" | "review">("all");
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

  const weakNoteReasonsByPath = useMemo(
    () => new Map(weakNotes?.map((note) => [note.path, note.reasons]) ?? []),
    [weakNotes],
  );

  const suggestionByNotePath = useMemo(() => {
    const suggestions = new Map<string, OrganizationSuggestion>();

    for (const suggestion of auditSuggestionsQuery.data ?? []) {
      const current = suggestions.get(suggestion.notePath);
      if (
        !current ||
        suggestion.priority > current.priority ||
        (suggestion.priority === current.priority && suggestion.confidence > current.confidence)
      ) {
        suggestions.set(suggestion.notePath, suggestion);
      }
    }

    return suggestions;
  }, [auditSuggestionsQuery.data]);

  const visibleNotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const matchingNotes = (notes ?? [])
      .filter(
        (note) =>
          !query ||
          note.path.toLowerCase().includes(query) ||
          note.title?.toLowerCase().includes(query),
      )
      .filter(
        (note) =>
          worklistFilter === "all" ||
          weakNoteReasonsByPath.has(note.path) ||
          suggestionByNotePath.has(note.path),
      );

    return matchingNotes.sort((left, right) => {
      const leftNeedsAttention =
        weakNoteReasonsByPath.has(left.path) || suggestionByNotePath.has(left.path);
      const rightNeedsAttention =
        weakNoteReasonsByPath.has(right.path) || suggestionByNotePath.has(right.path);

      if (leftNeedsAttention !== rightNeedsAttention) return leftNeedsAttention ? -1 : 1;
      return left.path.localeCompare(right.path);
    });
  }, [notes, searchTerm, suggestionByNotePath, weakNoteReasonsByPath, worklistFilter]);

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
                    ["all", "All notes"],
                    ["review", "Needs attention"],
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
              </div>
            </div>

            {isLoadingNotes || isLoadingWeakNotes ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-[var(--lagoon-deep)]" size={28} />
              </div>
            ) : (
              <div className="max-h-[500px] space-y-2 overflow-y-auto p-2">
                {visibleNotes.length === 0 ? (
                  <div className="py-12 text-center text-sm italic text-[var(--sea-ink-soft)]">
                    No notes found.
                  </div>
                ) : (
                  visibleNotes.map((note) => {
                    const reasons = weakNoteReasonsByPath.get(note.path);
                    const suggestion = suggestionByNotePath.get(note.path);
                    const needsAttention = Boolean(reasons?.length || suggestion);

                    return (
                      <button
                        type="button"
                        key={note.id}
                        onClick={() => handleRefactor(note.path)}
                        className="group flex w-full items-center justify-between rounded-xl border border-transparent p-3.5 text-left transition-all hover:border-[var(--line)] hover:bg-[var(--foam)]"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3.5">
                          <div className="mt-0.5 shrink-0 rounded-lg border border-line bg-surface p-2 shadow-sm">
                            <FileText size={16} className="text-[var(--sea-ink-soft)]" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <h4 className="truncate text-sm font-bold text-[var(--sea-ink)]">
                                {note.title || note.path.split("/").pop()?.replace(".md", "")}
                              </h4>
                              {note.qualityScore !== null && note.qualityScore !== undefined && (
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                    needsAttention
                                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-450"
                                      : "border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-450"
                                  }`}
                                >
                                  Score: {note.qualityScore.toFixed(2)}
                                </span>
                              )}
                            </div>

                            <div className="mb-1 mt-0.5 truncate font-mono text-[11px] text-[var(--sea-ink-soft)]">
                              {note.path}
                            </div>

                            {reasons && reasons.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {reasons.map((reason: string) => (
                                  <span
                                    key={reason}
                                    className="rounded border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-450"
                                  >
                                    {reason.replace(/_/g, " ")}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="ml-4 flex shrink-0 items-center gap-3">
                          {suggestion && (
                            <dl className="grid grid-cols-2 gap-x-3 text-right">
                              <div>
                                <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                                  Priority
                                </dt>
                                <dd className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
                                  {formatOrganizationPercentage(suggestion.priority)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                                  Confidence
                                </dt>
                                <dd className="text-xs font-extrabold text-[var(--sea-ink)]">
                                  {formatOrganizationPercentage(suggestion.confidence)}
                                </dd>
                              </div>
                            </dl>
                          )}
                          <ChevronRight
                            size={18}
                            className="shrink-0 text-[var(--line)] transition-colors group-hover:text-[var(--lagoon-deep)]"
                          />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
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
