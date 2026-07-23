import { describe, expect, it } from 'vitest'

import {
  formatRetrievalTraceDuration,
  formatRetrievalTracePolicy,
  formatRetrievalTraceStatus,
  RETRIEVAL_RETENTION_DAY_OPTIONS,
  RETRIEVAL_RETENTION_LIMIT_OPTIONS,
  RETRIEVAL_TRACE_PAGE_SIZE,
} from './retrieval-trace'

describe('retrieval trace presentation helpers', () => {
  it('uses bounded page and retention options', () => {
    expect(RETRIEVAL_TRACE_PAGE_SIZE).toBe(20)
    expect(RETRIEVAL_RETENTION_DAY_OPTIONS).toEqual([7, 30, 90, 180, 365])
    expect(RETRIEVAL_RETENTION_LIMIT_OPTIONS).toEqual([25, 100, 250, 500, 1000])
  })

  it('formats safe policy and status labels', () => {
    expect(formatRetrievalTracePolicy('vault_hybrid')).toBe('Vault hybrid')
    expect(formatRetrievalTracePolicy('no_retrieval')).toBe('No retrieval')
    expect(formatRetrievalTraceStatus('started')).toBe('In progress')
    expect(formatRetrievalTraceStatus('failed')).toBe('Failed')
  })

  it('formats pending and completed durations', () => {
    expect(formatRetrievalTraceDuration(null)).toBe('Pending')
    expect(formatRetrievalTraceDuration(625)).toBe('625 ms')
    expect(formatRetrievalTraceDuration(1_250)).toBe('1.3 s')
  })
})
