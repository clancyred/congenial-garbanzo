# Fishbowl (iPad PWA) — Product & Functional Specification
Last updated: 2026-01-01

## 1) Overview
Fishbowl is a pass-and-play party game for a **single iPad**, played by **two teams**. Players first enter secret words/phrases into a shared “fishbowl”. The teams then play **three rounds** using the same fishbowl items:

1. **Describe**: describe without saying the word/phrase.
2. **Charades**: act it out.
3. **One-word clue**: give a single-word clue.

Each correctly guessed item is **1 point**. Scores are cumulative across rounds and shown at the end (ties allowed).

## 2) Platform & constraints (Web app + PWA)
- **Device**: iPad (single device, passed between teams/players).
- **Delivery**: web app that can be installed as a **PWA** (“Add to Home Screen”).
- **Connectivity**:
  - The app must work **offline after first successful load** (PWA cached assets + local data).
  - No accounts; no server required for gameplay.
- **Orientation**: supports **portrait and landscape**.
- **Screen sleep**:
  - The app must **attempt to keep the screen awake** during active turns (see §11.4).
  - If the platform doesn’t allow it, the app must show a clear in-app prompt/workaround.
- **Audio**:
  - “time’s up” plays a **buzzer sound for ~2 seconds**,
  - and a full-screen **Time’s Up** message appears until acknowledged.
  - Audio must be implemented in a way that works with common iPad browser gesture restrictions (see §11.5).

## 2.1) PWA installation (iPad)
The app should be installable to the iPad Home Screen via Safari:
- Open the app URL in Safari.
- Tap **Share** → **Add to Home Screen**.
- Launch from the Home Screen icon for a more app-like experience.

Notes:
- PWA/service worker features require the app to be served over **HTTPS** (not `file://`).
- Offline use requires at least one successful load while online (to populate the cache).

## 3) Glossary
- **Fishbowl item**: a submitted word/phrase (string) with an owner (player name) and originating team.
- **Turn**: one timed attempt by a team within a round.
- **Round**: one of the three phases (Describe / Charades / One-word clue) using the same set of fishbowl items.
- **Primary pool**: the current set of items eligible to be served (initially “unpassed” items).
- **Deferred pool**: items that have been passed (not served again until primary pool is empty).

## 4) Game rules (high-level)
### 4.1 Teams
- Exactly **2 teams**.
- Host can provide custom team names, with a UI option to auto-fill suggested defaults (e.g., “Blue” / “Red”).

### 4.2 Players & entry
- Host enters an **exact player count** \(N\).
- Word entry is done player-by-player:
  - Player enters their **name**.
  - Player selects a **team** from the two configured team names.
    - Default team alternates A/B/A/B… based on entry order.
    - Player can override team selection (in case entry order differs).
  - Player enters **exactly 3** items (words/phrases).
  - On **Done**, entries are locked and the next player **cannot see** prior entries.
- The team of the **first** player to enter words **goes first** in Round 1.

### 4.3 Rounds and timers
There are exactly three rounds:
- **Round 1 (Describe)**: 30 seconds per turn (default).
- **Round 2 (Charades)**: 45 seconds per turn (default).
- **Round 3 (One-word clue)**: 45 seconds per turn (default).

**Carryover rule (between rounds only)**:
- If the final fishbowl item of the round is guessed **before time expires**, pause immediately and **record remaining time**.
- The **same team** that finished the round starts the next round and gets a special first turn with **starting time = recorded remaining time**.
- After that special first turn, all subsequent turns in that round use the **default** timer length. Carryover is **not reused** again within the same round.

### 4.4 Scoring
- **1 point per correctly guessed item**.
- Passing yields **0 points**.
- Score is cumulative across all rounds.
- Final results show:
  - points by round for each team (R1/R2/R3),
  - total points,
  - tie is allowed (no tie-break).

### 4.5 Passing
- Passes are **unlimited**.
- When an item is passed:
  - it is moved to the **deferred pool**, and
  - it will not be served again until the **primary pool** is empty.
- When the primary pool becomes empty, the deferred pool becomes the new primary pool in a **fresh random order**.

### 4.6 Word visibility (anti-peeking)
- During a turn, the current item is **hidden by default**.
- The clue-giver must **press and hold** to reveal the item.
  - When the finger lifts, the item becomes hidden again immediately.

### 4.7 Time expiry
- When time reaches 0:
  - show a full-screen **Time’s Up** screen,
  - play buzzer for ~2 seconds,
  - require acknowledgement (tap) to proceed to handoff.
- The item on screen at time expiry **stays unguessed** and remains in the pool (not auto-passed, not auto-guessed).

### 4.8 Undo
- Provide an **Undo** action during a turn.
- Undo reverts **only the last action** (Guessed or Pass), including:
  - reverting any score change,
  - restoring the item’s guessed/passed status,
  - restoring the item to the appropriate pool so it can be served again.
- Undo is intended to correct mis-taps; do not require complex multi-step undo history (but an action stack is recommended).

## 5) Content rules (word entry validation)
### 5.1 Allowed item format
- Items may be **multi-word phrases**.
- Each of the 3 items must have at least **2 letters** (after trimming whitespace).

### 5.2 Duplicate blocking
Duplicates are blocked globally across the entire fishbowl (across all players) using normalization:
- case-insensitive,
- trims and collapses whitespace,
- ignores punctuation (e.g., “Spider-Man” == “Spiderman”),

If a duplicate is detected, block saving that item and show a message like: “That phrase has already been entered.”

## 6) Word serving algorithm (deterministic behavior)
Represent remaining items for a round as two bags:
- `primary` (eligible now)
- `deferred` (passed)

At the start of each round:
- `primary` = all items (shuffled)
- `deferred` = empty

On **Pass**:
- move current item from `primary` into `deferred`
- serve next item from `primary` (if empty, refill from `deferred` as described below)

On **Guessed**:
- mark item guessed and remove it from the round’s remaining pools
- increment current team score for that round
- serve next item

Refill rule:
- when `primary` becomes empty and `deferred` is non-empty:
  - shuffle `deferred` into a new `primary`,
  - clear `deferred`,
  - continue serving from `primary`.

Round completion:
- when both `primary` and `deferred` are empty (all items guessed), the round ends immediately.

## 7) Turn order
- Turn order alternates between Team A and Team B.
- The team that starts Round 1 is the team of the first word-entry player.
- Between rounds: the team that finishes a round starts the next round (with carryover time as defined).

## 8) Screens & UX flows
### 8.1 Host setup screen
Inputs:
- Team A name (with suggested defaults / autofill)
- Team B name (with suggested defaults / autofill)
- Number of players (integer \(N\))
- (Optional) Timer lengths (pre-game only): R1 (default 30), R2 (default 60), R3 (default 60)

Actions:
- Start word entry

Constraints:
- Team names editable **only before** the game starts.
- Timer lengths adjustable **only before** the game starts.

### 8.2 Word entry screen (repeated N times)
UI:
- Player name input
- Team picker (Team A / Team B)
  - default alternates each player entry
  - can be changed manually
- 3 item inputs (exactly 3 required)
  - validate min length and duplicates

Actions:
- Done (locks entries for this player)

After Done:
- show **handoff screen**: “Pass to next player” (no prior items visible)

After the Nth player Done:
- transition to “Ready to play” screen

### 8.3 Ready to play screen
Show:
- Team names
- Total items in fishbowl (should be \(N \times 3\))
- Confirm which team starts Round 1

Actions:
- Start Round 1

### 8.4 Turn handoff screen (between all turns)
Full-screen message:
- “Pass to **Team X**”
- “Tap when ready” (prevents accidental peeking)

Action:
- Proceed to turn start screen

### 8.5 Turn start screen
Show:
- Round name (Describe / Charades / One-word clue)
- Team whose turn it is
- Turn timer length (default or carryover)

Action:
- Big “Start turn” button (timer starts only after tapping)

### 8.6 Active turn gameplay screen
Must include:
- Countdown timer
- Hidden item area with instruction: “Press and hold to reveal”
- Buttons:
  - **Guessed** (increments score; serves next item)
  - **Pass** (defers item; serves next item)
  - **Undo** (reverts last action)

Notes:
- Word display must hide immediately when press-and-hold ends.

### 8.7 Time’s Up screen
Show:
- “Time’s Up”
- Current round + team
- Prompt to continue (tap)

Behavior:
- Buzzer plays for ~2 seconds
- Timer stops; do not modify current item status (stays unguessed)

Action:
- Continue → show Turn handoff screen for the next team (or round completion screen if the round ended exactly as time expired after a guess).

### 8.8 Round complete screen (end of R1, end of R2, end of R3)
Show:
- “Round X complete”
- List of all fishbowl items (for this round) (words/phrases only)
- Current running score (Team A vs Team B)

Action:
- Start next round (or view final results at end of Round 3)

Special behavior:
- If carryover time exists, show: “Next round starts with **YY** seconds (carryover) for Team X.”

### 8.9 Final results screen (end of Round 3)
Show:
- Winner (or “Tie”)
- Score breakdown:
  - Round 1: Team A / Team B
  - Round 2: Team A / Team B
  - Round 3: Team A / Team B
  - Total: Team A / Team B
- Event log (see §9)
- Fishbowl items with ownership: “item → entered by Player Name”

Actions:
- New game (reset to host setup)

## 9) Event log requirements
Maintain a simple, append-only event log to show in final results:
- Events: `WORD_GUESSED`, `WORD_PASSED`, `UNDO`, `ROUND_STARTED`, `ROUND_COMPLETED`, `TURN_STARTED`, `TIME_UP`
- Each event should record at minimum:
  - timestamp (local)
  - round (1/2/3)
  - team (A/B)
  - word id + display text (for word events)
  - points delta (if any)

## 10) Data model (suggested)
### 10.1 Entities
- `Team`: `{ id: "A"|"B", name: string }`
- `Player`: `{ id, name: string, teamId: "A"|"B", entryIndex: number }`
- `FishbowlItem`: `{ id, text: string, normalizedText: string, ownerPlayerId: string }`
- `GameState`:
  - teams
  - players (N)
  - items (N*3)
  - currentRound (1..3)
  - currentTeamTurn ("A"|"B")
  - timerSecondsRemaining
  - carryoverSecondsForNextRound? (nullable)
  - per-round scores: `{ round1: {A,B}, round2: {A,B}, round3: {A,B} }`
  - pools for current round: `primaryItemIds[]`, `deferredItemIds[]`
  - lastAction stack for undo (at least 1 deep)
  - eventLog[]

### 10.2 Persistence
- Persist game state locally so accidental app backgrounding doesn’t lose the game.
- No cloud sync required.

## 11) Implementation notes (recommended, Web/PWA)
These are non-binding recommendations to accelerate implementation and avoid common iPad pitfalls.

### 11.1 Tech stack (Web/PWA)
- **App type**: static single-page app (SPA) with an offline-capable service worker.
- **Suggested stack**: TypeScript + React (or similar) + Vite, but the spec is stack-agnostic.
- **Architecture**: a single source-of-truth `GameState` plus pure reducer-style transitions (Pass/Guessed/Undo/NextTurn).
- **Randomness**: use a standard shuffle (e.g., Fisher–Yates) and implement pass/defer rules exactly as defined in §6.

### 11.2 Local persistence (offline)
- **Persistence options**:
  - Prefer **IndexedDB** for `GameState` + event log (robust for larger payloads).
  - `localStorage` is acceptable for small settings (team names, timer defaults), but not ideal for the whole game state.
- **When to save**: on every state transition (Guessed/Pass/Undo/StartTurn/TimeUp/RoundComplete) and on page lifecycle events.
- **Recovery**: on load, offer “Resume game” if an in-progress game exists.
- **Export (optional, nice-to-have)**: a “Export game” JSON button for backup/debugging.

### 11.3 Timer implementation
- Use a monotonic-time based approach: store `turnEndTimestamp` and derive remaining seconds from `performance.now()` / a monotonic clock, rather than decrementing a counter each second.
- Ensure correctness across:
  - brief backgrounding / app switching,
  - orientation changes,
  - system hiccups (avoid timer drift).
- On “Start turn”, begin countdown; on “Time’s Up”, freeze and require acknowledgement.
- Handle `visibilitychange` (e.g., if the page is backgrounded during a turn): pause UI updates and re-derive time on resume.

### 11.4 Prevent screen sleep
- Attempt to keep the screen awake during active turns:
  - Use the **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) when available.
  - Re-request wake lock after `visibilitychange` when returning to the app.
- If wake lock isn’t available (common on some iPadOS/Safari versions), show an in-app prompt such as:
  - “To prevent the screen from dimming: temporarily set iPad **Auto-Lock** to **Never** for the game, or use **Guided Access**.”
  - (The app should not require iOS version knowledge; it should detect capability at runtime.)

### 11.5 Audio (“Time’s Up” buzzer)
- Implement buzzer audio in a way compatible with iOS gesture restrictions:
  - Initialize/unlock audio on a user gesture (e.g., the first “Start turn” tap) so later playback is reliable.
  - Use Web Audio API and/or an `<audio>` element with a bundled sound asset.
- Play for ~2 seconds; do not require a mute toggle.
- Acknowledgement tap should stop playback immediately (even if the 2 seconds hasn’t elapsed).

### 11.6 Press-and-hold reveal
- Implement as a press-and-hold gesture that shows the word only while pressed.
- When the touch ends/cancels, immediately hide the word.
- Make sure it works reliably with:
  - both orientations,
  - large text,
  - accidental scroll/taps (avoid revealing via simple tap).

### 11.7 Accessibility & robustness
- Support Dynamic Type (large text) for team names, timer, and the word reveal.
- Ensure good contrast in “Time’s Up” and “Pass to Team X” screens.
- Avoid exposing prior entries during word-entry; consider a “privacy blur” when app goes to background.

## 12) Host/admin controls
Provide a “Host menu” (not during an active timed turn) with:
- Restart game (back to host setup; clears all data)
- Restart current round (keeps the same fishbowl items; resets the round’s remaining pools to “all items unguessed”, resets timer defaults; scores for other rounds remain, but the restarted round’s score is reset)
- Edit team names (allowed **only before** game start)
- Adjust timer lengths (allowed **only before** game start)

All destructive actions should require confirmation.

## 13) Acceptance criteria (must-haves)
- Players can enter exactly 3 items each; duplicates blocked via normalization.
- Next player cannot see previous entries; a pass-to-next-player screen exists.
- 2-team gameplay with alternating turns; first-entry team starts Round 1.
- Three rounds with timers 30/60/60; carryover time used only for next round’s first turn by the same team, then defaults.
- Pass defers items until all other remaining items have been cycled; then passed items resume in a fresh random order.
- Word is hidden unless press-and-hold; releasing hides immediately.
- Time’s Up shows full-screen and plays a 2s buzzer; current item remains unguessed.
- Undo reverts last guess/pass including score and pool state.
- After each round: show item list and running score.
- Final screen: per-round breakdown + total + log + ownership list.
- During active turns, the app attempts to prevent screen sleep (wake lock where available) and otherwise provides an in-app workaround prompt.

## 14) Hosting & deployment (free, automated)
Recommended: **GitHub Pages** with automated deploys from `main` to a `gh-pages` branch via GitHub Actions.

### 14.1 Workflow
This repo includes a ready-to-use workflow:
- `.github/workflows/deploy-gh-pages.yml`

It assumes:
- Node-based web app with `npm ci`
- A build script at `npm run build`
- Build output written to `./dist` (Vite default)

If the implementation uses a different output folder (e.g., `build/`), update `publish_dir`.

### 14.2 One-time GitHub repo settings
In the GitHub repo:
- Settings → Pages
  - Source: **Deploy from a branch**
  - Branch: **gh-pages** (root)

After the first successful workflow run, GitHub will provide a Pages URL (HTTPS).

### 14.3 SPA/PWA path considerations (important)
GitHub Pages hosts under a sub-path (e.g., `/<repo>/`). The implementation must account for this:
- Configure the app’s **base path** appropriately (framework-specific; e.g., Vite `base: '/<repo>/'`).
- Ensure `manifest.webmanifest` uses correct paths.
- Ensure service worker caching is compatible with the base path.
- For client-side routing, either:
  - avoid path-based routing (use a single screen with internal state), or
  - implement a Pages-compatible fallback (commonly duplicating `index.html` as `404.html`).

### 14.4 Installation on iPad
Once deployed:
- Open the Pages URL in iPad Safari.
- Share → **Add to Home Screen**.
- Launch from Home Screen for the PWA-like experience.

