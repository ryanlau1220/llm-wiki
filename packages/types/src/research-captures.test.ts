import { describe, expect, test } from 'bun:test'

import { extensionResearchCaptureSchema } from './schemas'

const validCapture = {
  sourceUrl: 'https://www.google.com/search?q=local+first',
  sourceTitle: 'Local-first research',
  query: 'What makes this local first?',
  content: 'A deliberately selected answer from the active browser tab.',
  sources: [{ title: 'Primary source', url: 'https://example.com/source' }],
  capturedAt: '2026-07-23T10:30:00.000Z',
}

describe('extensionResearchCaptureSchema', () => {
  test('accepts an explicit source-linked browser capture', () => {
    expect(extensionResearchCaptureSchema.parse(validCapture)).toEqual(validCapture)
  })

  test('rejects unsafe URLs and oversized capture bodies', () => {
    expect(extensionResearchCaptureSchema.safeParse({ ...validCapture, sourceUrl: 'file:///etc/passwd' }).success).toBe(false)
    expect(extensionResearchCaptureSchema.safeParse({ ...validCapture, content: 'x'.repeat(100_001) }).success).toBe(false)
  })
})
