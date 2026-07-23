import { describe, expect, it } from 'vitest'

import {
  formatOrganizationPercentage,
  formatOrganizationSuggestionKind,
  organizationSuggestionTone,
} from './organization-suggestion-presentation'

describe('organization suggestion presentation helpers', () => {
  it('uses clear labels for known organization signal types', () => {
    expect(formatOrganizationSuggestionKind('review_duplicate')).toBe('Duplicate review')
    expect(formatOrganizationSuggestionKind('complete_metadata')).toBe('Metadata review')
    expect(formatOrganizationSuggestionKind('unknown_signal')).toBe('Organization review')
  })

  it('formats normalized scores as whole percentages', () => {
    expect(formatOrganizationPercentage(0)).toBe('0%')
    expect(formatOrganizationPercentage(0.725)).toBe('73%')
    expect(formatOrganizationPercentage(1)).toBe('100%')
  })

  it('assigns restrained priority tones at the review boundaries', () => {
    expect(organizationSuggestionTone(0.8)).toBe('high')
    expect(organizationSuggestionTone(0.6)).toBe('medium')
    expect(organizationSuggestionTone(0.59)).toBe('low')
  })
})
