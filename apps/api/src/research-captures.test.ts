import { describe, expect, test } from 'bun:test'

import { buildResearchMarkdown } from './research-captures'

describe('buildResearchMarkdown', () => {
  test('keeps source provenance and neutralizes Markdown link-label injection', () => {
    const markdown = buildResearchMarkdown({
      captureId: 'c8c0e2af-530b-4d5e-aa71-e387fcc4ee4d',
      title: 'Useful [research]\nheading',
      sourceUrl: 'https://example.com/answer',
      sourceTitle: 'Example [answer]',
      query: 'What is local first?',
      content: 'The selected answer.',
      sources: [{ title: 'Reference [one]', url: 'https://example.com/source' }],
      capturedAt: new Date('2026-07-23T10:30:00.000Z'),
    })

    expect(markdown).toContain('# Useful \\[research\\] heading')
    expect(markdown).toContain('[Example \\[answer\\]](https://example.com/answer)')
    expect(markdown).toContain('[Reference \\[one\\]](https://example.com/source)')
    expect(markdown).toContain('source_kind: browser_capture')
  })
})
