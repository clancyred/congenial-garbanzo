import type { RoundNumber, TeamId } from './types'

export function otherTeam(teamId: TeamId): TeamId {
  return teamId === 'A' ? 'B' : 'A'
}

export function roundName(round: RoundNumber): string {
  switch (round) {
    case 1:
      return 'Describe'
    case 2:
      return 'Charades'
    case 3:
      return 'One-word clue'
  }
}

export function nowEpochMs(): number {
  return Date.now()
}

export function createId(prefix: string): string {
  const anyCrypto = globalThis.crypto as Crypto | undefined
  if (anyCrypto?.randomUUID) return `${prefix}_${anyCrypto.randomUUID()}`
  // Fallback: 16 bytes -> hex
  const bytes = new Uint8Array(16)
  anyCrypto?.getRandomValues?.(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${hex || `${Math.random()}`.replace('.', '')}`
}

export function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export function countLetters(s: string): number {
  const m = s.match(/[A-Za-z]/g)
  return m ? m.length : 0
}

