import { describe, expect, test } from 'bun:test'

import { createCaptureDraft, toCapturePayload } from './capture-draft'

const PAGE_CAPTURE = {
  sourceUrl: 'https://example.com/research',
  sourceTitle: 'Research source',
  content: 'Selected passage',
  sources: [{ title: 'Supporting source', url: 'https://example.com/supporting' }],
}

describe('capture draft', () => {
  test('keeps provenance immutable while starting with an empty research question', () => {
    expect(createCaptureDraft(PAGE_CAPTURE)).toEqual({ ...PAGE_CAPTURE, query: '' })
  })

  test('trims editable fields and omits an empty question from the capture payload', () => {
    const payload = toCapturePayload({ ...createCaptureDraft(PAGE_CAPTURE), content: ' Selected passage ', query: '  ' }, '2026-07-23T10:30:00.000Z')

    expect(payload).toEqual({ ...PAGE_CAPTURE, capturedAt: '2026-07-23T10:30:00.000Z', query: undefined })
  })
})
