import type {
  FishbowlItem,
  GameEvent,
  GameState,
  RoundNumber,
  RoundPools,
  ScoresByRound,
  TeamId,
  UndoEntry,
} from './types'
import { normalizeFishbowlText } from './normalize'
import { shuffled } from './shuffle'
import { clampInt, createId, nowEpochMs, otherTeam, roundName } from './util'

export type Action =
  | { type: 'HOST_SET_TEAM_NAME'; teamId: TeamId; name: string }
  | { type: 'HOST_SET_PLAYER_COUNT'; playerCount: number }
  | { type: 'HOST_SET_TIMER'; round: RoundNumber; seconds: number }
  | { type: 'HOST_START_WORD_ENTRY' }
  | {
      type: 'ENTRY_SUBMIT_PLAYER'
      playerName: string
      teamId: TeamId
      items: [string, string, string]
    }
  | { type: 'ENTRY_ACK_HANDOFF' }
  | { type: 'READY_START_ROUND1' }
  | { type: 'HANDOFF_ACK' }
  | { type: 'TURN_START' } // user taps Start Turn
  | { type: 'TURN_SYNC_TIMER'; nowMs: number }
  | { type: 'TURN_GUESSED' }
  | { type: 'TURN_PASSED' }
  | { type: 'TURN_UNDO' }
  | { type: 'TIME_UP_ACK' }
  | { type: 'ROUND_PROCEED' }
  | { type: 'HOST_RESTART_GAME' }
  | { type: 'HOST_RESTART_ROUND' }

function emptyScores(): ScoresByRound {
  return {
    1: { A: 0, B: 0 },
    2: { A: 0, B: 0 },
    3: { A: 0, B: 0 },
  }
}

export function createNewGameState(): GameState {
  return {
    version: 1,
    screen: 'hostSetup',
    teams: {
      A: { id: 'A', name: 'Blue' },
      B: { id: 'B', name: 'Red' },
    },
    playerCount: 8,
    timerSettings: { round1Seconds: 30, round2Seconds: 45, round3Seconds: 20 },
    entryIndex: 0,
    startingTeamRound1: null,
    players: [],
    items: [],
    currentRound: null,
    currentTeamTurn: 'A',
    roundStartTeam: {},
    roundFinisherTeam: {},
    carryoverForNextRound: null,
    pendingCarryoverSecondsThisRound: null,
    pools: null,
    scoresByRound: emptyScores(),
    turnEndEpochMs: null,
    turnDurationSeconds: null,
    timerSecondsRemaining: null,
    undoStack: [],
    events: [],
    lastError: null,
  }
}

function canEditSetup(state: GameState): boolean {
  return state.currentRound === null
}

function clonePools(p: RoundPools): RoundPools {
  return {
    primary: [...p.primary],
    deferred: [...p.deferred],
    currentItemId: p.currentItemId,
  }
}

function cloneScores(scores: ScoresByRound): ScoresByRound {
  return {
    1: { ...scores[1] },
    2: { ...scores[2] },
    3: { ...scores[3] },
  }
}

function addEvent(state: GameState, evt: Omit<GameEvent, 'id'>): GameState {
  return {
    ...state,
    events: [...state.events, { ...evt, id: createId('evt') }],
  }
}

function getDefaultTurnSeconds(state: GameState, round: RoundNumber): number {
  switch (round) {
    case 1:
      return clampInt(state.timerSettings.round1Seconds, 5, 300)
    case 2:
      return clampInt(state.timerSettings.round2Seconds, 5, 300)
    case 3:
      return clampInt(state.timerSettings.round3Seconds, 5, 300)
  }
}

function ensurePoolsReady(state: GameState): GameState {
  if (!state.currentRound) return state
  if (state.pools) return state
  const allIds = state.items.map((it) => it.id)
  const primary = shuffled(allIds)
  return {
    ...state,
    pools: { primary, deferred: [], currentItemId: null },
  }
}

function drawIfNeeded(state: GameState): GameState {
  if (!state.currentRound) return state
  if (!state.pools) return state
  if (state.pools.currentItemId) return state

  let primary = state.pools.primary
  let deferred = state.pools.deferred

  if (primary.length === 0 && deferred.length > 0) {
    primary = shuffled(deferred)
    deferred = []
  }

  if (primary.length === 0) {
    // No remaining items -> round ends
    return state
  }

  const [next, ...rest] = primary
  return {
    ...state,
    pools: {
      primary: rest,
      deferred,
      currentItemId: next ?? null,
    },
  }
}

function isRoundComplete(state: GameState): boolean {
  const p = state.pools
  return !!state.currentRound && !!p && !p.currentItemId && p.primary.length === 0 && p.deferred.length === 0
}

function getItemById(state: GameState, id: string | null): FishbowlItem | null {
  if (!id) return null
  return state.items.find((x) => x.id === id) ?? null
}

function completeRound(state: GameState): GameState {
  if (!state.currentRound) return state
  const round = state.currentRound
  const finisher = state.currentTeamTurn
  const remaining =
    state.turnEndEpochMs != null
      ? Math.max(0, Math.ceil((state.turnEndEpochMs - nowEpochMs()) / 1000))
      : (state.timerSecondsRemaining ?? 0)

  let nextCarryover = state.carryoverForNextRound
  if (round < 3 && remaining > 0) {
    nextCarryover = { seconds: remaining, teamId: finisher }
  } else {
    nextCarryover = null
  }

  let nextState: GameState = {
    ...state,
    screen: 'roundComplete',
    roundFinisherTeam: { ...state.roundFinisherTeam, [round]: finisher },
    carryoverForNextRound: nextCarryover,
    pendingCarryoverSecondsThisRound: null,
    turnEndEpochMs: null,
    turnDurationSeconds: null,
    timerSecondsRemaining: null,
    undoStack: [],
    lastError: null,
  }

  nextState = addEvent(nextState, {
    ts: nowEpochMs(),
    type: 'ROUND_COMPLETED',
    round,
    team: finisher,
    note: `Round ${round} complete`,
  })
  return nextState
}

function applyUndo(state: GameState): GameState {
  const top = state.undoStack[state.undoStack.length - 1]
  if (!top) return { ...state, lastError: 'Nothing to undo.' }
  if (!state.currentRound || top.round !== state.currentRound) {
    return { ...state, lastError: 'Nothing to undo.' }
  }

  const newUndoStack = state.undoStack.slice(0, -1)
  let nextState: GameState = {
    ...state,
    pools: clonePools(top.pools),
    scoresByRound: cloneScores(top.scoresByRound),
    undoStack: newUndoStack,
    lastError: null,
  }

  nextState = addEvent(nextState, {
    ts: nowEpochMs(),
    type: 'UNDO',
    round: state.currentRound,
    team: state.currentTeamTurn,
    wordId: top.wordId,
    wordText: top.wordText,
    pointsDelta: top.pointsDelta ? -top.pointsDelta : 0,
    note: `Undo ${top.kind}`,
  })
  return nextState
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'HOST_SET_TEAM_NAME': {
      if (!canEditSetup(state)) return state
      return {
        ...state,
        teams: {
          ...state.teams,
          [action.teamId]: { ...state.teams[action.teamId], name: action.name },
        },
      }
    }
    case 'HOST_SET_PLAYER_COUNT': {
      if (!canEditSetup(state)) return state
      return { ...state, playerCount: clampInt(action.playerCount, 2, 30) }
    }
    case 'HOST_SET_TIMER': {
      if (!canEditSetup(state)) return state
      const seconds = clampInt(action.seconds, 5, 300)
      const timerSettings = { ...state.timerSettings }
      if (action.round === 1) timerSettings.round1Seconds = seconds
      if (action.round === 2) timerSettings.round2Seconds = seconds
      if (action.round === 3) timerSettings.round3Seconds = seconds
      return { ...state, timerSettings }
    }
    case 'HOST_START_WORD_ENTRY': {
      if (!canEditSetup(state)) return state
      return {
        ...state,
        screen: 'wordEntry',
        entryIndex: 0,
        startingTeamRound1: null,
        players: [],
        items: [],
        pools: null,
        scoresByRound: emptyScores(),
        currentRound: null,
        currentTeamTurn: 'A',
        roundStartTeam: {},
        roundFinisherTeam: {},
        carryoverForNextRound: null,
        pendingCarryoverSecondsThisRound: null,
        turnEndEpochMs: null,
        turnDurationSeconds: null,
        timerSecondsRemaining: null,
        undoStack: [],
        events: [],
        lastError: null,
      }
    }
    case 'ENTRY_SUBMIT_PLAYER': {
      if (state.screen !== 'wordEntry') return state
      const playerName = action.playerName.trim()
      if (!playerName) return { ...state, lastError: 'Please enter a player name.' }
      if (state.entryIndex >= state.playerCount) return state

      const normalizedToExistingText = new Map<string, string>()
      for (const it of state.items) normalizedToExistingText.set(it.normalizedText, it.text)

      const normalizedSeenInThisEntry = new Map<string, number>()
      const newItems: { displayText: string; normalizedText: string }[] = []
      for (let i = 0; i < action.items.length; i++) {
        const raw = action.items[i]!
        const n = normalizeFishbowlText(raw)
        if (!n.isValid) return { ...state, lastError: `Item ${i + 1}: ${n.error}` }

        const existingText = normalizedToExistingText.get(n.normalizedText)
        if (existingText) {
          return {
            ...state,
            lastError: `Item ${i + 1} is a duplicate of an existing entry: "${existingText}".`,
          }
        }

        const prevIdx = normalizedSeenInThisEntry.get(n.normalizedText)
        if (typeof prevIdx === 'number') {
          return {
            ...state,
            lastError: `Item ${i + 1} duplicates Item ${prevIdx + 1}.`,
          }
        }

        normalizedSeenInThisEntry.set(n.normalizedText, i)
        newItems.push({ displayText: n.displayText, normalizedText: n.normalizedText })
      }

      const playerId = createId('player')
      const player = {
        id: playerId,
        name: playerName,
        teamId: action.teamId,
        entryIndex: state.entryIndex,
      }

      const items: FishbowlItem[] = newItems.map((it) => ({
        id: createId('word'),
        text: it.displayText,
        normalizedText: it.normalizedText,
        ownerPlayerId: playerId,
      }))

      const startingTeamRound1 = state.startingTeamRound1 ?? action.teamId
      const nextEntryIndex = state.entryIndex + 1
      const isDone = nextEntryIndex >= state.playerCount

      return {
        ...state,
        players: [...state.players, player],
        items: [...state.items, ...items],
        startingTeamRound1,
        entryIndex: nextEntryIndex,
        screen: isDone ? 'ready' : 'entryHandoff',
        lastError: null,
      }
    }
    case 'ENTRY_ACK_HANDOFF': {
      if (state.screen !== 'entryHandoff') return state
      return { ...state, screen: 'wordEntry', lastError: null }
    }
    case 'READY_START_ROUND1': {
      if (state.screen !== 'ready') return state
      if (state.items.length !== state.playerCount * 3) {
        return { ...state, lastError: 'Incorrect number of items in fishbowl.' }
      }
      const startTeam = state.startingTeamRound1 ?? 'A'
      let nextState: GameState = {
        ...state,
        currentRound: 1,
        currentTeamTurn: startTeam,
        roundStartTeam: { ...state.roundStartTeam, 1: startTeam },
        carryoverForNextRound: null,
        pendingCarryoverSecondsThisRound: null,
        pools: null,
        turnEndEpochMs: null,
        turnDurationSeconds: null,
        timerSecondsRemaining: null,
        undoStack: [],
        screen: 'turnHandoff',
        lastError: null,
      }
      nextState = ensurePoolsReady(nextState)
      nextState = addEvent(nextState, {
        ts: nowEpochMs(),
        type: 'ROUND_STARTED',
        round: 1,
        team: startTeam,
        note: `Round 1 started (${roundName(1)})`,
      })
      return nextState
    }
    case 'HANDOFF_ACK': {
      if (state.screen !== 'turnHandoff') return state
      return { ...state, screen: 'turnStart', lastError: null }
    }
    case 'TURN_START': {
      if (state.screen !== 'turnStart') return state
      if (!state.currentRound) return state

      // Ensure we have a current item ready when turn begins.
      let nextState = ensurePoolsReady(state)
      nextState = drawIfNeeded(nextState)

      // If the round is already empty, complete it (edge case).
      if (isRoundComplete(nextState)) return completeRound(nextState)

      const round = nextState.currentRound as RoundNumber
      const defaultSeconds = getDefaultTurnSeconds(nextState, round)
      const durationSeconds =
        nextState.pendingCarryoverSecondsThisRound && nextState.pendingCarryoverSecondsThisRound > 0
          ? nextState.pendingCarryoverSecondsThisRound
          : defaultSeconds

      const end = nowEpochMs() + durationSeconds * 1000
      nextState = {
        ...nextState,
        screen: 'turnActive',
        turnDurationSeconds: durationSeconds,
        turnEndEpochMs: end,
        timerSecondsRemaining: durationSeconds,
        undoStack: [],
        pendingCarryoverSecondsThisRound: null, // consumed if it existed
        lastError: null,
      }

      nextState = addEvent(nextState, {
        ts: nowEpochMs(),
        type: 'TURN_STARTED',
        round,
        team: nextState.currentTeamTurn,
        note: `Turn started (${durationSeconds}s)`,
      })
      return nextState
    }
    case 'TURN_SYNC_TIMER': {
      if (state.screen !== 'turnActive') return state
      if (!state.turnEndEpochMs) return state
      const remaining = Math.max(0, Math.ceil((state.turnEndEpochMs - action.nowMs) / 1000))
      if (remaining === state.timerSecondsRemaining) return state
      if (remaining > 0) return { ...state, timerSecondsRemaining: remaining }

      // Time's up
      let nextPools = state.pools
      if (state.pools && state.pools.currentItemId) {
        nextPools = {
          ...state.pools,
          primary: shuffled([...state.pools.primary, state.pools.currentItemId]),
          currentItemId: null,
        }
      }

      let nextState: GameState = {
        ...state,
        screen: 'timeUp',
        timerSecondsRemaining: 0,
        turnEndEpochMs: null,
        turnDurationSeconds: null,
        undoStack: [],
        lastError: null,
        pools: nextPools,
      }
      const round: RoundNumber | undefined = state.currentRound ?? undefined
      nextState = addEvent(nextState, {
        ts: nowEpochMs(),
        type: 'TIME_UP',
        round,
        team: state.currentTeamTurn,
        wordId: state.pools?.currentItemId ?? undefined,
        wordText: getItemById(state, state.pools?.currentItemId ?? null)?.text,
        note: 'Time up',
      })
      return nextState
    }
    case 'TURN_PASSED': {
      if (state.screen !== 'turnActive') return state
      if (!state.currentRound || !state.pools?.currentItemId) return state
      const word = getItemById(state, state.pools.currentItemId)
      const undoEntry: UndoEntry = {
        kind: 'WORD_PASSED',
        round: state.currentRound,
        team: state.currentTeamTurn,
        pools: clonePools(state.pools),
        scoresByRound: cloneScores(state.scoresByRound),
        wordId: state.pools.currentItemId,
        wordText: word?.text,
        pointsDelta: 0,
      }

      let nextState: GameState = {
        ...state,
        pools: {
          primary: state.pools.primary,
          deferred: [...state.pools.deferred, state.pools.currentItemId],
          currentItemId: null,
        },
        undoStack: [...state.undoStack, undoEntry].slice(-10),
        lastError: null,
      }
      nextState = drawIfNeeded(nextState)
      nextState = addEvent(nextState, {
        ts: nowEpochMs(),
        type: 'WORD_PASSED',
        round: state.currentRound,
        team: state.currentTeamTurn,
        wordId: undoEntry.wordId,
        wordText: undoEntry.wordText,
        pointsDelta: 0,
      })
      return nextState
    }
    case 'TURN_GUESSED': {
      if (state.screen !== 'turnActive') return state
      if (!state.currentRound || !state.pools?.currentItemId) return state

      const round = state.currentRound
      const wordId = state.pools.currentItemId
      const word = getItemById(state, wordId)

      const undoEntry: UndoEntry = {
        kind: 'WORD_GUESSED',
        round,
        team: state.currentTeamTurn,
        pools: clonePools(state.pools),
        scoresByRound: cloneScores(state.scoresByRound),
        wordId,
        wordText: word?.text,
        pointsDelta: 1,
      }

      const scoresByRound = cloneScores(state.scoresByRound)
      scoresByRound[round][state.currentTeamTurn] += 1

      let nextState: GameState = {
        ...state,
        scoresByRound,
        pools: {
          primary: state.pools.primary,
          deferred: state.pools.deferred,
          currentItemId: null,
        },
        undoStack: [...state.undoStack, undoEntry].slice(-10),
        lastError: null,
      }
      nextState = drawIfNeeded(nextState)

      nextState = addEvent(nextState, {
        ts: nowEpochMs(),
        type: 'WORD_GUESSED',
        round,
        team: state.currentTeamTurn,
        wordId,
        wordText: word?.text,
        pointsDelta: 1,
      })

      // If there are no remaining items after drawing attempt, round completes immediately.
      if (isRoundComplete(nextState)) return completeRound(nextState)
      return nextState
    }
    case 'TURN_UNDO': {
      if (state.screen !== 'turnActive') return state
      return applyUndo(state)
    }
    case 'TIME_UP_ACK': {
      if (state.screen !== 'timeUp') return state
      return {
        ...state,
        screen: 'turnHandoff',
        currentTeamTurn: otherTeam(state.currentTeamTurn),
        lastError: null,
      }
    }
    case 'ROUND_PROCEED': {
      if (state.screen !== 'roundComplete') return state
      if (!state.currentRound) return state
      const round = state.currentRound
      if (round === 3) {
        return {
          ...state,
          screen: 'final',
          lastError: null,
        }
      }

      const nextRound = (round + 1) as RoundNumber
      const starter = state.roundFinisherTeam[round] ?? state.currentTeamTurn
      const carry = state.carryoverForNextRound
      const pendingCarry =
        carry && carry.teamId === starter && carry.seconds > 0 ? carry.seconds : null

      let nextState: GameState = {
        ...state,
        currentRound: nextRound,
        currentTeamTurn: starter,
        roundStartTeam: { ...state.roundStartTeam, [nextRound]: starter },
        carryoverForNextRound: null,
        pendingCarryoverSecondsThisRound: pendingCarry,
        pools: null,
        turnEndEpochMs: null,
        turnDurationSeconds: null,
        timerSecondsRemaining: null,
        undoStack: [],
        screen: 'turnHandoff',
        lastError: null,
      }
      nextState = ensurePoolsReady(nextState)
      nextState = addEvent(nextState, {
        ts: nowEpochMs(),
        type: 'ROUND_STARTED',
        round: nextRound,
        team: starter,
        note: `Round ${nextRound} started (${roundName(nextRound)})`,
      })
      return nextState
    }
    case 'HOST_RESTART_ROUND': {
      // Only when not actively timing
      if (state.screen === 'turnActive') return state
      if (!state.currentRound) return state
      const round = state.currentRound
      const starter = state.roundStartTeam[round] ?? state.currentTeamTurn

      const scoresByRound = cloneScores(state.scoresByRound)
      scoresByRound[round] = { A: 0, B: 0 }

      let nextState: GameState = {
        ...state,
        scoresByRound,
        currentTeamTurn: starter,
        carryoverForNextRound: null,
        pendingCarryoverSecondsThisRound: null,
        pools: null,
        turnEndEpochMs: null,
        turnDurationSeconds: null,
        timerSecondsRemaining: null,
        undoStack: [],
        screen: 'turnHandoff',
        lastError: null,
      }
      nextState = ensurePoolsReady(nextState)
      return nextState
    }
    case 'HOST_RESTART_GAME': {
      return createNewGameState()
    }
    default:
      return state
  }
}

