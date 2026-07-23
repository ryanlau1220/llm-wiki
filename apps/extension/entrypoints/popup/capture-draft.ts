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

export type CaptureDraft = PageCapture & {
  query: string
}

export function createCaptureDraft(capture: PageCapture): CaptureDraft {
  return {
    ...capture,
    query: '',
  }
}

export function toCapturePayload(draft: CaptureDraft, capturedAt: string) {
  const query = draft.query.trim()
  return {
    sourceUrl: draft.sourceUrl,
    sourceTitle: draft.sourceTitle,
    content: draft.content.trim(),
    sources: draft.sources,
    query: query || undefined,
    capturedAt,
  }
}
