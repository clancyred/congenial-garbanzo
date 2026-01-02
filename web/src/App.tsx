import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './App.css'
import { playBuzzer, stopBuzzer, unlockAudio } from './game/audio'
import { normalizeFishbowlText } from './game/normalize'
import { createNewGameState, gameReducer } from './game/reducer'
import type { GameState, RoundNumber, TeamId } from './game/types'
import { clearSavedGame, isInProgressGame, loadSavedGame, saveGame } from './game/storage'
import { useScreenWakeLock } from './game/wakeLock'
import { roundName } from './game/util'

const QUICK_PLAYER_NAMES = [
  'Dad',
  'Mom',
  'Scarlett',
  'Drake',
  'Bridget',
  'Luke',
  'Jack',
  'Audrey',
  'Ryan',
] as const

const OBJECT_PICTURE_PLAYERS = new Set<string>(['Ryan', 'Audrey'])

// Curated "everyday objects" -> emoji picture (offline friendly).
// Keyed by Fishbowl normalizedText (lowercase, punctuation removed, spaces collapsed).
const OBJECT_EMOJI_BY_NORMALIZED: Record<string, string> = {
  // kitchen / home
  spoon: '🥄',
  fork: '🍴',
  knife: '🔪',
  plate: '🍽️',
  cup: '🥤',
  mug: '☕',
  bottle: '🍼',
  'water bottle': '🧴',
  'paper towel': '🧻',
  'trash can': '🗑️',
  'soap': '🧼',
  'toothbrush': '🪥',
  towel: '🧺',
  // keys / tech
  keys: '🔑',
  key: '🔑',
  phone: '📱',
  'cell phone': '📱',
  'remote': '📺',
  'tv remote': '📺',
  computer: '💻',
  laptop: '💻',
  charger: '🔌',
  headphones: '🎧',
  // daily carry
  wallet: '👛',
  purse: '👜',
  backpack: '🎒',
  umbrella: '☂️',
  // misc
  book: '📘',
  pen: '🖊️',
  pencil: '✏️',
  scissors: '✂️',
  chair: '🪑',
  couch: '🛋️',
  bed: '🛏️',
  mirror: '🪞',
  clock: '⏰',
  lamp: '💡',
  camera: '📷',
  sunglasses: '🕶️',
}

function totalScore(s: GameState['scoresByRound'], team: TeamId) {
  return s[1][team] + s[2][team] + s[3][team]
}

function defaultTimerForRound(state: GameState, round: RoundNumber): number {
  if (round === 1) return state.timerSettings.round1Seconds
  if (round === 2) return state.timerSettings.round2Seconds
  return state.timerSettings.round3Seconds
}

function App() {
  const [state, setState] = useState<GameState>(() => createNewGameState())
  const [resumeCandidate, setResumeCandidate] = useState<GameState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hostMenuOpen, setHostMenuOpen] = useState(false)
  const [privacyBlur, setPrivacyBlur] = useState(false)
  const buzzerPlayedRef = useRef(false)

  const dispatch = (action: Parameters<typeof gameReducer>[1]) => {
    setState((prev) => gameReducer(prev, action))
  }

  // Load saved game (if any) and offer Resume.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const saved = await loadSavedGame()
      if (cancelled) return
      if (saved?.state && isInProgressGame(saved.state)) setResumeCandidate(saved.state)
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist on every transition while a game is in progress.
  useEffect(() => {
    if (!isInProgressGame(state)) {
      void clearSavedGame()
      return
    }
    void saveGame(state)
  }, [state])

  // Timer sync for active turns (epoch-based, resilient to backgrounding).
  useEffect(() => {
    if (state.screen !== 'turnActive') return
    const id = window.setInterval(() => {
      dispatch({ type: 'TURN_SYNC_TIMER', nowMs: Date.now() })
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, state.turnEndEpochMs])

  // Privacy blur when app backgrounds (word entry + gameplay).
  useEffect(() => {
    const onVis = () => setPrivacyBlur(document.visibilityState !== 'visible')
    document.addEventListener('visibilitychange', onVis)
    onVis()
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Wake lock during active turns (best-effort).
  const wake = useScreenWakeLock(state.screen === 'turnActive')

  // Time's up buzzer: play ~2s and stop on acknowledgement or screen change.
  useEffect(() => {
    if (state.screen === 'timeUp') {
      if (!buzzerPlayedRef.current) {
        buzzerPlayedRef.current = true
        playBuzzer(2000)
      }
      return
    }
    buzzerPlayedRef.current = false
    stopBuzzer()
  }, [state.screen])

  const canOpenHostMenu = state.screen !== 'turnActive'

  const title = useMemo(() => {
    if (!state.currentRound) return 'Fishbowl'
    return `Round ${state.currentRound}: ${roundName(state.currentRound)}`
  }, [state.currentRound])

  if (isLoading) {
    return (
      <div className="screen">
        <div className="card">
          <div className="h1">Fishbowl</div>
          <div className="muted">Loading…</div>
        </div>
      </div>
    )
  }

  if (resumeCandidate) {
    return (
      <div className="screen">
        <div className="card">
          <div className="h1">Resume game?</div>
          <div className="muted" style={{ marginTop: 8 }}>
            An in-progress game was found on this iPad.
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn primary"
              onClick={() => {
                setState(resumeCandidate)
                setResumeCandidate(null)
              }}
            >
              Resume
            </button>
            <button
              className="btn"
              onClick={() => {
                void clearSavedGame()
                setState(createNewGameState())
                setResumeCandidate(null)
              }}
            >
              New game
            </button>
          </div>
        </div>
      </div>
    )
  }

  const Header = (
    <div className="topbar">
      <div className="topbarTitle">
        <div className="topbarTitleMain">{title}</div>
        <div className="topbarTitleSub">
          {state.currentRound ? `${state.teams.A.name} vs ${state.teams.B.name}` : 'Offline iPad PWA'}
        </div>
      </div>
      <div className="topbarActions">
        {canOpenHostMenu && (
          <button className="btn small" onClick={() => setHostMenuOpen(true)}>
            Host
          </button>
        )}
      </div>
    </div>
  )

  const ErrorBanner =
    state.lastError && state.screen !== 'timeUp' ? (
      <div className="error" role="alert">
        {state.lastError}
      </div>
    ) : null

  const HostMenu = hostMenuOpen ? (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="h2">Host menu</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Available only when not in an active timed turn.
        </div>

        <div className="section" style={{ marginTop: 14 }}>
          <div className="h3">Restart</div>
          <div className="row">
            <button
              className="btn danger"
              onClick={() => {
                const ok = window.confirm('Restart the entire game? This clears all entered words and scores.')
                if (!ok) return
                stopBuzzer()
                void clearSavedGame()
                dispatch({ type: 'HOST_RESTART_GAME' })
                setHostMenuOpen(false)
              }}
            >
              Restart game
            </button>
            <button
              className="btn"
              disabled={!state.currentRound}
              onClick={() => {
                const ok = window.confirm('Restart the current round? This resets the round score and reshuffles all words.')
                if (!ok) return
                dispatch({ type: 'HOST_RESTART_ROUND' })
                setHostMenuOpen(false)
              }}
            >
              Restart round
            </button>
          </div>
        </div>

        <div className="section" style={{ marginTop: 14 }}>
          <div className="h3">Setup (pre-game only)</div>
          {state.currentRound !== null ? (
            <div className="muted">Team names and timers are locked after the game starts.</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="grid2">
                <label className="field">
                  <div className="label">Team A</div>
                  <input
                    value={state.teams.A.name}
                    onChange={(e) => dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'A', name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <div className="label">Team B</div>
                  <input
                    value={state.teams.B.name}
                    onChange={(e) => dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'B', name: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid3" style={{ marginTop: 10 }}>
                <label className="field">
                  <div className="label">R1</div>
                  <input
                    inputMode="numeric"
                    value={state.timerSettings.round1Seconds}
                    onChange={(e) => dispatch({ type: 'HOST_SET_TIMER', round: 1, seconds: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <div className="label">R2</div>
                  <input
                    inputMode="numeric"
                    value={state.timerSettings.round2Seconds}
                    onChange={(e) => dispatch({ type: 'HOST_SET_TIMER', round: 2, seconds: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <div className="label">R3</div>
                  <input
                    inputMode="numeric"
                    value={state.timerSettings.round3Seconds}
                    onChange={(e) => dispatch({ type: 'HOST_SET_TIMER', round: 3, seconds: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setHostMenuOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null

  const PrivacyOverlay = privacyBlur ? <div className="privacyOverlay">Privacy mode</div> : null

  // Screens
  let Body: ReactNode

  if (state.screen === 'hostSetup') {
    Body = (
      <div className="screenBody">
        {ErrorBanner}
        <div className="card">
          <div className="h1">Host setup</div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field">
              <div className="label">Team A</div>
              <input
                value={state.teams.A.name}
                onChange={(e) => dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'A', name: e.target.value })}
                placeholder="Blue"
              />
            </label>
            <label className="field">
              <div className="label">Team B</div>
              <input
                value={state.teams.B.name}
                onChange={(e) => dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'B', name: e.target.value })}
                placeholder="Red"
              />
            </label>
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field">
              <div className="label">Players (N)</div>
              <div className="stepper">
                <button
                  type="button"
                  className="stepperBtn"
                  onClick={() => dispatch({ type: 'HOST_SET_PLAYER_COUNT', playerCount: state.playerCount - 1 })}
                  aria-label="Decrease players"
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  value={state.playerCount}
                  onChange={(e) => dispatch({ type: 'HOST_SET_PLAYER_COUNT', playerCount: Number(e.target.value) })}
                  aria-label="Number of players"
                />
                <button
                  type="button"
                  className="stepperBtn"
                  onClick={() => dispatch({ type: 'HOST_SET_PLAYER_COUNT', playerCount: state.playerCount + 1 })}
                  aria-label="Increase players"
                >
                  +
                </button>
              </div>
              <div className="hint">Each player enters exactly 3 items. Total = {state.playerCount * 3}.</div>
            </label>
            <div className="cardSub">
              <div className="label">Suggested defaults</div>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn"
                  onClick={() => {
                    dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'A', name: 'Blue' })
                    dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'B', name: 'Red' })
                  }}
                >
                  Blue / Red
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'A', name: 'Cats' })
                    dispatch({ type: 'HOST_SET_TEAM_NAME', teamId: 'B', name: 'Dogs' })
                  }}
                >
                  Cats / Dogs
                </button>
              </div>
            </div>
          </div>

          <div className="section" style={{ marginTop: 14 }}>
            <div className="h2">Timers (pre-game)</div>
            <div className="grid3" style={{ marginTop: 10 }}>
              <label className="field">
                <div className="label">Round 1</div>
                <input
                  inputMode="numeric"
                  value={state.timerSettings.round1Seconds}
                  onChange={(e) => dispatch({ type: 'HOST_SET_TIMER', round: 1, seconds: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <div className="label">Round 2</div>
                <input
                  inputMode="numeric"
                  value={state.timerSettings.round2Seconds}
                  onChange={(e) => dispatch({ type: 'HOST_SET_TIMER', round: 2, seconds: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <div className="label">Round 3</div>
                <input
                  inputMode="numeric"
                  value={state.timerSettings.round3Seconds}
                  onChange={(e) => dispatch({ type: 'HOST_SET_TIMER', round: 3, seconds: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => dispatch({ type: 'HOST_START_WORD_ENTRY' })}>
              Start word entry
            </button>
          </div>
        </div>
      </div>
    )
  } else if (state.screen === 'wordEntry') {
    const defaultTeam: TeamId = state.entryIndex % 2 === 0 ? 'A' : 'B'
    Body = <WordEntryScreen key={state.entryIndex} state={state} defaultTeam={defaultTeam} dispatch={dispatch} />
  } else if (state.screen === 'entryHandoff') {
    const nextNum = state.entryIndex + 1
    Body = (
      <div className="screenBody center">
        {ErrorBanner}
        <div className="card big">
          <div className="h1">Pass to next player</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Player {nextNum} of {state.playerCount}
          </div>
          <button className="btn primary huge" style={{ marginTop: 18 }} onClick={() => dispatch({ type: 'ENTRY_ACK_HANDOFF' })}>
            Tap to continue
          </button>
        </div>
      </div>
    )
  } else if (state.screen === 'ready') {
    const startTeam = state.startingTeamRound1 ?? (state.players[0]?.teamId ?? 'A')
    Body = (
      <div className="screenBody">
        {ErrorBanner}
        <div className="card">
          <div className="h1">Ready to play</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Fishbowl contains <b>{state.items.length}</b> items.
          </div>
          <div className="scoreboard" style={{ marginTop: 14 }}>
            <div className="scoreTeam">
              <div className="scoreName">{state.teams.A.name}</div>
            </div>
            <div className="scoreTeam">
              <div className="scoreName">{state.teams.B.name}</div>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 12 }}>
            Round 1 starts with <b>{state.teams[startTeam].name}</b>.
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => dispatch({ type: 'READY_START_ROUND1' })}>
              Start Round 1
            </button>
          </div>
        </div>
      </div>
    )
  } else if (state.screen === 'turnHandoff') {
    Body = (
      <div className="screenBody center">
        {ErrorBanner}
        <div className="card big">
          <div className="h1">Pass to {state.teams[state.currentTeamTurn].name}</div>
          <button className="btn primary huge" style={{ marginTop: 18 }} onClick={() => dispatch({ type: 'HANDOFF_ACK' })}>
            Tap when ready
          </button>
        </div>
      </div>
    )
  } else if (state.screen === 'turnStart') {
    const round = state.currentRound as RoundNumber
    const seconds = state.pendingCarryoverSecondsThisRound ?? defaultTimerForRound(state, round)
    Body = (
      <div className="screenBody center">
        {ErrorBanner}
        <div className="card big">
          <div className="h2">
            Round {round}: {roundName(round)}
          </div>
          <div className="h1" style={{ marginTop: 10 }}>
            {state.teams[state.currentTeamTurn].name}
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Timer: <b>{seconds}</b> seconds
            {state.pendingCarryoverSecondsThisRound ? <span> (carryover)</span> : null}
          </div>

          <button
            className="btn primary huge"
            style={{ marginTop: 18 }}
            onClick={async () => {
              await unlockAudio()
              dispatch({ type: 'TURN_START' })
            }}
          >
            Start turn
          </button>
        </div>
      </div>
    )
  } else if (state.screen === 'turnActive') {
    Body = <TurnActiveScreen state={state} dispatch={dispatch} wake={wake} />
  } else if (state.screen === 'timeUp') {
    Body = (
      <div className="screenBody center">
        <div className="card big dangerCard">
          <div className="h1">Time’s Up</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Round {state.currentRound}: {state.currentRound ? roundName(state.currentRound) : ''}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {state.teams[state.currentTeamTurn].name}
          </div>
          <button
            className="btn primary huge"
            style={{ marginTop: 18 }}
            onClick={() => {
              stopBuzzer()
              dispatch({ type: 'TIME_UP_ACK' })
            }}
          >
            Tap to continue
          </button>
        </div>
      </div>
    )
  } else if (state.screen === 'roundComplete') {
    const round = state.currentRound as RoundNumber
    const carry = state.carryoverForNextRound
    Body = (
      <div className="screenBody">
        <div className="card">
          <div className="h1">Round {round} complete</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Score so far
          </div>
          <div className="scoreboard" style={{ marginTop: 10 }}>
            <div className="scoreTeam">
              <div className="scoreName">{state.teams.A.name}</div>
              <div className="scoreValue">{totalScore(state.scoresByRound, 'A')}</div>
            </div>
            <div className="scoreTeam">
              <div className="scoreName">{state.teams.B.name}</div>
              <div className="scoreValue">{totalScore(state.scoresByRound, 'B')}</div>
            </div>
          </div>

          {carry ? (
            <div className="hint" style={{ marginTop: 12 }}>
              Next round starts with <b>{carry.seconds}</b> seconds (carryover) for <b>{state.teams[carry.teamId].name}</b>.
            </div>
          ) : null}

          <div className="section" style={{ marginTop: 14 }}>
            <div className="h2">Fishbowl items</div>
            <div className="list" style={{ marginTop: 8 }}>
              {state.items.map((it) => (
                <div key={it.id} className="listItem">
                  {it.text}
                </div>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => dispatch({ type: 'ROUND_PROCEED' })}>
              {round === 3 ? 'View results' : 'Start next round'}
            </button>
          </div>
        </div>
      </div>
    )
  } else {
    // Final results
    const aTotal = totalScore(state.scoresByRound, 'A')
    const bTotal = totalScore(state.scoresByRound, 'B')
    const winner =
      aTotal === bTotal ? 'Tie' : aTotal > bTotal ? state.teams.A.name : state.teams.B.name

    const playerNameById = new Map(state.players.map((p) => [p.id, p.name]))

    Body = (
      <div className="screenBody">
        <div className="card">
          <div className="h1">{winner === 'Tie' ? 'Tie game' : `${winner} wins`}</div>
          <div className="scoreboard" style={{ marginTop: 12 }}>
            <div className="scoreTeam">
              <div className="scoreName">{state.teams.A.name}</div>
              <div className="scoreValue">{aTotal}</div>
            </div>
            <div className="scoreTeam">
              <div className="scoreName">{state.teams.B.name}</div>
              <div className="scoreValue">{bTotal}</div>
            </div>
          </div>

          <div className="section" style={{ marginTop: 14 }}>
            <div className="h2">By round</div>
            <div className="table" style={{ marginTop: 8 }}>
              {[1, 2, 3].map((r) => (
                <div key={r} className="tableRow">
                  <div className="tableCell">Round {r}</div>
                  <div className="tableCell">
                    {state.teams.A.name}: {state.scoresByRound[r as RoundNumber].A}
                  </div>
                  <div className="tableCell">
                    {state.teams.B.name}: {state.scoresByRound[r as RoundNumber].B}
                  </div>
                  <div className="tableCell muted">{roundName(r as RoundNumber)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section" style={{ marginTop: 14 }}>
            <div className="h2">Ownership</div>
            <div className="list" style={{ marginTop: 8 }}>
              {state.items.map((it) => (
                <div key={it.id} className="listItem">
                  <div className="listMain">{it.text}</div>
                  <div className="listSub">entered by {playerNameById.get(it.ownerPlayerId) ?? 'Unknown'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section" style={{ marginTop: 14 }}>
            <div className="h2">Event log</div>
            <div className="list" style={{ marginTop: 8 }}>
              {state.events.map((e) => (
                <div key={e.id} className="listItem">
                  <div className="listMain">
                    <b>{new Date(e.ts).toLocaleTimeString()}</b> — {e.type}
                  </div>
                  <div className="listSub">
                    {e.round ? `R${e.round}` : ''} {e.team ? ` • ${state.teams[e.team].name}` : ''}{' '}
                    {e.wordText ? ` • ${e.wordText}` : ''}{' '}
                    {typeof e.pointsDelta === 'number' && e.pointsDelta !== 0 ? ` • ${e.pointsDelta > 0 ? '+' : ''}${e.pointsDelta}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn primary"
              onClick={() => {
                stopBuzzer()
                void clearSavedGame()
                dispatch({ type: 'HOST_RESTART_GAME' })
              }}
            >
              New game
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {Header}
      {Body}
      {HostMenu}
      {PrivacyOverlay}
    </div>
  )
}

function WordEntryScreen({
  state,
  defaultTeam,
  dispatch,
}: {
  state: GameState
  defaultTeam: TeamId
  dispatch: (a: Parameters<typeof gameReducer>[1]) => void
}) {
  const [playerName, setPlayerName] = useState('')
  const [teamId, setTeamId] = useState<TeamId>(defaultTeam)
  const [w1, setW1] = useState('')
  const [w2, setW2] = useState('')
  const [w3, setW3] = useState('')
  const [triedSubmit, setTriedSubmit] = useState(false)

  const existingNormalizedToText = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of state.items) m.set(it.normalizedText, it.text)
    return m
  }, [state.items])

  const entryValidation = useMemo(() => {
    const raw = [w1, w2, w3] as const
    const errors: Array<string | null> = [null, null, null]
    const normalized: Array<string | null> = [null, null, null]

    for (let i = 0; i < raw.length; i++) {
      const input = raw[i]!.trim()
      if (!input) {
        errors[i] = triedSubmit ? 'Required.' : null
        continue
      }
      const n = normalizeFishbowlText(raw[i]!)
      if (!n.isValid) {
        errors[i] = n.error
        continue
      }
      normalized[i] = n.normalizedText

      const existingText = existingNormalizedToText.get(n.normalizedText)
      if (existingText) {
        errors[i] = `Duplicate: already entered (“${existingText}”).`
      }
    }

    // Detect duplicates within this player's 3 (only after basic normalization is available)
    const firstIndexByNorm = new Map<string, number>()
    for (let i = 0; i < normalized.length; i++) {
      const norm = normalized[i]
      if (!norm) continue
      const first = firstIndexByNorm.get(norm)
      if (typeof first === 'number') {
        errors[i] = `Duplicate: matches Item ${first + 1}.`
      } else {
        firstIndexByNorm.set(norm, i)
      }
    }

    const canSubmit =
      playerName.trim().length > 0 &&
      errors.every((e) => e === null) &&
      raw.every((v) => v.trim().length > 0)

    return { errors: errors as [string | null, string | null, string | null], canSubmit }
  }, [existingNormalizedToText, playerName, triedSubmit, w1, w2, w3])

  return (
    <div className="screenBody">
      {state.lastError ? (
        <div className="error" role="alert">
          {state.lastError}
        </div>
      ) : null}
      <div className="card">
        <div className="h1">
          Word entry ({state.entryIndex + 1}/{state.playerCount})
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Enter exactly 3 items. Duplicates are blocked across the whole fishbowl.
        </div>

        <div className="grid2" style={{ marginTop: 12 }}>
          <label className="field">
            <div className="label">Player name</div>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Name" />
            <div className="fieldNote" style={{ marginTop: 10 }}>
              <div className="label" style={{ marginBottom: 8 }}>
                Quick pick
              </div>
              <div className="chips">
                {QUICK_PLAYER_NAMES.map((n) => (
                  <button key={n} type="button" className="chip" onClick={() => setPlayerName(n)}>
                    {n}
                  </button>
                ))}
                <button type="button" className="chip subtle" onClick={() => setPlayerName('')}>
                  Clear
                </button>
              </div>
            </div>
          </label>
          <div className="field">
            <div className="label">Team</div>
            <div className="segmented">
              <button className={`seg ${teamId === 'A' ? 'active' : ''}`} onClick={() => setTeamId('A')} type="button">
                {state.teams.A.name}
              </button>
              <button className={`seg ${teamId === 'B' ? 'active' : ''}`} onClick={() => setTeamId('B')} type="button">
                {state.teams.B.name}
              </button>
            </div>
          </div>
        </div>

        <div className="section" style={{ marginTop: 14 }}>
          <div className="h2">Your 3 items</div>
          <div className="grid1" style={{ marginTop: 10 }}>
            <label className="field">
              <div className="label">Item 1</div>
              <input
                className={entryValidation.errors[0] ? 'inputError' : ''}
                value={w1}
                onChange={(e) => setW1(e.target.value)}
                placeholder="e.g., Spider-Man"
              />
              {entryValidation.errors[0] ? <div className="fieldNote error">{entryValidation.errors[0]}</div> : null}
            </label>
            <label className="field">
              <div className="label">Item 2</div>
              <input
                className={entryValidation.errors[1] ? 'inputError' : ''}
                value={w2}
                onChange={(e) => setW2(e.target.value)}
                placeholder="e.g., New York City"
              />
              {entryValidation.errors[1] ? <div className="fieldNote error">{entryValidation.errors[1]}</div> : null}
            </label>
            <label className="field">
              <div className="label">Item 3</div>
              <input
                className={entryValidation.errors[2] ? 'inputError' : ''}
                value={w3}
                onChange={(e) => setW3(e.target.value)}
                placeholder="e.g., Coffee"
              />
              {entryValidation.errors[2] ? <div className="fieldNote error">{entryValidation.errors[2]}</div> : null}
            </label>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            disabled={!entryValidation.canSubmit}
            onClick={() => {
              setTriedSubmit(true)
              if (!entryValidation.canSubmit) return
              dispatch({
                type: 'ENTRY_SUBMIT_PLAYER',
                playerName,
                teamId,
                items: [w1, w2, w3],
              })
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function TurnActiveScreen({
  state,
  dispatch,
  wake,
}: {
  state: GameState
  dispatch: (a: Parameters<typeof gameReducer>[1]) => void
  wake: ReturnType<typeof useScreenWakeLock>
}) {
  const [revealed, setRevealed] = useState(false)
  const [pressed, setPressed] = useState<'guess' | 'pass' | 'undo' | null>(null)
  const pressedTimeoutRef = useRef<number | null>(null)
  const currentWord = useMemo(() => {
    const id = state.pools?.currentItemId
    if (!id) return null
    return state.items.find((x) => x.id === id) ?? null
  }, [state.items, state.pools?.currentItemId])

  const objectEmoji = useMemo(() => {
    if (!currentWord) return null
    const ownerName = state.players.find((p) => p.id === currentWord.ownerPlayerId)?.name ?? ''
    if (!OBJECT_PICTURE_PLAYERS.has(ownerName)) return null
    return OBJECT_EMOJI_BY_NORMALIZED[currentWord.normalizedText] ?? null
  }, [currentWord, state.players])

  const round = state.currentRound as RoundNumber
  const remaining = state.timerSecondsRemaining ?? 0

  const clearPressedTimer = () => {
    if (pressedTimeoutRef.current != null) {
      window.clearTimeout(pressedTimeoutRef.current)
      pressedTimeoutRef.current = null
    }
  }

  const pressStart = (k: 'guess' | 'pass' | 'undo') => () => {
    clearPressedTimer()
    setPressed(k)
  }

  const pressEnd = () => {
    // keep pressed state unless click handler sets a flash
    setPressed(null)
  }

  const flashPress = (k: 'guess' | 'pass' | 'undo') => {
    clearPressedTimer()
    setPressed(k)
    pressedTimeoutRef.current = window.setTimeout(() => setPressed(null), 180)
  }

  return (
    <div className="screenBody">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="h2">
            {state.teams[state.currentTeamTurn].name} — Round {round}
          </div>
          <div className="timer" aria-live="polite">
            {remaining}s
          </div>
        </div>

        {wake.showWorkaround ? (
          <div className="hint" style={{ marginTop: 10 }}>
            To prevent the screen from dimming: temporarily set iPad <b>Auto-Lock</b> to <b>Never</b>, or use <b>Guided Access</b>.
          </div>
        ) : null}

        <div
          className={`wordCard ${revealed ? 'revealed' : ''}`}
          style={{ marginTop: 14 }}
          onPointerDown={() => setRevealed(true)}
          onPointerUp={() => setRevealed(false)}
          onPointerCancel={() => setRevealed(false)}
          onPointerLeave={() => setRevealed(false)}
        >
          {revealed ? (
            <div className="wordRow">
              {objectEmoji ? <div className="wordEmoji" aria-hidden="true">{objectEmoji}</div> : null}
              <div className="wordText">{currentWord?.text ?? '—'}</div>
            </div>
          ) : (
            <div className="wordHidden">
              <div className="wordHiddenMain">Press and hold to reveal</div>
              <div className="wordHiddenSub">Release to hide immediately</div>
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button
            className={`btn primary ${pressed === 'guess' ? 'pressed' : ''}`}
            onTouchStart={pressStart('guess')}
            onTouchEnd={pressEnd}
            onTouchCancel={pressEnd}
            onMouseDown={pressStart('guess')}
            onMouseUp={pressEnd}
            onMouseLeave={pressEnd}
            onPointerDown={pressStart('guess')}
            onPointerUp={pressEnd}
            onPointerCancel={pressEnd}
            onPointerLeave={pressEnd}
            onClick={() => {
              flashPress('guess')
              dispatch({ type: 'TURN_GUESSED' })
            }}
            disabled={!currentWord}
          >
            Guessed
          </button>
          <button
            className={`btn ${pressed === 'pass' ? 'pressed' : ''}`}
            onTouchStart={pressStart('pass')}
            onTouchEnd={pressEnd}
            onTouchCancel={pressEnd}
            onMouseDown={pressStart('pass')}
            onMouseUp={pressEnd}
            onMouseLeave={pressEnd}
            onPointerDown={pressStart('pass')}
            onPointerUp={pressEnd}
            onPointerCancel={pressEnd}
            onPointerLeave={pressEnd}
            onClick={() => {
              flashPress('pass')
              dispatch({ type: 'TURN_PASSED' })
            }}
            disabled={!currentWord}
          >
            Pass
          </button>
          <button
            className={`btn ${pressed === 'undo' ? 'pressed' : ''}`}
            onTouchStart={pressStart('undo')}
            onTouchEnd={pressEnd}
            onTouchCancel={pressEnd}
            onMouseDown={pressStart('undo')}
            onMouseUp={pressEnd}
            onMouseLeave={pressEnd}
            onPointerDown={pressStart('undo')}
            onPointerUp={pressEnd}
            onPointerCancel={pressEnd}
            onPointerLeave={pressEnd}
            onClick={() => {
              flashPress('undo')
              dispatch({ type: 'TURN_UNDO' })
            }}
          >
            Undo
          </button>
        </div>

        <div className="hint" style={{ marginTop: 12 }}>
          Passing defers an item until all unpassed items are consumed, then passed items reshuffle.
        </div>
      </div>
    </div>
  )
}

export default App
