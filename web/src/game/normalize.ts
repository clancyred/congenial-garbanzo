import { countLetters } from './util'

export function normalizeFishbowlText(input: string): {
  displayText: string
  normalizedText: string
  isValid: boolean
  error: string | null
} {
  const displayText = input.trim()
  if (countLetters(displayText) < 2) {
    return {
      displayText,
      normalizedText: '',
      isValid: false,
      error: 'Each item must contain at least 2 letters.',
    }
  }

  // Duplicate normalization:
  // - case-insensitive
  // - trims and collapses whitespace
  // - ignores punctuation
  const noPunct = displayText
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  const normalizedText = noPunct.toLowerCase().replace(/\s+/g, ' ').trim()

  if (normalizedText.length === 0) {
    return {
      displayText,
      normalizedText: '',
      isValid: false,
      error: 'That item is not valid.',
    }
  }

  return { displayText, normalizedText, isValid: true, error: null }
}

