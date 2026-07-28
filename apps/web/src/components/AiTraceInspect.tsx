import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSearch,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { orpc } from "../lib/orpc";

type Props = { traceId?: string; onBack: () => void };

export function pageButtons(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  const pages = new Set([1, 2, currentPage - 1, currentPage, currentPage + 1, totalPages]);
  const ordered = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  return ordered.flatMap((page, index) => {
    const previous = ordered[index - 1];
    return previous !== undefined && page - previous > 1 ? ["ellipsis" as const, page] : [page];
  });
}

export function AiTraceInspect({ traceId, onBack }: Props) {
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[page - 1];
  const detailQuery = useQuery(
    orpc.getAiTrace.queryOptions({
      input: { traceId: traceId! },
      enabled: Boolean(traceId),
    } as any),
  );
  const listQuery = useQuery(
    orpc.listAiTraces.queryOptions({ input: { limit: 20, cursor, includeEvidence: false } } as any),
  );
  const detail = detailQuery.data;
  const totalPages = Math.max(1, Math.ceil((listQuery.data?.totalCount ?? 0) / 20));

  if (traceId)
    return (
      <section className="space-y-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-bold text-lagoon-deep hover:underline"
        >
          <ChevronLeft size={16} /> All generator runs
        </button>
        {detailQuery.isLoading && <InspectLoading />}
        {detailQuery.isError && <InspectUnavailable />}
        {!detailQuery.isLoading && !detailQuery.isError && !detail && (
          <div className="island-shell rounded-xl p-8 text-center">
            <FileSearch className="mx-auto mb-3 text-sea-ink-soft" />
            <h2 className="font-extrabold text-sea-ink">Run not found</h2>
            <p className="mt-1 text-sm text-sea-ink-soft">
              It may not have been recorded because the local database was unavailable.
            </p>
          </div>
        )}
        {detail && <TraceDetail trace={detail} />}
      </section>
    );

  const navigateToPage = (targetPage: number) => setPage(targetPage);
  const nextPage = () => {
    const nextCursor = listQuery.data?.nextCursor;
    if (!nextCursor) return;
    setCursors((known) => (known[page] ? known : [...known, nextCursor]));
    setPage((current) => current + 1);
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2">
            <Link
              to="/generator"
              className="inline-flex items-center gap-1 text-sm font-bold text-lagoon-deep hover:underline"
            >
              <ChevronLeft size={16} /> Back to AI Assistant
            </Link>
          </div>
          <h2 className="display-title text-2xl font-bold text-sea-ink">Inspect runs</h2>
          <p className="mt-1 text-sm text-sea-ink-soft">
            Local structural trace history. Questions, prompts, packed context, and generated text
            are never retained here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => listQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold text-sea-ink hover:bg-foam"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {listQuery.isLoading && <InspectLoading />}
      {listQuery.isError && <InspectUnavailable />}
      {!listQuery.isLoading && !listQuery.isError && listQuery.data?.items.length === 0 && (
        <div className="island-shell rounded-xl p-10 text-center">
          <FileSearch className="mx-auto mb-3 text-sea-ink-soft" />
          <h3 className="font-extrabold text-sea-ink">No AI Generator runs yet</h3>
          <p className="mt-1 text-sm text-sea-ink-soft">
            Run Ask, Synthesize, or Bootstrap to create a trace.
          </p>
        </div>
      )}
      <div className="space-y-3">
        {listQuery.data?.items.map((trace: any) => (
          <Link
            key={trace.id}
            to="/generator"
            search={{ inspect: trace.id }}
            className="island-shell block w-full rounded-xl p-4 text-left transition hover:border-lagoon"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={
                    trace.status === "failed"
                      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700"
                      : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700"
                  }
                >
                  {trace.status}
                </span>
                <span className="font-extrabold capitalize text-sea-ink">
                  {trace.operation.replace("_", " ")}
                </span>
                <span className="text-xs text-sea-ink-soft">
                  {new Date(trace.createdAt).toLocaleString()}
                </span>
              </div>
              <span className="font-mono text-xs text-sea-ink-soft">
                {trace.durationMs === null ? "pending" : `${trace.durationMs} ms`}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-sea-ink-soft">
              <span>
                Policy: <b className="text-sea-ink">{trace.policy}</b>
              </span>
              <span>
                Candidates: <b className="text-sea-ink">{trace.candidateCount}</b>
              </span>
              <span>
                {trace.errorCode
                  ? `Failure: ${trace.errorCode}`
                  : `Model: ${trace.modelName ?? "unrecorded"}`}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {listQuery.data?.items.length ? (
        <nav aria-label="Trace history pages" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={page === 1 || listQuery.isFetching}
            onClick={() => navigateToPage(page - 1)}
            className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-sea-ink disabled:opacity-50"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          {pageButtons(totalPages, page).map((item) =>
            item === "ellipsis" ? (
              <span key="ellipsis" className="px-1 text-sea-ink-soft" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                disabled={item > cursors.length || listQuery.isFetching}
                onClick={() => navigateToPage(item)}
                title={item > cursors.length ? "Visit earlier pages to reach this page" : undefined}
                className={`min-w-10 rounded-lg border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 ${item === page ? "border-lagoon bg-lagoon text-lagoon-text" : "border-line text-sea-ink hover:bg-foam"}`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={!listQuery.data?.nextCursor || listQuery.isFetching}
            onClick={nextPage}
            className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-sea-ink disabled:opacity-50"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function TraceDetail({ trace }: { trace: any }) {
  const noVaultEvidence = trace.policy === "general_web";
  return (
    <div className="space-y-5">
      <div className="island-shell rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="island-kicker">{trace.traceVersion}</p>
            <h2 className="mt-1 text-xl font-extrabold capitalize text-sea-ink">
              {trace.operation} run
            </h2>
          </div>
          <span
            className={
              trace.status === "failed"
                ? "rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-200"
                : "rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-950/40 dark:text-green-200"
            }
          >
            {trace.status}
          </span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Metric
            label="Duration"
            value={trace.durationMs === null ? "Pending" : `${trace.durationMs} ms`}
          />
          <Metric label="Policy" value={trace.policy} />
          <Metric
            label={noVaultEvidence ? "Vault evidence" : "Evidence"}
            value={String(trace.selectedEvidenceCount)}
          />
          <Metric label="Model" value={trace.modelName ?? "Not recorded"} />
        </dl>
        {noVaultEvidence && (
          <p className="mt-3 text-xs text-sea-ink-soft">
            This web-only run did not retrieve from your vault, so zero vault evidence is expected.
          </p>
        )}
        {trace.errorCode && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800 dark:bg-red-950/40 dark:text-red-200">
            Failure: {trace.errorCode}
          </p>
        )}
      </div>
      <div className="island-shell rounded-xl p-5">
        <h3 className="flex items-center gap-2 font-extrabold text-sea-ink">
          <GitBranch size={17} /> Execution spans
        </h3>
        <ol className="mt-4 space-y-3">
          {buildSpanTree(trace.spans ?? []).map((node) => (
            <SpanNode key={node.span.id} node={node} depth={0} />
          ))}
        </ol>
      </div>
      {trace.evidence?.length > 0 && (
        <div className="island-shell rounded-xl p-5">
          <h3 className="font-extrabold text-sea-ink">Evidence references</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {trace.evidence.map((e: any) => (
              <li
                key={`${e.documentId}-${e.chunkIndex}`}
                className="flex flex-wrap justify-between gap-2 border-b border-line pb-2"
              >
                <span className="font-bold text-sea-ink">
                  {e.documentPath} · chunk {e.chunkIndex + 1}
                </span>
                <span className="text-sea-ink-soft">
                  {e.source} · rank {e.retrievalRank}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type SpanNodeData = { span: any; children: SpanNodeData[] };
export function buildSpanTree(spans: any[]): SpanNodeData[] {
  const byId = new Map(spans.map((span) => [span.id, { span, children: [] as SpanNodeData[] }]));
  const roots: SpanNodeData[] = [];
  for (const node of byId.values()) {
    const parent = node.span.parentSpanId ? byId.get(node.span.parentSpanId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
function SpanNode({ node, depth }: { node: SpanNodeData; depth: number }) {
  const { span } = node;
  return (
    <li className="relative" style={{ marginLeft: `${depth * 1.25}rem` }}>
      <span
        className={`absolute -left-4 top-1.5 h-3 w-3 rounded-full ${span.status === "failed" ? "bg-red-500" : span.status === "started" ? "bg-amber-400" : "bg-lagoon"}`}
      />
      <div className="rounded-lg bg-foam p-3">
        <div className="flex flex-wrap justify-between gap-2">
          <span className="font-bold text-sea-ink">{span.spanType.replace("_", " ")}</span>
          <span className="text-xs text-sea-ink-soft">
            {span.durationMs === null ? "Pending" : `${span.durationMs} ms`}
          </span>
        </div>
        {span.errorCode && (
          <p className="mt-1 text-xs font-bold text-red-700 dark:text-red-300">{span.errorCode}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(span.attributes).map(([key, value]) => (
            <span
              key={key}
              className="rounded border border-[var(--chip-line)] bg-[var(--chip-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sea-ink)]"
            >
              {key}: {String(value)}
            </span>
          ))}
        </div>
      </div>
      {node.children.length > 0 && (
        <ol className="mt-3 space-y-3 border-l-2 border-line pl-4">
          {node.children.map((child) => (
            <SpanNode key={child.span.id} node={child} depth={depth + 1} />
          ))}
        </ol>
      )}
    </li>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-sea-ink-soft">{label}</dt>
      <dd className="mt-1 font-bold text-sea-ink">{value}</dd>
    </div>
  );
}
function InspectLoading() {
  return (
    <div className="island-shell rounded-xl p-10 text-center">
      <Clock3 className="mx-auto animate-pulse text-lagoon" />
      <p className="mt-3 text-sm text-sea-ink-soft">Loading local trace metadata…</p>
    </div>
  );
}
function InspectUnavailable() {
  return (
    <div className="island-shell rounded-xl p-10 text-center">
      <AlertTriangle className="mx-auto text-red-600" />
      <p className="mt-3 text-sm text-sea-ink-soft">
        Trace history is unavailable. Confirm the local API and database are running.
      </p>
    </div>
  );
}
