export type CaptureSource = {
  title: string
  url: string
}

export type PageCapture = {
  sourceUrl: string
  sourceTitle: string
  content: string
  sources: CaptureSource[]
}

export type CaptureDraft = Omit<PageCapture, 'sources'> & {
  query: string
  sources: Array<CaptureSource & { selected: boolean }>
}

export function createCaptureDraft(capture: PageCapture): CaptureDraft {
  return {
    ...capture,
    query: '',
    sources: capture.sources.map((source) => ({ ...source, selected: true })),
  }
}

export function toggleCaptureSource(draft: CaptureDraft, sourceUrl: string): CaptureDraft {
  return {
    ...draft,
    sources: draft.sources.map((source) => source.url === sourceUrl ? { ...source, selected: !source.selected } : source),
  }
}

export function toCapturePayload(draft: CaptureDraft, capturedAt: string) {
  const query = draft.query.trim()
  return {
    sourceUrl: draft.sourceUrl,
    sourceTitle: draft.sourceTitle,
    content: draft.content.trim(),
    sources: draft.sources.filter((source) => source.selected).map(({ title, url }) => ({ title, url })),
    query: query || undefined,
    capturedAt,
  }
}
