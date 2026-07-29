import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ChevronLeft,
  Clock3,
  FileUp,
  Loader2,
  Pause,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Rss,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { orpc } from "../lib/orpc";

type Source = { id: string };

function scheduleLabel(minutes: number): string {
  if (minutes % 1_440 === 0) return `Every ${minutes / 1_440} day${minutes === 1_440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `Every ${minutes} minutes`;
}

function formatTime(value: string | null): string {
  if (!value) return "Not run yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function intervalToHours(minutes: number): string {
  return String(Math.max(1, Math.round(minutes / 60)));
}

export function AiAutomations({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [feedUrl, setFeedUrl] = useState("");
  const [opml, setOpml] = useState("");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [intervalHours, setIntervalHours] = useState("24");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const automationFormRef = useRef<HTMLDivElement>(null);

  const sourcesQuery = useQuery(orpc.listResearchSources.queryOptions());
  const automationsQuery = useQuery(orpc.listResearchAutomations.queryOptions());
  const selectedAutomation = useMemo(
    () => automationsQuery.data?.find((automation) => automation.id === selectedAutomationId) ?? null,
    [automationsQuery.data, selectedAutomationId],
  );
  const runsQuery = useQuery({
    ...orpc.listResearchAutomationRuns.queryOptions({
      input: { automationId: selectedAutomationId ?? "00000000-0000-4000-8000-000000000000" },
    }),
    enabled: Boolean(selectedAutomationId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.listResearchSources.queryKey() });
    void queryClient.invalidateQueries({ queryKey: orpc.listResearchAutomations.queryKey() });
    if (selectedAutomationId) {
      void queryClient.invalidateQueries({
        queryKey: orpc.listResearchAutomationRuns.queryKey({ input: { automationId: selectedAutomationId } }),
      });
    }
  };

  const addSource = useMutation(orpc.createResearchSource.mutationOptions({
    onSuccess: (source) => {
      setFeedUrl("");
      setSelectedSourceIds((ids) => (ids.includes(source.id) ? ids : [...ids, source.id]));
      invalidate();
    },
  }));
  const importSources = useMutation(orpc.importResearchSources.mutationOptions({
    onSuccess: (result) => {
      setOpml("");
      setSelectedSourceIds((ids) => [...new Set([...ids, ...result.added.map((source) => source.id)])]);
      invalidate();
    },
  }));
  const deleteSource = useMutation(orpc.deleteResearchSource.mutationOptions({ onSuccess: invalidate }));
  const createAutomation = useMutation(orpc.createResearchAutomation.mutationOptions({
    onSuccess: (automation) => {
      setSelectedAutomationId(automation.id);
      setName("");
      setTopic("");
      setSelectedSourceIds([]);
      invalidate();
    },
  }));
  const updateAutomation = useMutation(orpc.updateResearchAutomation.mutationOptions({
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  }));
  const runAutomation = useMutation(orpc.runResearchAutomation.mutationOptions({ onSuccess: invalidate }));
  const deleteAutomation = useMutation(orpc.deleteResearchAutomation.mutationOptions({
    onSuccess: () => {
      setSelectedAutomationId(null);
      invalidate();
    },
  }));

  useEffect(() => {
    if (!selectedAutomation && automationsQuery.data?.[0]) setSelectedAutomationId(automationsQuery.data[0].id);
  }, [automationsQuery.data, selectedAutomation]);

  useEffect(() => {
    if (!selectedAutomation || editing) return;
    setName(selectedAutomation.name);
    setTopic(selectedAutomation.topic);
    setIntervalHours(intervalToHours(selectedAutomation.scheduleMinutes));
    setSelectedSourceIds(selectedAutomation.sourceIds);
  }, [selectedAutomation, editing]);

  const toggleSource = (source: Source) => {
    setSelectedSourceIds((ids) => ids.includes(source.id) ? ids.filter((id) => id !== source.id) : [...ids, source.id]);
  };

  const saveAutomation = () => {
    const scheduleMinutes = Math.max(15, Math.min(10_080, Math.round(Number(intervalHours || 0) * 60)));
    if (selectedAutomation && editing) {
      updateAutomation.mutate({ id: selectedAutomation.id, name, topic, sourceIds: selectedSourceIds, scheduleMinutes });
      return;
    }
    createAutomation.mutate({ name, topic, sourceIds: selectedSourceIds, scheduleMinutes, maxCapturesPerRun: 10 });
  };

  const isSaving = createAutomation.isPending || updateAutomation.isPending;

  const beginEditing = () => {
    if (!selectedAutomation) return;
    setName(selectedAutomation.name);
    setTopic(selectedAutomation.topic);
    setIntervalHours(intervalToHours(selectedAutomation.scheduleMinutes));
    setSelectedSourceIds(selectedAutomation.sourceIds);
    setEditing(true);
    requestAnimationFrame(() => automationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-6 rise-in">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} className="mt-0.5 rounded-lg p-2 text-[var(--sea-ink-soft)] hover:bg-[var(--foam)]" aria-label="Back to AI Assistant">
            <ChevronLeft size={19} />
          </button>
          <div>
            <p className="island-kicker flex items-center gap-2"><RadioTower size={14} /> Automations</p>
            <h1 className="display-title mt-1 text-3xl font-bold text-[var(--sea-ink)]">Research on a cadence</h1>
          </div>
        </div>
        <button type="button" onClick={() => { void automationsQuery.refetch(); void sourcesQuery.refetch(); }} className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-bold text-[var(--sea-ink)] hover:bg-[var(--foam)]">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <section className="space-y-5">
          <div className="island-shell rounded-2xl border border-[var(--line)] p-5">
            <div className="mb-4 flex items-center gap-2"><Rss size={17} className="text-[var(--lagoon)]" /><h2 className="font-bold text-[var(--sea-ink)]">Feed sources</h2></div>
            <form onSubmit={(event) => { event.preventDefault(); if (feedUrl.trim()) addSource.mutate({ feedUrl: feedUrl.trim() }); }} className="flex gap-2">
              <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/feed.xml" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]" />
              <button type="submit" disabled={addSource.isPending} className="rounded-lg bg-[var(--lagoon)] px-3 text-sm font-bold text-[var(--lagoon-text)] disabled:opacity-50"><Plus size={17} /></button>
            </form>
            {addSource.isError && <p className="mt-2 text-xs font-semibold text-red-500">{addSource.error.message}</p>}
            <details className="mt-3 border-t border-[var(--line)] pt-3">
              <summary className="cursor-pointer text-xs font-bold text-[var(--sea-ink-soft)]">Import OPML source pack</summary>
              <textarea value={opml} onChange={(event) => setOpml(event.target.value)} className="mt-3 min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]" placeholder="Paste OPML here" />
              <button type="button" onClick={() => opml.trim() && importSources.mutate({ opml })} disabled={importSources.isPending} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--sea-ink)] hover:bg-[var(--foam)] disabled:opacity-50"><FileUp size={14} /> Import feeds</button>
              {importSources.isError && <p className="mt-2 text-xs font-semibold text-red-500">{importSources.error.message}</p>}
            </details>
            <div className="mt-4 max-h-60 space-y-1 overflow-y-auto border-t border-[var(--line)] pt-3">
              {sourcesQuery.data?.map((source) => (
                <div key={source.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--foam)]">
                  <input type="checkbox" checked={selectedSourceIds.includes(source.id)} onChange={() => toggleSource(source)} className="h-4 w-4 accent-[var(--lagoon)]" aria-label={`Use ${source.name}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[var(--sea-ink)]">{source.name}</p><p className="truncate text-[10px] text-[var(--sea-ink-soft)]">{new URL(source.feedUrl).hostname.replace(/^www\./, "")}</p></div>
                  <button type="button" onClick={() => deleteSource.mutate({ id: source.id })} className="rounded p-1.5 text-[var(--sea-ink-soft)] hover:bg-red-500/10 hover:text-red-500" aria-label={`Delete ${source.name}`}><Trash2 size={14} /></button>
                </div>
              ))}
              {!sourcesQuery.isLoading && !sourcesQuery.data?.length && <p className="py-4 text-center text-xs text-[var(--sea-ink-soft)]">Add a feed to begin.</p>}
            </div>
          </div>

          <div ref={automationFormRef} className="island-shell rounded-2xl border border-[var(--line)] p-5">
            <div className="mb-4 flex items-center gap-2"><Plus size={17} className="text-[var(--lagoon)]" /><h2 className="font-bold text-[var(--sea-ink)]">{selectedAutomation && editing ? "Edit Radar" : "Create Radar"}</h2></div>
            <div className="space-y-3">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Radar name" className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]" />
              <textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What should this Radar look for?" className="min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]" />
              <label className="flex items-center gap-3 text-sm font-semibold text-[var(--sea-ink)]"><Clock3 size={15} className="text-[var(--sea-ink-soft)]" /> Run every <input type="number" min="1" max="168" value={intervalHours} onChange={(event) => setIntervalHours(event.target.value)} className="w-16 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-center text-sm" /> hours</label>
              <button type="button" disabled={isSaving || !name.trim() || !topic.trim() || !selectedSourceIds.length} onClick={saveAutomation} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2.5 text-sm font-bold text-[var(--lagoon-text)] disabled:opacity-50"><Save size={15} /> {selectedAutomation && editing ? "Save changes" : "Create Radar"}</button>
              {selectedAutomation && editing && <button type="button" onClick={() => { setEditing(false); }} className="w-full text-xs font-bold text-[var(--sea-ink-soft)]">Cancel editing</button>}
              {(createAutomation.isError || updateAutomation.isError) && <p className="text-xs font-semibold text-red-500">{(createAutomation.error ?? updateAutomation.error)?.message}</p>}
            </div>
          </div>
        </section>

        <section className="island-shell min-h-[32rem] rounded-2xl border border-[var(--line)] p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="island-kicker">Scheduled jobs</p><h2 className="mt-1 text-xl font-bold text-[var(--sea-ink)]">Active Radars</h2></div><Activity size={19} className="text-[var(--lagoon)]" /></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.28fr)]">
            <div className="space-y-2">
              {automationsQuery.data?.map((automation) => <button key={automation.id} type="button" onClick={() => { setSelectedAutomationId(automation.id); setEditing(false); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedAutomationId === automation.id ? "border-[var(--lagoon)] bg-[var(--foam)]" : "border-[var(--line)] hover:bg-[var(--foam)]"}`}><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-bold text-[var(--sea-ink)]">{automation.name}</p><span className={`mt-0.5 h-2 w-2 rounded-full ${automation.status === "active" ? "bg-emerald-400" : "bg-[var(--sea-ink-soft)]"}`} /></div><p className="mt-1 text-[10px] font-semibold text-[var(--sea-ink-soft)]">{scheduleLabel(automation.scheduleMinutes)}</p><p className="mt-2 text-[10px] text-[var(--sea-ink-soft)]">{automation.latestRun ? `${automation.latestRun.captureCount} inbox item${automation.latestRun.captureCount === 1 ? "" : "s"} last run` : "Waiting for first run"}</p></button>)}
              {!automationsQuery.isLoading && !automationsQuery.data?.length && <p className="py-12 text-center text-sm text-[var(--sea-ink-soft)]">Create a Radar after choosing feeds.</p>}
            </div>

            {selectedAutomation ? <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-[var(--sea-ink)]">{selectedAutomation.name}</h3><p className="mt-1 text-xs text-[var(--sea-ink-soft)]">{selectedAutomation.topic}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${selectedAutomation.status === "active" ? "bg-emerald-500/15 text-emerald-500" : "bg-[var(--foam)] text-[var(--sea-ink-soft)]"}`}>{selectedAutomation.status}</span><button type="button" onClick={() => { if (window.confirm(`Delete ${selectedAutomation.name}?`)) deleteAutomation.mutate({ id: selectedAutomation.id }); }} className="rounded-lg border border-red-500/30 p-1.5 text-red-500" aria-label={`Delete ${selectedAutomation.name}`}><Trash2 size={14} /></button></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[var(--foam)] p-2"><p className="text-[var(--sea-ink-soft)]">Next run</p><p className="mt-1 font-bold text-[var(--sea-ink)]">{formatTime(selectedAutomation.nextRunAt)}</p></div><div className="rounded-lg bg-[var(--foam)] p-2"><p className="text-[var(--sea-ink-soft)]">Sources</p><p className="mt-1 font-bold text-[var(--sea-ink)]">{selectedAutomation.sourceCount}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => runAutomation.mutate({ id: selectedAutomation.id })} disabled={runAutomation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-3 py-2 text-xs font-bold text-[var(--lagoon-text)] disabled:opacity-50">{runAutomation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} Run now</button><button type="button" onClick={() => updateAutomation.mutate({ id: selectedAutomation.id, isActive: selectedAutomation.status !== "active" })} className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--sea-ink)]">{selectedAutomation.status === "active" ? <Pause size={14} /> : <Play size={14} />}{selectedAutomation.status === "active" ? "Pause" : "Resume"}</button><button type="button" onClick={beginEditing} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--sea-ink)]">Edit</button></div>{runAutomation.isError && <p className="mt-3 text-xs font-semibold text-red-500">{runAutomation.error.message}</p>}<div className="mt-5 border-t border-[var(--line)] pt-4"><p className="island-kicker">Recent runs</p><ol className="mt-2 space-y-2">{runsQuery.data?.map((run) => <li key={run.id} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><p className="font-bold text-[var(--sea-ink)]">{run.status === "succeeded" ? `${run.captureCount} sent to Inbox` : run.status === "running" ? "Running…" : run.errorMessage ?? "Run failed"}</p><p className="truncate text-[10px] text-[var(--sea-ink-soft)]">{formatTime(run.startedAt)} · {run.discoveredCount} discovered · {run.newItemCount} new</p></div><span className={`shrink-0 ${run.status === "succeeded" ? "text-emerald-500" : run.status === "running" ? "text-[var(--lagoon)]" : "text-red-500"}`}>{run.status}</span></li>)}{!runsQuery.isLoading && !runsQuery.data?.length && <li className="text-xs text-[var(--sea-ink-soft)]">No runs yet.</li>}</ol></div></div> : <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--sea-ink-soft)]">Select a Radar to inspect its schedule and runs.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
