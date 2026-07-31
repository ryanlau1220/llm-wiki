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

  test('decodes ordinary syndicated character entities before approval', () => {
    const markdown = buildResearchMarkdown({
      captureId: 'capture-1',
      title: '&#8216;Popa&#8217; Botnet',
      sourceUrl: 'https://example.com/post',
      sourceTitle: 'Example &#38; Co',
      query: null,
      content: 'A &#8216;clean&#8217; captured response.',
      sources: [{ title: 'Example &#38; Co', url: 'https://example.com/post' }],
      capturedAt: new Date('2026-07-31T00:00:00.000Z'),
    })

    expect(markdown).toContain('# ‘Popa’ Botnet')
    expect(markdown).toContain('A ‘clean’ captured response.')
    expect(markdown).toContain('Example & Co')
    expect(markdown).not.toContain('&#8216;')
  })
})
