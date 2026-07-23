export const RETRIEVAL_TRACE_PAGE_SIZE = 20

export const RETRIEVAL_RETENTION_DAY_OPTIONS = [7, 30, 90, 180, 365] as const
export const RETRIEVAL_RETENTION_LIMIT_OPTIONS = [25, 100, 250, 500, 1000] as const

const TRACE_POLICY_LABELS = {
  vault_hybrid: 'Vault hybrid',
  selected_notes: 'Selected notes',
  general_web: 'General web',
  no_retrieval: 'No retrieval',
} as const

const TRACE_STATUS_LABELS = {
  started: 'In progress',
  succeeded: 'Succeeded',
  failed: 'Failed',
} as const

export function formatRetrievalTracePolicy(policy: keyof typeof TRACE_POLICY_LABELS): string {
  return TRACE_POLICY_LABELS[policy]
}

export function formatRetrievalTraceStatus(status: keyof typeof TRACE_STATUS_LABELS): string {
  return TRACE_STATUS_LABELS[status]
}

export function formatRetrievalTraceDuration(durationMs: number | null): string {
  if (durationMs === null) return 'Pending'
  if (durationMs < 1_000) return `${durationMs} ms`
  return `${(durationMs / 1_000).toFixed(1)} s`
}

export function formatRetrievalTraceTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
