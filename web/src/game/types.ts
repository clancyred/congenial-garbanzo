export type TeamId = 'A' | 'B'
export type RoundNumber = 1 | 2 | 3

export type Screen =
  | 'resume'
  | 'hostSetup'
  | 'wordEntry'
  | 'entryHandoff'
  | 'ready'
  | 'turnHandoff'
  | 'turnStart'
  | 'turnActive'
  | 'timeUp'
  | 'roundComplete'
  | 'final'

export type EventType =
  | 'ROUND_STARTED'
  | 'TURN_STARTED'
  | 'WORD_GUESSED'
  | 'WORD_PASSED'
  | 'UNDO'
  | 'TIME_UP'
  | 'ROUND_COMPLETED'

export interface Team {
  id: TeamId
  name: string
}

export interface Player {
  id: string
  name: string
  teamId: TeamId
  entryIndex: number
}

export interface FishbowlItem {
  id: string
  text: string
  normalizedText: string
  ownerPlayerId: string
}

export interface TimerSettings {
  round1Seconds: number
  round2Seconds: number
  round3Seconds: number
}

export interface Carryover {
  seconds: number
  teamId: TeamId
}

export interface RoundPools {
  primary: string[]
  deferred: string[]
  currentItemId: string | null
}

export interface RoundScores {
  A: number
  B: number
}

export interface ScoresByRound {
  1: RoundScores
  2: RoundScores
  3: RoundScores
}

export interface GameEvent {
  id: string
  ts: number // epoch ms
  type: EventType
  round?: RoundNumber
  team?: TeamId
  wordId?: string
  wordText?: string
  pointsDelta?: number
  note?: string
}

export type UndoKind = 'WORD_GUESSED' | 'WORD_PASSED'

export interface UndoEntry {
  kind: UndoKind
  round: RoundNumber
  team: TeamId
  pools: RoundPools
  scoresByRound: ScoresByRound
  // The word associated with the undone action (for debugging / event log note)
  wordId?: string
  wordText?: string
  pointsDelta?: number
}

export interface GameState {
  version: 1
  screen: Screen

  // Host setup / game config
  teams: Record<TeamId, Team>
  playerCount: number
  timerSettings: TimerSettings

  // Word entry
  entryIndex: number // 0..playerCount-1
  startingTeamRound1: TeamId | null

  // Entities
  players: Player[]
  items: FishbowlItem[]

  // Gameplay
  currentRound: RoundNumber | null
  currentTeamTurn: TeamId
  roundStartTeam: Partial<Record<RoundNumber, TeamId>>
  roundFinisherTeam: Partial<Record<RoundNumber, TeamId>>
  carryoverForNextRound: Carryover | null
  pendingCarryoverSecondsThisRound: number | null

  pools: RoundPools | null
  scoresByRound: ScoresByRound

  // Timer (monotonic-ish via epoch timestamps; remaining derived and persisted)
  turnEndEpochMs: number | null
  turnDurationSeconds: number | null
  timerSecondsRemaining: number | null

  // Undo stack: last actions (usually depth 1; we keep a small stack)
  undoStack: UndoEntry[]

  // Append-only log
  events: GameEvent[]

  // UI-only / validation messaging (persisted to support resume UX)
  lastError: string | null
}

